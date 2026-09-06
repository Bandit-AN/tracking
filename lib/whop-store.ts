import { runtimeEnv } from "@/lib/meta-store";
import { refreshWhopToken } from "@/lib/whop-oauth";

type BoundStatement = { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> };
type Binding = { prepare: (query: string) => { bind: (...args: unknown[]) => BoundStatement } };
export type WhopAccount = { id: string; name: string; status?: string };
export type WhopConnection = { workspaceId: number; accountId: string; accountName: string; accessToken: string; refreshToken: string; tokenExpiresAt: string };
export type WhopOauthSession = { id: string; workspaceId: number; browserNonce: string; codeVerifier: string; accessToken?: string; refreshToken?: string; tokenExpiresAt?: string; accounts?: WhopAccount[]; expiresAt: string };

async function setupD1(db: Binding) {
  await db.prepare("CREATE TABLE IF NOT EXISTS whop_connections (workspace_id INTEGER PRIMARY KEY, account_id TEXT NOT NULL, account_name TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, token_expires_at TEXT NOT NULL, updated_at TEXT NOT NULL)").bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS whop_oauth_sessions (id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, browser_nonce TEXT NOT NULL, code_verifier TEXT NOT NULL, access_token TEXT, refresh_token TEXT, token_expires_at TEXT, accounts_json TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)").bind().run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_whop_oauth_sessions_expires_at ON whop_oauth_sessions(expires_at)").bind().run();
}

