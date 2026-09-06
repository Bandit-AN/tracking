import { canAccessWorkspace, canEdit, getAuthenticatedUser } from "@/lib/auth";
import { exchangeWhopCode, listWhopAccounts, readWhopCookie, verifyWhopState, whopCallbackUrl, whopConfig, whopHomeRedirect, whopOauthCookie } from "@/lib/whop-oauth";
import { getWhopOauthSession, saveWhopConnection, saveWhopOauthSession } from "@/lib/whop-store";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request.headers); if (!user) return Response.redirect(new URL("/login", request.url), 302); if (!canEdit(user)) return Response.redirect(whopHomeRedirect(request, "error", "forbidden"), 302);
  const url = new URL(request.url); if (url.searchParams.get("error")) return Response.redirect(whopHomeRedirect(request, "cancelled"), 302);
  const code = url.searchParams.get("code") ?? ""; const combinedState = url.searchParams.get("state") ?? ""; const parts = combinedState.split("."); const flowId = parts.pop() ?? ""; const signedState = parts.join(".");
  const config = whopConfig(); const verified = config.tokenSecret ? await verifyWhopState(signedState, config.tokenSecret) : null; const session = await getWhopOauthSession(flowId); const cookieNonce = readWhopCookie(request);
  if (!code || !verified || !session || !cookieNonce || verified.browserNonce !== cookieNonce || session.browserNonce !== cookieNonce || session.workspaceId !== verified.workspaceId) return Response.redirect(whopHomeRedirect(request, "error", "invalid_state"), 302);
  if (!canAccessWorkspace(user, session.workspaceId)) return Response.redirect(whopHomeRedirect(request, "error", "forbidden"), 302);
  try {
    const token = await exchangeWhopCode(code, whopCallbackUrl(request), session.codeVerifier); const accounts = await listWhopAccounts(token.accessToken); if (!accounts.length) return Response.redirect(whopHomeRedirect(request, "error", "no_accounts"), 302);
    if (accounts.length === 1) { await saveWhopConnection({ workspaceId: session.workspaceId, accountId: accounts[0].id, accountName: accounts[0].name, accessToken: token.accessToken, refreshToken: token.refreshToken, tokenExpiresAt: token.expiresAt }); const response = Response.redirect(whopHomeRedirect(request, "connected"), 302); response.headers.append("set-cookie", whopOauthCookie("", request, 0)); return response; }
    await saveWhopOauthSession({ ...session, accessToken: token.accessToken, refreshToken: token.refreshToken, tokenExpiresAt: token.expiresAt, accounts, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }); const selection = new URL("/whop/select", url.origin); selection.searchParams.set("flow", flowId); return Response.redirect(selection, 302);
  } catch (error) { console.error("Whop OAuth callback failed", error instanceof Error ? error.message : "Unknown error"); return Response.redirect(whopHomeRedirect(request, "error", "oauth_failed"), 302); }
}
