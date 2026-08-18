import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { metaAdInsights, metaConnections } from "@/db/schema";
import {
  canAccessWorkspace,
  requireAdmin,
  requireApiUser,
} from "@/lib/auth/authorization";
import {
  decryptMetaToken,
  listMetaAdAccounts,
  metaIsConfigured,
  saveSelectedMetaAccount,
  syncMetaAdsForWorkspace,
} from "@/lib/meta";

const workspaceInput = z.object({ workspaceId: z.number().int().positive() });
const accountInput = workspaceInput.extend({
  adAccountId: z.string().trim().regex(/^(act_)?\d+$/),
});

type AdminWorkspaceResult =
  | { response: Response }
  | { workspaceId: number; raw: unknown };

async function adminWorkspace(
  request: Request,
  body = false,
): Promise<AdminWorkspaceResult> {
  const authResult = await requireApiUser();
  if ("response" in authResult && authResult.response) {
    return { response: authResult.response };
  }
  const denied = requireAdmin(authResult.context);
  if (denied) return { response: denied } as const;
  const raw = body
    ? await request.json()
    : { workspaceId: Number(new URL(request.url).searchParams.get("workspaceId")) };
  const parsed = workspaceInput.safeParse(raw);
  if (!parsed.success) {
    return { response: Response.json({ error: "Invalid workspace" }, { status: 400 }) } as const;
  }
  if (!(await canAccessWorkspace(authResult.context, parsed.data.workspaceId))) {
    return { response: Response.json({ error: "Workspace not found" }, { status: 404 }) } as const;
  }
  return { workspaceId: parsed.data.workspaceId, raw };
}

export async function GET(request: Request) {
  const access = await adminWorkspace(request);
  if ("response" in access) return access.response;
  if (!metaIsConfigured()) {
    return Response.json({ configured: false, connected: false, accounts: [] });
  }
  const [connection] = await getDb()
    .select({
      workspaceId: metaConnections.workspaceId,
      metaUserName: metaConnections.metaUserName,
      accessTokenEncrypted: metaConnections.accessTokenEncrypted,
      tokenExpiresAt: metaConnections.tokenExpiresAt,
      adAccountId: metaConnections.adAccountId,
      adAccountName: metaConnections.adAccountName,
      currency: metaConnections.currency,
      status: metaConnections.status,
      lastSyncedAt: metaConnections.lastSyncedAt,
      lastError: metaConnections.lastError,
    })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, access.workspaceId))
    .limit(1);
  if (!connection) {
    return Response.json({ configured: true, connected: false, accounts: [] });
  }
  try {
    const accounts = await listMetaAdAccounts(
      decryptMetaToken(connection.accessTokenEncrypted),
    );
    return Response.json({
      configured: true,
      connected: true,
      connection: { ...connection, accessTokenEncrypted: undefined },
      accounts: accounts.map((account) => ({
        id: account.id.replace(/^act_/, ""),
        name: account.name,
        status: account.account_status,
        currency: account.currency || "USD",
        timezone: account.timezone_name || "",
        businessName: account.business?.name || "",
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Meta connection failed.";
    await getDb()
      .update(metaConnections)
      .set({ status: "error", lastError: message, updatedAt: new Date() })
      .where(eq(metaConnections.workspaceId, access.workspaceId));
    return Response.json({
      configured: true,
      connected: true,
      connection: { ...connection, accessTokenEncrypted: undefined, status: "error", lastError: message },
      accounts: [],
    });
  }
}

export async function PATCH(request: Request) {
  const access = await adminWorkspace(request, true);
  if ("response" in access) return access.response;
  const parsed = accountInput.safeParse(access.raw);
  if (!parsed.success) {
    return Response.json({ error: "Select a valid Meta ad account" }, { status: 400 });
  }
  const [connection] = await getDb()
    .select({ token: metaConnections.accessTokenEncrypted })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, access.workspaceId))
    .limit(1);
  if (!connection) return Response.json({ error: "Connect Meta first" }, { status: 409 });
  try {
    const accounts = await listMetaAdAccounts(decryptMetaToken(connection.token));
    const account = accounts.find(
      (item) => item.id.replace(/^act_/, "") === parsed.data.adAccountId.replace(/^act_/, ""),
    );
    if (!account) return Response.json({ error: "Ad account is not authorized" }, { status: 403 });
    await saveSelectedMetaAccount(access.workspaceId, account);
    const sync = await syncMetaAdsForWorkspace(access.workspaceId, 90);
    return Response.json({ ok: true, ...sync });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Meta account could not be saved" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const access = await adminWorkspace(request, true);
  if ("response" in access) return access.response;
  try {
    return Response.json({ ok: true, ...(await syncMetaAdsForWorkspace(access.workspaceId, 90)) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Meta sync failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await adminWorkspace(request, true);
  if ("response" in access) return access.response;
  await getDb().delete(metaAdInsights).where(eq(metaAdInsights.workspaceId, access.workspaceId));
  await getDb().delete(metaConnections).where(eq(metaConnections.workspaceId, access.workspaceId));
  return Response.json({ ok: true });
}