async function neon(runtime: Awaited<ReturnType<typeof runtimeEnv>>) {
  if (!runtime.DATABASE_URL) return null;
  const { neon } = await import("@neondatabase/serverless"); const sql = neon(runtime.DATABASE_URL);
  await sql.query("CREATE TABLE IF NOT EXISTS whop_connections (workspace_id BIGINT PRIMARY KEY, account_id TEXT NOT NULL, account_name TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, token_expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("CREATE TABLE IF NOT EXISTS whop_oauth_sessions (id TEXT PRIMARY KEY, workspace_id BIGINT NOT NULL, browser_nonce TEXT NOT NULL, code_verifier TEXT NOT NULL, access_token TEXT, refresh_token TEXT, token_expires_at TIMESTAMPTZ, accounts_json TEXT, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("CREATE INDEX IF NOT EXISTS idx_whop_oauth_sessions_expires_at ON whop_oauth_sessions(expires_at)");
  return sql;
}

function bytesToBase64Url(bytes: Uint8Array) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function base64UrlToBytes(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0)); }
async function encryptionKey() { const secret = process.env.WHOP_TOKEN_ENCRYPTION_KEY?.trim(); if (!secret || secret.length < 32) throw new Error("Whop token encryption is not configured"); const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)); return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]); }
async function seal(value: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value)); return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`; }
async function open(value: string) { if (!value.startsWith("v1.")) return value; const [, iv, ciphertext] = value.split("."); const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) }, await encryptionKey(), base64UrlToBytes(ciphertext)); return new TextDecoder().decode(decrypted); }

export async function saveWhopOauthSession(session: WhopOauthSession) {
  const runtime = await runtimeEnv(); const sql = await neon(runtime); const now = new Date().toISOString();
  const access = session.accessToken ? await seal(session.accessToken) : null; const refresh = session.refreshToken ? await seal(session.refreshToken) : null; const accounts = session.accounts ? JSON.stringify(session.accounts) : null;
  if (sql) { await sql.query("DELETE FROM whop_oauth_sessions WHERE expires_at < NOW()"); await sql.query("INSERT INTO whop_oauth_sessions (id,workspace_id,browser_nonce,code_verifier,access_token,refresh_token,token_expires_at,accounts_json,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,token_expires_at=EXCLUDED.token_expires_at,accounts_json=EXCLUDED.accounts_json", [session.id, session.workspaceId, session.browserNonce, session.codeVerifier, access, refresh, session.tokenExpiresAt || null, accounts, session.expiresAt]); }
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("DELETE FROM whop_oauth_sessions WHERE expires_at < ?").bind(now).run(); await runtime.DB.prepare("INSERT INTO whop_oauth_sessions (id,workspace_id,browser_nonce,code_verifier,access_token,refresh_token,token_expires_at,accounts_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token,refresh_token=excluded.refresh_token,token_expires_at=excluded.token_expires_at,accounts_json=excluded.accounts_json").bind(session.id, session.workspaceId, session.browserNonce, session.codeVerifier, access, refresh, session.tokenExpiresAt || null, accounts, session.expiresAt, now).run(); }
  else throw new Error("Database unavailable");
}

export async function getWhopOauthSession(id: string): Promise<WhopOauthSession | null> {
  const runtime = await runtimeEnv(); const sql = await neon(runtime); let row: Record<string, unknown> | undefined;
  if (sql) { const rows = await sql.query("SELECT * FROM whop_oauth_sessions WHERE id=$1 AND expires_at>NOW()", [id]); row = rows[0] as Record<string, unknown>; }
  else if (runtime.DB) { await setupD1(runtime.DB); const rows = await runtime.DB.prepare("SELECT * FROM whop_oauth_sessions WHERE id=? AND expires_at>?").bind(id, new Date().toISOString()).all(); row = rows.results?.[0] as Record<string, unknown>; }
  if (!row) return null;
  return { id: String(row.id), workspaceId: Number(row.workspace_id), browserNonce: String(row.browser_nonce), codeVerifier: String(row.code_verifier), accessToken: row.access_token ? await open(String(row.access_token)) : undefined, refreshToken: row.refresh_token ? await open(String(row.refresh_token)) : undefined, tokenExpiresAt: row.token_expires_at ? new Date(String(row.token_expires_at)).toISOString() : undefined, accounts: row.accounts_json ? JSON.parse(String(row.accounts_json)) as WhopAccount[] : undefined, expiresAt: new Date(String(row.expires_at)).toISOString() };
}

export async function deleteWhopOauthSession(id: string) { const runtime = await runtimeEnv(); const sql = await neon(runtime); if (sql) await sql.query("DELETE FROM whop_oauth_sessions WHERE id=$1", [id]); else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("DELETE FROM whop_oauth_sessions WHERE id=?").bind(id).run(); } }

export async function saveWhopConnection(connection: WhopConnection) {
  const runtime = await runtimeEnv(); const sql = await neon(runtime); const access = await seal(connection.accessToken); const refresh = await seal(connection.refreshToken); const now = new Date().toISOString();
  if (sql) await sql.query("INSERT INTO whop_connections (workspace_id,account_id,account_name,access_token,refresh_token,token_expires_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id) DO UPDATE SET account_id=EXCLUDED.account_id,account_name=EXCLUDED.account_name,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,token_expires_at=EXCLUDED.token_expires_at,updated_at=NOW()", [connection.workspaceId, connection.accountId, connection.accountName, access, refresh, connection.tokenExpiresAt]);
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("INSERT INTO whop_connections (workspace_id,account_id,account_name,access_token,refresh_token,token_expires_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET account_id=excluded.account_id,account_name=excluded.account_name,access_token=excluded.access_token,refresh_token=excluded.refresh_token,token_expires_at=excluded.token_expires_at,updated_at=excluded.updated_at").bind(connection.workspaceId, connection.accountId, connection.accountName, access, refresh, connection.tokenExpiresAt, now).run(); }
  else throw new Error("Database unavailable");
}

export async function getWhopConnection(workspaceId: number): Promise<WhopConnection | null> {
  const runtime = await runtimeEnv(); const sql = await neon(runtime); let row: Record<string, unknown> | undefined;
  if (sql) { const rows = await sql.query("SELECT * FROM whop_connections WHERE workspace_id=$1", [workspaceId]); row = rows[0] as Record<string, unknown>; }
  else if (runtime.DB) { await setupD1(runtime.DB); const rows = await runtime.DB.prepare("SELECT * FROM whop_connections WHERE workspace_id=?").bind(workspaceId).all(); row = rows.results?.[0] as Record<string, unknown>; }
  if (!row) return null;
  let connection: WhopConnection = { workspaceId: Number(row.workspace_id), accountId: String(row.account_id), accountName: String(row.account_name), accessToken: await open(String(row.access_token)), refreshToken: await open(String(row.refresh_token)), tokenExpiresAt: new Date(String(row.token_expires_at)).toISOString() };
  if (new Date(connection.tokenExpiresAt).getTime() <= Date.now() + 300_000) { const refreshed = await refreshWhopToken(connection.refreshToken); connection = { ...connection, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, tokenExpiresAt: refreshed.expiresAt }; await saveWhopConnection(connection); }
  return connection;
}

export async function deleteWhopConnection(workspaceId: number) { const runtime = await runtimeEnv(); const sql = await neon(runtime); if (sql) await sql.query("DELETE FROM whop_connections WHERE workspace_id=$1", [workspaceId]); else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("DELETE FROM whop_connections WHERE workspace_id=?").bind(workspaceId).run(); } }
