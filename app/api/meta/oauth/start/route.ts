import { callbackUrl, createOauthState, homeRedirect, metaConfig, oauthCookie, randomToken } from "@/lib/meta-oauth";

export async function GET(request: Request) {
  const { appId, appSecret, configurationId, version } = metaConfig();
  if (!appId || !appSecret) return Response.redirect(homeRedirect(request, "setup_required"), 302);

  const requestUrl = new URL(request.url); const workspaceId = Number(requestUrl.searchParams.get("workspaceId") || 1);
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) return Response.json({ error: "Invalid workspace" }, { status: 400 });

  const browserNonce = randomToken(); const redirectUri = callbackUrl(request); const state = await createOauthState(workspaceId, browserNonce, appSecret);
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", state });
  if (configurationId) { params.set("config_id", configurationId); params.set("override_default_response_type", "true"); }
  else params.set("scope", "public_profile,ads_read,business_management");

  const response = Response.redirect(`https://www.facebook.com/${version}/dialog/oauth?${params}`, 302);
  response.headers.append("set-cookie", oauthCookie(browserNonce, request));
  response.headers.set("cache-control", "no-store");
  return response;
}
