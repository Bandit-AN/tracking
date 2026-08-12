import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payouts, workspaces } from "@/db/schema";
import {
  accessibleWorkspaces,
  canAccessWorkspace,
  requireAdmin,
  requireApiUser,
} from "@/lib/auth/authorization";

const workspaceInput = z.object({
  workspaceId: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(120),
  avatar: z.string().trim().url().max(2000).or(z.literal("")).optional(),
  industry: z.string().trim().min(2).max(120).optional(),
  initials: z.string().trim().max(4).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sheetUrl: z
    .string()
    .trim()
    .url()
    .max(2000)
    .refine(
      (value) => new URL(value).hostname === "docs.google.com",
      "Only Google Sheets URLs are supported",
    )
    .or(z.literal(""))
    .optional(),
});

const payoutInput = z.object({
  workspaceId: z.number().int().positive(),
  member: z.string().trim().min(2).max(160),
  date: z.string().date(),
  method: z.string().trim().min(2).max(40),
  amount: z.number().positive().max(10_000_000),
});

async function syncWebhook(payload: Record<string, unknown>) {
  const webhook = process.env.GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL;
  if (!webhook || webhook === "[SENSITIVE]") return { configured: false, ok: false };
  try {
    return { configured: true, ok: (
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      })
    ).ok };
  } catch {
    return { configured: true, ok: false };
  }
}

export async function GET() {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;
  return Response.json({
    workspaces: await accessibleWorkspaces(authResult.context),
  });
}

export async function PATCH(request: Request) {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;
  const denied = requireAdmin(authResult.context);
  if (denied) return denied;

  const parsed = workspaceInput.safeParse(await request.json());
  if (!parsed.success || !parsed.data.workspaceId) {
    return Response.json(
      { error: "Invalid workspace", fields: parsed.error?.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { workspaceId, ...values } = parsed.data;
  const [workspace] = await getDb()
    .update(workspaces)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning({ id: workspaces.id });

  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;
  const denied = requireAdmin(authResult.context);
  if (denied) return denied;

  const raw = (await request.json()) as Record<string, unknown>;
  if (raw.kind === "workspace") {
    const parsed = workspaceInput.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid workspace", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const [workspace] = await getDb()
      .insert(workspaces)
      .values(parsed.data)
      .returning({ id: workspaces.id });
    return Response.json({ ok: true, workspace }, { status: 201 });
  }

  const parsed = payoutInput.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payout", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (!(await canAccessWorkspace(authResult.context, parsed.data.workspaceId))) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const [payout] = await getDb()
    .insert(payouts)
    .values({
      ...parsed.data,
      createdByUserId: authResult.context.portalUser.id,
    })
    .returning({ id: payouts.id });

  await getDb()
    .update(payouts)
    .set({ sourceKey: `app:${payout.id}`, updatedAt: new Date() })
    .where(eq(payouts.id, payout.id));

  const [workspace] = await getDb()
    .select({ name: workspaces.name, sheetUrl: workspaces.sheetUrl })
    .from(workspaces)
    .where(eq(workspaces.id, parsed.data.workspaceId))
    .limit(1);

  const [role, payee] = parsed.data.member.includes(":")
    ? parsed.data.member.split(":", 2)
    : ["Team", parsed.data.member];
  const sheetSync = await syncWebhook({
    action: "add",
    id: payout.id,
    workspaceId: parsed.data.workspaceId,
    workspaceName: workspace?.name,
    spreadsheetUrl: workspace?.sheetUrl,
    payee,
    role,
    date: parsed.data.date,
    method: parsed.data.method,
    amount: parsed.data.amount,
  });
  if (sheetSync.configured && !sheetSync.ok) {
    await getDb().delete(payouts).where(eq(payouts.id, payout.id));
    return Response.json(
      { error: "Payout was not saved because Google Sheets could not be updated" },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, payout, sheetSynced: sheetSync.ok }, { status: 201 });
}

export async function DELETE(request: Request) {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;
  const denied = requireAdmin(authResult.context);
  if (denied) return denied;

  const url = new URL(request.url);
  const workspaceId = Number(url.searchParams.get("workspaceId"));
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
    return Response.json({ error: "Invalid workspace" }, { status: 400 });
  }
  if (url.searchParams.get("kind") === "workspace") {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const confirmationOne = String(raw.confirmationOne || "");
    const confirmationTwo = String(raw.confirmationTwo || "");
    const [workspace] = await getDb()
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });
    if (confirmationOne !== workspace.name || confirmationTwo !== workspace.name) {
      return Response.json({ error: "Both confirmations must exactly match the subaccount name" }, { status: 400 });
    }
    await getDb().delete(workspaces).where(eq(workspaces.id, workspaceId));
    return Response.json({ ok: true });
  }
  const payoutId = Number(url.searchParams.get("payoutId"));
  if (!Number.isSafeInteger(payoutId) || payoutId <= 0) {
    return Response.json({ error: "Invalid payout" }, { status: 400 });
  }

  const removed = await getDb()
    .delete(payouts)
    .where(and(eq(payouts.id, payoutId), eq(payouts.workspaceId, workspaceId)))
    .returning({ id: payouts.id });
  if (!removed.length) {
    return Response.json({ error: "Payout not found" }, { status: 404 });
  }
  const sheetSync = await syncWebhook({ action: "delete", id: payoutId, workspaceId });
  return Response.json({ ok: true, sheetSynced: sheetSync.ok });
}
