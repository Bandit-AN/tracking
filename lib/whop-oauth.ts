import type { WhopAccount } from "@/lib/whop-store";

export const WHOP_OAUTH_COOKIE = "moonrift_whop_oauth";
const OAUTH_BASE = "https://api.whop.com/oauth";
const API_BASE = "https://api.whop.com/api/v1";

export function whopConfig() {
  return {
    appId: process.env.WHOP_APP_ID?.trim() ?? "",
    tokenSecret: process.env.WHOP_TOKEN_ENCRYPTION_KEY?.trim() ?? "",
    apiVersion: process.env.WHOP_API_VERSION_DATE?.trim() || "2026-09-04",
    timeZone: process.env.WHOP_REPORT_TIME_ZONE?.trim() || "America/Los_Angeles",
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
  if (left.length !== right.length) return false; let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function randomWhopToken(bytes = 32) { return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes))); }

export async function whopPkceChallenge(verifier: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export async function createWhopState(workspaceId: number, browserNonce: string, secret: string) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ workspaceId, browserNonce, expiresAt: Date.now() + 10 * 60 * 1000 })));
  return `${payload}.${await signature(payload, secret)}`;
}

export async function verifyWhopState(state: string, secret: string) {
  const [payload, supplied, ...extra] = state.split(".");
  if (!payload || !supplied || extra.length || !secureEqual(await signature(payload, secret), supplied)) return null;
  try {
    const parsed = JSON.parse(base64UrlToText(payload)) as { workspaceId: number; browserNonce: string; expiresAt: number };
    return parsed.workspaceId > 0 && parsed.browserNonce && parsed.expiresAt > Date.now() ? parsed : null;
  } catch { return null; }
}

export function readWhopCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${WHOP_OAUTH_COOKIE}=`))?.slice(WHOP_OAUTH_COOKIE.length + 1) ?? "";
}

export function whopOauthCookie(value: string, request: Request, maxAge = 600) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${WHOP_OAUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function whopCallbackUrl(request: Request) {
  const appUrl = process.env.APP_URL?.trim();
  return new URL("/api/whop/oauth/callback", appUrl || new URL(request.url).origin).toString();
}

export function whopHomeRedirect(request: Request, status: string, reason?: string) {
  const url = new URL("/", new URL(request.url).origin); url.searchParams.set("whop", status); if (reason) url.searchParams.set("reason", reason); return url;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(`${OAUTH_BASE}/token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(result.error_description || result.error || "Whop token exchange failed");
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: new Date(Date.now() + Math.max(60, result.expires_in || 3600) * 1000).toISOString() };
}

export function exchangeWhopCode(code: string, redirectUri: string, codeVerifier: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: whopConfig().appId, code_verifier: codeVerifier });
}

export function refreshWhopToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: whopConfig().appId });
}

async function whopApi<T>(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`${API_BASE}/${path}`); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: "no-store", headers: { authorization: `Bearer ${accessToken}`, "api-version-date": whopConfig().apiVersion } });
  const result = await response.json() as T & { error?: { message?: string } | string };
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : result.error?.message || "Whop API request failed");
  return result;
}

export async function listWhopAccounts(accessToken: string) {
  const accounts: WhopAccount[] = []; let after = "";
  for (let page = 0; page < 20; page++) {
    const result = await whopApi<{ data?: Array<{ id: string; title?: string; name?: string; status?: string }>; page_info?: { has_next_page?: boolean; end_cursor?: string } }>("accounts", accessToken, { first: "100", ...(after ? { after } : {}) });
    accounts.push(...(result.data ?? []).map((account) => ({ id: account.id, name: account.title || account.name || account.id, status: account.status || "active" })));
    if (!result.page_info?.has_next_page) return accounts;
    after = result.page_info.end_cursor || ""; if (!after) break;
  }
  return accounts;
}

export type WhopCampaign = { id: string; title?: string; status?: string; spend?: number; spend_currency?: string; impressions?: number; reach?: number; clicks?: number; leads?: number; submitted_applications?: number; purchases?: number; purchase_value?: number; results?: number };

export async function fetchWhopCampaigns(accessToken: string, accountId: string, since: string, until: string) {
  const campaigns: WhopCampaign[] = []; let after = "";
  for (let page = 0; page < 30; page++) {
    const result = await whopApi<{ data?: WhopCampaign[]; page_info?: { has_next_page?: boolean; end_cursor?: string } }>("ad_campaigns", accessToken, { account_id: accountId, stats_from: since, stats_to: until, time_zone: whopConfig().timeZone, attribution_model: "last_touch", first: "100", ...(after ? { after } : {}) });
    campaigns.push(...(result.data ?? []));
    if (!result.page_info?.has_next_page) return campaigns;
    after = result.page_info.end_cursor || ""; if (!after) break;
  }
  return campaigns;
}

export async function revokeWhopToken(refreshToken: string) {
  await fetch(`${OAUTH_BASE}/revoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: refreshToken, client_id: whopConfig().appId }), cache: "no-store" }).catch(() => undefined);
}
