import type { MetaAdAccount } from "@/lib/meta-store";

export const META_OAUTH_COOKIE = "moonrift_meta_oauth";

export function metaConfig() {
  return {
    appId: process.env.META_APP_ID ?? "",
    appSecret: process.env.META_APP_SECRET ?? "",
    configurationId: process.env.META_LOGIN_CONFIG_ID ?? "",
    version: process.env.META_GRAPH_API_VERSION || "v25.0",
  };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToText(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(Array.from(atob(normalized), (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false; let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export function randomToken(bytes = 24) { return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes))); }

export async function createOauthState(workspaceId: number, browserNonce: string, secret: string) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ workspaceId, browserNonce, expiresAt: Date.now() + 10 * 60 * 1000 })));
  return `${payload}.${await signature(payload, secret)}`;
}

export async function verifyOauthState(state: string, secret: string) {
  const [payload, suppliedSignature] = state.split("."); if (!payload || !suppliedSignature) return null;
  if (!secureEqual(await signature(payload, secret), suppliedSignature)) return null;
  try {
    const parsed = JSON.parse(base64UrlToText(payload)) as { workspaceId: number; browserNonce: string; expiresAt: number };
    return parsed.workspaceId > 0 && parsed.browserNonce && parsed.expiresAt > Date.now() ? parsed : null;
  } catch { return null; }
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export function oauthCookie(value: string, request: Request, maxAge = 600) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${META_OAUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function callbackUrl(request: Request) { return `${new URL(request.url).origin}/api/meta/oauth/callback`; }

async function graphTokenRequest(params: URLSearchParams) {
  const { version } = metaConfig();
  const response = await fetch(`https://graph.facebook.com/${version}/oauth/access_token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" }, body: params, cache: "no-store" });
  const result = await response.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!response.ok || !result.access_token) throw new Error(result.error?.message || "Meta token exchange failed");
  return result;
}

export async function exchangeOauthCode(code: string, redirectUri: string) {
  const { appId, appSecret } = metaConfig();
  const shortLived = await graphTokenRequest(new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }));
  return graphTokenRequest(new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortLived.access_token! }));
}

async function appSecretProof(accessToken: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken)));
  return Array.from(signed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const { appSecret, version } = metaConfig();
  const params = new URLSearchParams({ fields: "id,name,account_status,currency,timezone_name", limit: "200", appsecret_proof: await appSecretProof(accessToken, appSecret) });
  const response = await fetch(`https://graph.facebook.com/${version}/me/adaccounts?${params}`, { cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
  const result = await response.json() as { data?: MetaAdAccount[]; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || "Meta ad accounts could not be loaded");
  return result.data ?? [];
}

export function homeRedirect(request: Request, status: string, reason?: string) {
  const url = new URL("/", new URL(request.url).origin); url.searchParams.set("meta", status); if (reason) url.searchParams.set("reason", reason); return url;
}
