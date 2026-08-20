type BoundStatement = { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> };
type Binding = { prepare: (query: string) => { bind: (...args: unknown[]) => BoundStatement } };
export type RuntimeEnv = { DB?: Binding; DATABASE_URL?: string };

export type MetaConnection = { adAccountId: string; accessToken: string };
export type MetaAdAccount = { id: string; name: string; account_status?: number; currency?: string; timezone_name?: string };
export type MetaOauthSession = { id: string; workspaceId: number; browserNonce: string; accessToken: string; accounts: MetaAdAccount[]; expiresAt: string };

export async function runtimeEnv(): Promise<RuntimeEnv> {
  if (process.env.VERCEL) return process.env as RuntimeEnv;
  try { const cloudflare = await import("cloudflare:workers"); return cloudflare.env as RuntimeEnv; } catch { return process.env as RuntimeEnv; }
}

async function setupD1(db: Binding) {
  await db.prepare("CREATE TABLE IF NOT EXISTS meta_connections (workspace_id INTEGER PRIMARY KEY, ad_account_id TEXT NOT NULL, access_token TEXT NOT NULL, updated_at TEXT NOT NULL)").bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS meta_oauth_sessions (id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, browser_nonce TEXT NOT NULL, access_token TEXT NOT NULL, accounts_json TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)").bind().run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_meta_oauth_sessions_expires_at ON meta_oauth_sessions(expires_at)").bind().run();
}

async function neon(runtime: RuntimeEnv) {
  if (!runtime.DATABASE_URL) return null;
  const { neon } = await import("@neondatabase/serverless"); const sql = neon(runtime.DATABASE_URL);
  await sql.query("CREATE TABLE IF NOT EXISTS meta_connections (workspace_id BIGINT PRIMARY KEY, ad_account_id TEXT NOT NULL, access_token TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("CREATE TABLE IF NOT EXISTS meta_oauth_sessions (id TEXT PRIMARY KEY, workspace_id BIGINT NOT NULL, browser_nonce TEXT NOT NULL, access_token TEXT NOT NULL, accounts_json TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("CREATE INDEX IF NOT EXISTS idx_meta_oauth_sessions_expires_at ON meta_oauth_sessions(expires_at)");
  return sql;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized); return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function tokenKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sealToken(token: string) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || token.startsWith("v1.")) return token;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(secret), new TextEncoder().encode(token));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function openToken(token: string) {
  if (!token.startsWith("v1.")) return token;
  const secret = process.env.META_APP_SECRET; if (!secret) throw new Error("Meta token encryption is not configured");
  const [, iv, ciphertext] = token.split(".");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) }, await tokenKey(secret), base64UrlToBytes(ciphertext));
  return new TextDecoder().decode(decrypted);
}

export async function getMetaConnection(workspaceId: number): Promise<MetaConnection | null> {
  const runtime = await runtimeEnv(); const sql = await neon(runtime);
  let row: { ad_account_id: string; access_token: string } | undefined;
  if (sql) { const rows = await sql.query("SELECT ad_account_id,access_token FROM meta_connections WHERE workspace_id=$1", [workspaceId]); row = rows[0] as typeof row; }
  else if (runtime.DB) { await setupD1(runtime.DB); const rows = await runtime.DB.prepare("SELECT ad_account_id,access_token FROM meta_connections WHERE workspace_id=?").bind(workspaceId).all(); row = rows.results?.[0] as typeof row; }
  if (!row) return null;
  return { adAccountId: row.ad_account_id, accessToken: await openToken(row.access_token) };
}

export async function saveMetaConnection(workspaceId: number, adAccountId: string, accessToken: string) {
  const runtime = await runtimeEnv(); const protectedToken = await sealToken(accessToken); const sql = await neon(runtime);
  if (sql) await sql.query("INSERT INTO meta_connections (workspace_id,ad_account_id,access_token) VALUES ($1,$2,$3) ON CONFLICT(workspace_id) DO UPDATE SET ad_account_id=EXCLUDED.ad_account_id,access_token=EXCLUDED.access_token,updated_at=NOW()", [workspaceId, adAccountId.replace(/^act_/, ""), protectedToken]);
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("INSERT INTO meta_connections (workspace_id,ad_account_id,access_token,updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET ad_account_id=excluded.ad_account_id,access_token=excluded.access_token,updated_at=excluded.updated_at").bind(workspaceId, adAccountId.replace(/^act_/, ""), protectedToken, new Date().toISOString()).run(); }
  else throw new Error("Database unavailable");
}

export async function deleteMetaConnection(workspaceId: number) {
  const runtime = await runtimeEnv(); const sql = await neon(runtime);
  if (sql) await sql.query("DELETE FROM meta_connections WHERE workspace_id=$1", [workspaceId]);
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("DELETE FROM meta_connections WHERE workspace_id=?").bind(workspaceId).run(); }
  else throw new Error("Database unavailable");
}

export async function createMetaOauthSession(session: MetaOauthSession) {
  const runtime = await runtimeEnv(); const protectedToken = await sealToken(session.accessToken); const accounts = JSON.stringify(session.accounts); const sql = await neon(runtime);
  if (sql) {
    await sql.query("DELETE FROM meta_oauth_sessions WHERE expires_at < NOW()");
    await sql.query("INSERT INTO meta_oauth_sessions (id,workspace_id,browser_nonce,access_token,accounts_json,expires_at) VALUES ($1,$2,$3,$4,$5,$6)", [session.id, session.workspaceId, session.browserNonce, protectedToken, accounts, session.expiresAt]);
  } else if (runtime.DB) {
    await setupD1(runtime.DB); await runtime.DB.prepare("DELETE FROM meta_oauth_sessions WHERE expires_at < ?").bind(new Date().toISOString()).run();
    await runtime.DB.prepare("INSERT INTO meta_oauth_sessions (id,workspace_id,browser_nonce,access_token,accounts_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?)").bind(session.id, session.workspaceId, session.browserNonce, protectedToken, accounts, session.expiresAt, new Date().toISOString()).run();
  } else throw new Error("Database unavailable");
}

export async function getMetaOauthSession(id: string): Promise<MetaOauthSession | null> {
  const runtime = await runtimeEnv(); const sql = await neon(runtime);
  let row: { id: string; workspace_id: number | string; browser_nonce: string; access_token: string; accounts_json: string; expires_at: string } | undefined;
  if (sql) { const rows = await sql.query("SELECT id,workspace_id,browser_nonce,access_token,accounts_json,expires_at FROM meta_oauth_sessions WHERE id=$1 AND expires_at > NOW()", [id]); row = rows[0] as typeof row; }
  else if (runtime.DB) { await setupD1(runtime.DB); const rows = await runtime.DB.prepare("SELECT id,workspace_id,browser_nonce,access_token,accounts_json,expires_at FROM meta_oauth_sessions WHERE id=? AND expires_at>?").bind(id, new Date().toISOString()).all(); row = rows.results?.[0] as typeof row; }
  if (!row) return null;
  return { id: row.id, workspaceId: Number(row.workspace_id), browserNonce: row.browser_nonce, accessToken: await openToken(row.access_token), accounts: JSON.parse(row.accounts_json) as MetaAdAccount[], expiresAt: new Date(row.expires_at).toISOString() };
}

export async function deleteMetaOauthSession(id: string) {
  const runtime = await runtimeEnv(); const sql = await neon(runtime);
  if (sql) await sql.query("DELETE FROM meta_oauth_sessions WHERE id=$1", [id]);
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("DELETE FROM meta_oauth_sessions WHERE id=?").bind(id).run(); }
}
