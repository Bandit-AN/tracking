import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TEST_PASSWORD = "MoonRift-test-password";
const TEST_SALT = Buffer.from("moonrift-auth-test");
const TEST_HASH = pbkdf2Sync(TEST_PASSWORD, TEST_SALT, 100000, 32, "sha256");
const TEST_ENV = {
  MOONRIFT_AUTH_SECRET: "moonrift-test-session-secret-at-least-thirty-two-characters",
  MOONRIFT_AUTH_USERS: JSON.stringify([{ email: "peterphan441@gmail.com", displayName: "Peter Phan", role: "admin", workspaceIds: "all", passwordHash: `pbkdf2-sha256$100000$${TEST_SALT.toString("base64url")}$${TEST_HASH.toString("base64url")}` }]),
};

async function request(path = "/", init = {}, env = {}) {
  const previousEnv = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  try { return await worker.fetch(new Request(`http://localhost${path}`, { ...init, headers: { accept: "text/html", ...(init.headers ?? {}) }, redirect: "manual" }), { ...env, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} }); }
  finally { for (const [key, value] of previousEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test("server-renders the MoonRift dashboard shell", async () => {
  const response = await request("/", { headers: { "oai-authenticated-user-email": "peterphan441@gmail.com" } }); assert.equal(response.status, 200); assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>MoonRift/); assert.match(html, />MoonRift</); assert.match(html, />Dashboard</); assert.match(html, /Refresh data/); assert.match(html, /PAID AD METRICS/); assert.match(html, /WHOP ADS METRICS/); assert.match(html, /Connect Whop Ads/); assert.match(html, /Cash collected by lead source/); assert.match(html, /Message MoonRift Media/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("redirects anonymous visitors and rejects anonymous API requests", async () => {
  const page = await request(); assert.ok([302, 303, 307, 308].includes(page.status)); assert.equal(new URL(page.headers.get("location"), "http://localhost").pathname, "/login");
  const login = await request("/login"); assert.equal(login.status, 200); assert.match(await login.text(), /Sign in to MoonRift/);
  const api = await request("/api/workspaces?all=true", { headers: { accept: "application/json" } }); assert.equal(api.status, 401); assert.match(await api.text(), /Sign in required/);
  const whop = await request("/api/whop?workspaceId=1", { headers: { accept: "application/json" } }); assert.equal(whop.status, 401); assert.match(await whop.text(), /Sign in required/);
});

test("creates a signed session only for valid credentials", async () => {
  const invalid = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "peterphan441@gmail.com", password: "wrong" }) }, TEST_ENV);
  assert.equal(invalid.status, 401); assert.equal(invalid.headers.get("set-cookie"), null);
  const login = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "peterphan441@gmail.com", password: TEST_PASSWORD }) }, TEST_ENV);
  assert.equal(login.status, 200); const cookie = login.headers.get("set-cookie") ?? ""; assert.match(cookie, /moonrift_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
  const authenticated = await request("/api/workspaces?all=true", { headers: { accept: "application/json", cookie: cookie.split(";", 1)[0] } }, TEST_ENV);
  assert.equal(authenticated.status, 200);
});

test("keeps requested data integrations, views, and route protection in source", async () => {
  const [dashboard, sheets, meta, support, metaStart, metaCallback, metaStore, metaSelect, whop, whopStart, whopCallback, whopStore, auth] = await Promise.all([
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/support/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/oauth/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/oauth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meta-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/meta/select/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/whop/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/whop/oauth/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/whop/oauth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/whop-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /Close rate/); assert.match(dashboard, /Application → booking/); assert.match(dashboard, /CRM ROAS/); assert.match(dashboard, /Agency Inbox/); assert.match(dashboard, /Co-owner/);
  assert.match(sheets, /Payouts/); assert.match(sheets, /Booked Calls/); assert.match(meta, /graph\.facebook\.com/); assert.match(support, /support_messages/);
  assert.match(dashboard, /Continue with Facebook/); assert.doesNotMatch(dashboard, /Long-lived access token/);
  assert.match(metaStart, /ads_read,business_management/); assert.match(metaCallback, /exchangeOauthCode/); assert.match(metaStore, /AES-GCM/); assert.match(metaStore, /meta_oauth_sessions/); assert.match(metaSelect, /Choose an ad account/);
  assert.match(dashboard, /Whop performance based on CRM-attributed revenue/); assert.match(whop, /fetchWhopCampaigns/); assert.match(whopStart, /code_challenge_method/); assert.match(whopCallback, /verifyWhopState/); assert.match(whopStore, /AES-GCM/); assert.match(whopStore, /refreshWhopToken/);
  assert.match(auth, /HttpOnly; SameSite=Lax/); assert.match(auth, /PBKDF2/); assert.match(auth, /HMAC/); assert.match(sheets, /getAuthenticatedUser/); assert.match(support, /getAuthenticatedUser/);
});
