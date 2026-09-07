import { canAccessWorkspace, canEdit, forbiddenResponse, getAuthenticatedUser } from "@/lib/auth";
import { createWhopState, randomWhopToken, whopCallbackUrl, whopConfig, whopOauthCookie, whopPkceChallenge, whopHomeRedirect } from "@/lib/whop-oauth";
import { saveWhopOauthSession } from "@/lib/whop-store";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request.headers); if (!user) return Response.redirect(new URL("/login", request.url), 302); if (!canEdit(user)) return forbiddenResponse();
  const config = whopConfig(); if (!config.appId || config.tokenSecret.length < 32) return Response.redirect(whopHomeRedirect(request, "setup_required"), 302);
  const workspaceId = Number(new URL(request.url).searchParams.get("workspaceId") || 1); if (!Number.isSafeInteger(workspaceId) || workspaceId < 1 || !canAccessWorkspace(user, workspaceId)) return forbiddenResponse();
  const browserNonce = randomWhopToken(); const verifier = randomWhopToken(48); const flowId = randomWhopToken(); const state = await createWhopState(workspaceId, browserNonce, config.tokenSecret);
  await saveWhopOauthSession({ id: flowId, workspaceId, browserNonce, codeVerifier: verifier, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  const params = new URLSearchParams({ client_id: config.appId, redirect_uri: whopCallbackUrl(request), response_type: "code", scope: "openid profile email stats:read ad_campaign:basic:read", state: `${state}.${flowId}`, nonce: browserNonce, code_challenge: await whopPkceChallenge(verifier), code_challenge_method: "S256" });
  return new Response(null, { status: 302, headers: { location: `https://api.whop.com/oauth/authorize?${params}`, "set-cookie": whopOauthCookie(browserNonce, request), "cache-control": "no-store" } });
}
