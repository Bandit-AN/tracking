import { callbackUrl, exchangeOauthCode, fetchMetaAdAccounts, homeRedirect, META_OAUTH_COOKIE, metaConfig, oauthCookie, randomToken, readCookie, verifyOauthState } from "@/lib/meta-oauth";
import { createMetaOauthSession, saveMetaConnection } from "@/lib/meta-store";

export async function GET(request: Request) {
  const url = new URL(request.url); const { appSecret } = metaConfig();
  if (url.searchParams.get("error")) return Response.redirect(homeRedirect(request, "cancelled"), 302);
  const code = url.searchParams.get("code") ?? ""; const state = url.searchParams.get("state") ?? "";
  const verified = appSecret ? await verifyOauthState(state, appSecret) : null; const cookieNonce = readCookie(request, META_OAUTH_COOKIE);
  if (!code || !verified || !cookieNonce || verified.browserNonce !== cookieNonce) return Response.redirect(homeRedirect(request, "error", "invalid_state"), 302);

  try {
    const token = await exchangeOauthCode(code, callbackUrl(request)); const accounts = await fetchMetaAdAccounts(token.access_token!);
    if (!accounts.length) return Response.redirect(homeRedirect(request, "error", "no_ad_accounts"), 302);
    if (accounts.length === 1) {
      await saveMetaConnection(verified.workspaceId, accounts[0].id, token.access_token!);
      const response = Response.redirect(homeRedirect(request, "connected"), 302); response.headers.append("set-cookie", oauthCookie("", request, 0)); return response;
    }

    const flowId = randomToken(32);
    await createMetaOauthSession({ id: flowId, workspaceId: verified.workspaceId, browserNonce: cookieNonce, accessToken: token.access_token!, accounts, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    const selection = new URL("/meta/select", url.origin); selection.searchParams.set("flow", flowId);
    return Response.redirect(selection, 302);
  } catch (error) {
    console.error("Meta OAuth callback failed", error instanceof Error ? error.message : "Unknown error");
    return Response.redirect(homeRedirect(request, "error", "oauth_failed"), 302);
  }
}
