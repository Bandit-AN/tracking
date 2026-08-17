import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { portalUsers, workspaceMembers } from "@/db/schema";
import {
  requireAdmin,
  requireApiUser,
} from "@/lib/auth/authorization";
import { auth } from "@/lib/auth/server";

type AuthAdminResult<T> = {
  data: T | null;
  error: { message?: string; status?: number } | null;
};

type AuthAdminApi = {
  createUser(input: {
    email: string;
    password: string;
    name: string;
    role: "admin" | "user";
  }): Promise<AuthAdminResult<{ user: { id: string } }>>;
  removeUser(input: { userId: string }): Promise<AuthAdminResult<unknown>>;
  setRole(input: {
    userId: string;
    role: "admin" | "user";
  }): Promise<AuthAdminResult<unknown>>;
  setUserPassword(input: {
    userId: string;
    newPassword: string;
  }): Promise<AuthAdminResult<unknown>>;
  banUser(input: { userId: string }): Promise<AuthAdminResult<unknown>>;
  unbanUser(input: { userId: string }): Promise<AuthAdminResult<unknown>>;
};

// Neon Auth exposes Better Auth's admin plugin. The patched Better Auth client
// intentionally narrows plugin discovery to `unknown`, so keep the small
// server-only surface we use explicitly typed here.
const authAdmin = auth.admin as unknown as AuthAdminApi;

const createUserInput = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
  role: z.enum(["admin", "team_member", "student"]),
  workspaceIds: z.array(z.number().int().positive()).max(100).default([]),
});

const updateUserInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "team_member", "student"]),
  status: z.enum(["active", "disabled"]),
  workspaceIds: z.array(z.number().int().positive()).max(100).default([]),
  newPassword: z.union([z.literal(""), z.string().min(12).max(128)]).optional(),
});

async function requireAdminRequest() {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult;
  const denied = requireAdmin(authResult.context);
  return denied ? { response: denied } : authResult;
}

export async function GET() {
  const authResult = await requireAdminRequest();
  if ("response" in authResult) return authResult.response;

  const rows = await getDb()
    .select({
      id: portalUsers.id,
      email: portalUsers.email,
      name: portalUsers.name,
      role: portalUsers.role,
      status: portalUsers.status,
      workspaceId: workspaceMembers.workspaceId,
      createdAt: portalUsers.createdAt,
    })
    .from(portalUsers)
    .leftJoin(workspaceMembers, eq(workspaceMembers.userId, portalUsers.id))
    .orderBy(portalUsers.name);

  const users = new Map<string, (typeof rows)[number] & { workspaceIds: number[] }>();
  for (const row of rows) {
    const existing = users.get(row.id);
    if (existing) {
      if (row.workspaceId) existing.workspaceIds.push(row.workspaceId);
    } else {
      users.set(row.id, {
        ...row,
        workspaceIds: row.workspaceId ? [row.workspaceId] : [],
      });
    }
  }
  return Response.json({ users: [...users.values()] });
}

export async function POST(request: Request) {
  const authResult = await requireAdminRequest();
  if ("response" in authResult) return authResult.response;

  const parsed = createUserInput.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid account", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const createdAuthUser = await authAdmin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
    role: parsed.data.role === "admin" ? "admin" : "user",
  });
  if (createdAuthUser.error || !createdAuthUser.data?.user) {
    return Response.json(
      { error: createdAuthUser.error?.message ?? "Identity account could not be created" },
      { status: createdAuthUser.error?.status || 502 },
    );
  }

  try {
    const [portalUser] = await getDb()
      .insert(portalUsers)
      .values({
        authUserId: createdAuthUser.data.user.id,
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
      })
      .returning({ id: portalUsers.id });

    if (parsed.data.workspaceIds.length) {
      await getDb()
        .insert(workspaceMembers)
        .values(
          parsed.data.workspaceIds.map((workspaceId) => ({
            workspaceId,
            userId: portalUser.id,
          })),
        )
        .onConflictDoNothing();
    }
    return Response.json({ ok: true, userId: portalUser.id }, { status: 201 });
  } catch (error) {
    await authAdmin.removeUser({ userId: createdAuthUser.data.user.id });
    throw error;
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireAdminRequest();
  if ("response" in authResult) return authResult.response;

  const parsed = updateUserInput.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid account update", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (
    parsed.data.userId === authResult.context.portalUser.id &&
    (parsed.data.status === "disabled" || parsed.data.role !== "admin")
  ) {
    return Response.json(
      { error: "You cannot disable or demote your own administrator account" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [existingUser] = await db
    .select({ id: portalUsers.id, authUserId: portalUsers.authUserId })
    .from(portalUsers)
    .where(eq(portalUsers.id, parsed.data.userId))
    .limit(1);
  if (!existingUser) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (existingUser.authUserId) {
    const roleResult = await authAdmin.setRole({
      userId: existingUser.authUserId,
      role: parsed.data.role === "admin" ? "admin" : "user",
    });
    if (roleResult.error) {
      return Response.json(
        { error: roleResult.error.message ?? "Identity role could not be updated" },
        { status: roleResult.error.status || 502 },
      );
    }

    const statusResult =
      parsed.data.status === "disabled"
        ? await authAdmin.banUser({ userId: existingUser.authUserId })
        : await authAdmin.unbanUser({ userId: existingUser.authUserId });
    if (statusResult.error) {
      return Response.json(
        { error: statusResult.error.message ?? "Identity status could not be updated" },
        { status: statusResult.error.status || 502 },
      );
    }

    if (parsed.data.newPassword) {
      const passwordResult = await authAdmin.setUserPassword({
        userId: existingUser.authUserId,
        newPassword: parsed.data.newPassword,
      });
      if (passwordResult.error) {
        return Response.json(
          { error: passwordResult.error.message ?? "Password could not be updated" },
          { status: passwordResult.error.status || 502 },
        );
      }
    }
  }

  const [user] = await db
    .update(portalUsers)
    .set({
      role: parsed.data.role,
      status: parsed.data.status,
      updatedAt: new Date(),
    })
    .where(eq(portalUsers.id, parsed.data.userId))
    .returning({ id: portalUsers.id });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  await db
    .delete(workspaceMembers)
    .where(eq(workspaceMembers.userId, parsed.data.userId));
  if (parsed.data.workspaceIds.length) {
    await db.insert(workspaceMembers).values(
      parsed.data.workspaceIds.map((workspaceId) => ({
        workspaceId,
        userId: parsed.data.userId,
      })),
    );
  }

  return Response.json({ ok: true });
}
