const SESSION_COOKIE = "moonrift_session";
const SESSION_SECONDS = 12 * 60 * 60;
const DEFAULT_ADMIN_EMAIL = "peterphan441@gmail.com";
// This is a one-way PBKDF2 verifier, not the login password. Production can
// replace it with MOONRIFT_AUTH_USERS without changing source.
const DEFAULT_ADMIN_PASSWORD_HASH = "pbkdf2-sha256$310000$ymAMUgr2hdDIXjDDoS5mfw$umkJjEjFpK5eB4KWjAtUvas_SFPxmLYb-_rnpKxdhVY";

type RuntimeAuthEnv = {
  MOONRIFT_AUTH_SECRET?: string;
  MOONRIFT_AUTH_USERS?: string;
  MOONRIFT_ALLOWED_EMAILS?: string;
  META_APP_SECRET?: string;
  GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL?: string;
  DATABASE_URL?: string;
};

export type AuthRole = "admin" | "editor" | "viewer";
export type AuthUser = {
  email: string;
  displayName: string;
  role: AuthRole;
  workspaceIds: "all" | number[];
};

type ConfiguredUser = AuthUser & { passwordHash: string };
type SessionPayload = AuthUser & { version: 1; issuedAt: number; expiresAt: number };

const encoder = new TextEncoder();
const publicUser = (user: ConfiguredUser): AuthUser => ({ email: user.email, displayName: user.displayName, role: user.role, workspaceIds: user.workspaceIds });

async function runtimeAuthEnv(): Promise<RuntimeAuthEnv> {
  if (process.env.VERCEL) return process.env as RuntimeAuthEnv;
  try {
    const cloudflareSpecifier = "cloudflare:workers";
    const cloudflare = await import(cloudflareSpecifier);
    return { ...(process.env as RuntimeAuthEnv), ...(cloudflare.env as RuntimeAuthEnv) };
  } catch {
    return process.env as RuntimeAuthEnv;
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeJson(value: unknown) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T | null {
  try { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T; }
  catch { return null; }
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function configuredUsers(env: RuntimeAuthEnv): ConfiguredUser[] {
  if (!env.MOONRIFT_AUTH_USERS) return [{ email: DEFAULT_ADMIN_EMAIL, displayName: "Peter Phan", role: "admin", workspaceIds: "all", passwordHash: DEFAULT_ADMIN_PASSWORD_HASH }];
  try {
    const parsed = JSON.parse(env.MOONRIFT_AUTH_USERS) as Array<Partial<ConfiguredUser>>;
    return parsed.flatMap((user) => {
      const email = normalizedEmail(user.email ?? "");
      const passwordHash = user.passwordHash?.trim() ?? "";
      if (!email || !passwordHash) return [];
      const role: AuthRole = user.role === "editor" || user.role === "viewer" ? user.role : "admin";
      const workspaceIds = user.workspaceIds === "all"
        ? "all"
        : Array.isArray(user.workspaceIds)
          ? user.workspaceIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
          : role === "admin" ? "all" : [];
      return [{ email, passwordHash, role, workspaceIds, displayName: user.displayName?.trim() || email }];
    });
  } catch { return []; }
}

function authSecret(env: RuntimeAuthEnv) {
  return env.MOONRIFT_AUTH_SECRET?.trim()
    || env.META_APP_SECRET?.trim()
    || env.GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL?.trim()
    || env.DATABASE_URL?.trim()
    || "";
}

function approvedOpenAIUser(env: RuntimeAuthEnv, email: string): AuthUser | null {
  const normalized = normalizedEmail(email);
  const configured = configuredUsers(env).find((user) => user.email === normalized);
  if (configured) return publicUser(configured);
  const allowed = new Set([
    DEFAULT_ADMIN_EMAIL,
    ...(env.MOONRIFT_ALLOWED_EMAILS ?? "").split(","),
  ].map(normalizedEmail).filter(Boolean));
  return allowed.has(normalized)
    ? { email: normalized, displayName: normalized === DEFAULT_ADMIN_EMAIL ? "Peter Phan" : normalized, role: normalized === DEFAULT_ADMIN_EMAIL ? "admin" : "viewer", workspaceIds: normalized === DEFAULT_ADMIN_EMAIL ? "all" : [] }
    : null;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function secureEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

function cookieValue(headers: Headers, name: string) {
  const cookie = headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

async function sessionFromHeaders(requestHeaders: Headers, env: RuntimeAuthEnv): Promise<AuthUser | null> {
  const token = cookieValue(requestHeaders, SESSION_COOKIE);
  const secret = authSecret(env);
  if (!token || !secret) return null;
  const [encoded, signature, ...extra] = token.split(".");
  if (!encoded || !signature || extra.length) return null;
  let actualSignature: Uint8Array;
  try { actualSignature = base64UrlToBytes(signature); } catch { return null; }
  if (!secureEqual(await hmac(encoded, secret), actualSignature)) return null;
  const payload = decodeJson<SessionPayload>(encoded);
  if (!payload || payload.version !== 1 || payload.expiresAt <= Date.now() || payload.issuedAt > Date.now() + 60_000) return null;
  const configured = configuredUsers(env).find((user) => user.email === normalizedEmail(payload.email));
  if (!configured) return null;
  return publicUser(configured);
}

export async function getAuthenticatedUser(requestHeaders: Headers): Promise<AuthUser | null> {
  const env = await runtimeAuthEnv();
  // Sites injects these headers after its own sign-in. Never trust caller-supplied
  // copies on the public Vercel deployment.
  if (!process.env.VERCEL) {
    const openAIEmail = requestHeaders.get("oai-authenticated-user-email");
    if (openAIEmail) return approvedOpenAIUser(env, openAIEmail);
  }
  return sessionFromHeaders(requestHeaders, env);
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, iterationsValue, saltValue, expectedValue, ...extra] = passwordHash.split("$");
  const iterations = Number(iterationsValue);
  if (algorithm !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < 100_000 || !saltValue || !expectedValue || extra.length) return false;
  let salt: Uint8Array; let expected: Uint8Array;
  try { salt = base64UrlToBytes(saltValue); expected = base64UrlToBytes(expectedValue); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt), iterations }, key, expected.length * 8));
  return secureEqual(derived, expected);
}

export async function authenticateCredentials(email: string, password: string): Promise<AuthUser | null> {
  const env = await runtimeAuthEnv();
  const configured = configuredUsers(env).find((user) => user.email === normalizedEmail(email));
  if (!configured || !password || !(await verifyPassword(password, configured.passwordHash))) return null;
  return publicUser(configured);
}

export async function createSessionCookie(user: AuthUser, request: Request) {
  const env = await runtimeAuthEnv();
  const secret = authSecret(env);
  if (!secret || secret.length < 32) throw new Error("MoonRift authentication is not configured");
  const now = Date.now();
  const payload: SessionPayload = { ...user, version: 1, issuedAt: now, expiresAt: now + SESSION_SECONDS * 1000 };
  const encoded = encodeJson(payload);
  const token = `${encoded}.${bytesToBase64Url(await hmac(encoded, secret))}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function canEdit(user: AuthUser) { return user.role === "admin" || user.role === "editor"; }
export function canAccessWorkspace(user: AuthUser, workspaceId: number) { return user.workspaceIds === "all" || user.workspaceIds.includes(workspaceId); }
export function unauthorizedResponse() { return Response.json({ error: "Sign in required" }, { status: 401, headers: { "cache-control": "no-store" } }); }
export function forbiddenResponse() { return Response.json({ error: "You do not have permission for this action" }, { status: 403, headers: { "cache-control": "no-store" } }); }
