import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  portalUsers,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { auth } from "./server";

export type PortalRole = "admin" | "team_member" | "student";

export type PortalContext = {
  authUser: { id: string; email: string; name: string };
  portalUser: {
    id: string;
    email: string;
    name: string;
    role: PortalRole;
    status: "active" | "disabled";
  };
};

function bootstrapAdminEmails() {
  return new Set(
    (process.env.PORTAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getPortalContext(): Promise<PortalContext | null> {
  const { data } = await auth.getSession();
  const sessionUser = data?.user;
  if (!sessionUser?.id || !sessionUser.email) return null;

  const db = getDb();
  const email = sessionUser.email.trim().toLowerCase();
  let [portalUser] = await db
    .select()
    .from(portalUsers)
    .where(
      sql`${portalUsers.authUserId} = ${sessionUser.id} OR lower(${portalUsers.email}) = ${email}`,
    )
    .limit(1);

  // An email match is only used to bind a pre-created portal invitation once.
  // Never let a different identity replace an account that is already bound.
  if (portalUser?.authUserId && portalUser.authUserId !== sessionUser.id) {
    return null;
  }

  if (!portalUser && bootstrapAdminEmails().has(email)) {
    [portalUser] = await db
      .insert(portalUsers)
      .values({
        authUserId: sessionUser.id,
        email,
        name: sessionUser.name || email,
        role: "admin",
      })
      .onConflictDoUpdate({
        target: portalUsers.email,
        set: {
          authUserId: sessionUser.id,
          name: sessionUser.name || email,
          role: "admin",
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();
  } else if (portalUser && !portalUser.authUserId) {
    [portalUser] = await db
      .update(portalUsers)
      .set({ authUserId: sessionUser.id, updatedAt: new Date() })
      .where(eq(portalUsers.id, portalUser.id))
      .returning();
  }

  if (!portalUser || portalUser.status !== "active") return null;

  if (portalUser.role === "admin" && bootstrapAdminEmails().has(email)) {
    await db.execute(sql`
      UPDATE neon_auth."user"
      SET role = 'admin'
      WHERE id::text = ${sessionUser.id}
        AND role IS DISTINCT FROM 'admin'
    `);
  }

  return {
    authUser: {
      id: sessionUser.id,
      email,
      name: sessionUser.name || email,
    },
    portalUser: {
      id: portalUser.id,
      email: portalUser.email,
      name: portalUser.name,
      role: portalUser.role,
      status: portalUser.status,
    },
  };
}

export async function requirePortalPage() {
  const { data } = await auth.getSession();
  if (!data?.user) redirect("/auth/sign-in");

  const context = await getPortalContext();
  if (!context) redirect("/access-denied");
  return context;
}

export async function requireApiUser() {
  const { data } = await auth.getSession();
  if (!data?.user) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const context = await getPortalContext();
  if (!context) {
    return { response: Response.json({ error: "Portal access is not active" }, { status: 403 }) } as const;
  }

  return { context } as const;
}

export function requireAdmin(context: PortalContext) {
  if (context.portalUser.role !== "admin") {
    return Response.json({ error: "Administrator access required" }, { status: 403 });
  }
  return null;
}

export async function accessibleWorkspaceIds(context: PortalContext) {
  const db = getDb();
  if (context.portalUser.role === "admin") {
    return (await db.select({ id: workspaces.id }).from(workspaces)).map(
      (row) => row.id,
    );
  }

  return (
    await db
      .select({ id: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, context.portalUser.id))
  ).map((row) => row.id);
}

export async function canAccessWorkspace(
  context: PortalContext,
  workspaceId: number,
) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) return false;
  if (context.portalUser.role === "admin") return true;

  const db = getDb();
  const [membership] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, context.portalUser.id),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

export async function accessibleWorkspaces(context: PortalContext) {
  const ids = await accessibleWorkspaceIds(context);
  if (!ids.length) return [];
  return getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      avatar: workspaces.avatar,
      industry: workspaces.industry,
      initials: workspaces.initials,
      color: workspaces.color,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(inArray(workspaces.id, ids))
    .orderBy(workspaces.name);
}
