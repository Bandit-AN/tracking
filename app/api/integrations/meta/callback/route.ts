import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { metaConnections, metaOauthStates } from "@/db/schema";
import {
  encryptMetaToken,
  exchangeMetaCode,
  getMetaProfile,
  listMetaAdAccounts,
  metaCallbackUrl,
  metaStateHash,
} from "@/lib/meta";

function dashboardRedirect(request: Request, workspaceId: number, result: string) {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("workspaceId", String(workspaceId));
  url.searchParams.set("tab", "Settings");
  url.searchParams.set("meta", result);
  return Response.redirect(url);
}

export async function GET(request: Request) {
  // The portal session cookie is SameSite=Strict and is intentionally absent
  // on Meta's cross-site redirect. The random, one-time database state binds
  // this callback to the initiating administrator and workspace instead.
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (!state) return dashboardRedirect(request, 0, "invalid_state");
  const hash = metaStateHash(state);
  const [oauthState] = await getDb()
    .select()
    .from(metaOauthStates)
    .where(
      and(
        eq(metaOauthStates.stateHash, hash),
        gt(metaOauthStates.expiresAt, new Date()),
      ),
    )
    .limit(1);
  await getDb().delete(metaOauthStates).where(eq(metaOauthStates.stateHash, hash));
  if (!oauthState) return dashboardRedirect(request, 0, "invalid_state");
  if (url.searchParams.get("error")) {
    return dashboardRedirect(request, oauthState.workspaceId, "cancelled");
  }
  const code = url.searchParams.get("code");
  if (!code) return dashboardRedirect(request, oauthState.workspaceId, "failed");

  try {
    const callback = metaCallbackUrl(url.origin);
    const { token, expiresAt } = await exchangeMetaCode(code, callback);
    const [profile, accounts] = await Promise.all([
      getMetaProfile(token),
      listMetaAdAccounts(token),
    ]);
    const activeAccounts = accounts.filter(
      (account) => account.account_status === undefined || account.account_status === 1,
    );
    const selected = activeAccounts.length === 1 ? activeAccounts[0] : null;
    await getDb()
      .insert(metaConnections)
      .values({
        workspaceId: oauthState.workspaceId,
        connectedByUserId: oauthState.userId,
        metaUserId: profile.id,
        metaUserName: profile.name || "Meta user",
        accessTokenEncrypted: encryptMetaToken(token),
        tokenExpiresAt: expiresAt,
        adAccountId: selected?.id.replace(/^act_/, "") ?? null,
        adAccountName: selected?.name ?? "",
        currency: selected?.currency || "USD",
        status: selected ? "active" : "connected",
        lastError: null,
      })
      .onConflictDoUpdate({
        target: metaConnections.workspaceId,
        set: {
          connectedByUserId: oauthState.userId,
          metaUserId: profile.id,
          metaUserName: profile.name || "Meta user",
          accessTokenEncrypted: encryptMetaToken(token),
          tokenExpiresAt: expiresAt,
          adAccountId: selected?.id.replace(/^act_/, "") ?? null,
          adAccountName: selected?.name ?? "",
          currency: selected?.currency || "USD",
          status: selected ? "active" : "connected",
          lastError: null,
          updatedAt: new Date(),
        },
      });
    return dashboardRedirect(
      request,
      oauthState.workspaceId,
      selected ? "connected" : "select_account",
    );
  } catch {
    return dashboardRedirect(request, oauthState.workspaceId, "failed");
  }
}
