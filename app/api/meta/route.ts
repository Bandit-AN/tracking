type Binding = { prepare: (query: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> } } };
type RuntimeEnv = { DB?: Binding; DATABASE_URL?: string };

async function runtimeEnv(): Promise<RuntimeEnv> {
  if (process.env.VERCEL) return process.env as RuntimeEnv;
  try { const cloudflare = await import("cloudflare:workers"); return cloudflare.env as RuntimeEnv; } catch { return process.env as RuntimeEnv; }
}

async function setupD1(db: Binding) {
  await db.prepare("CREATE TABLE IF NOT EXISTS meta_connections (workspace_id INTEGER PRIMARY KEY, ad_account_id TEXT NOT NULL, access_token TEXT NOT NULL, updated_at TEXT NOT NULL)").bind().run();
}

async function neon(runtime: RuntimeEnv) {
  if (!runtime.DATABASE_URL) return null;
  const { neon } = await import("@neondatabase/serverless"); const sql = neon(runtime.DATABASE_URL);
  await sql.query("CREATE TABLE IF NOT EXISTS meta_connections (workspace_id BIGINT PRIMARY KEY, ad_account_id TEXT NOT NULL, access_token TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  return sql;
}

async function connection(runtime: RuntimeEnv, workspaceId: number) {
  const sql = await neon(runtime); if (sql) { const rows = await sql.query("SELECT ad_account_id,access_token FROM meta_connections WHERE workspace_id=$1", [workspaceId]); return rows[0] as { ad_account_id: string; access_token: string } | undefined; }
  if (runtime.DB) { await setupD1(runtime.DB); const rows = await runtime.DB.prepare("SELECT ad_account_id,access_token FROM meta_connections WHERE workspace_id=?").bind(workspaceId).all(); return rows.results?.[0] as { ad_account_id: string; access_token: string } | undefined; }
  return undefined;
}

async function insights(adAccountId: string, accessToken: string, since: string, until: string) {
  const account = adAccountId.replace(/^act_/, "");
  const params = new URLSearchParams({ fields: "date_start,date_stop,ad_id,ad_name,campaign_name,spend,impressions,clicks", level: "ad", time_increment: "1", limit: "500", time_range: JSON.stringify({ since, until }) });
  const response = await fetch(`https://graph.facebook.com/v25.0/act_${account}/insights?${params}`, { cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Meta Ads rejected the connection");
  return await response.json() as { data?: unknown[] };
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv(); const url = new URL(request.url); const workspaceId = Number(url.searchParams.get("workspaceId") || 1); const saved = await connection(runtime, workspaceId);
  if (!saved) return Response.json({ connected: false, insights: [] });
  const until = url.searchParams.get("until") || new Date().toISOString().slice(0, 10); const since = url.searchParams.get("since") || until;
  try { const result = await insights(saved.ad_account_id, saved.access_token, since, until); return Response.json({ connected: true, insights: result.data ?? [] }); } catch (error) { return Response.json({ connected: true, insights: [], error: error instanceof Error ? error.message : "Meta Ads unavailable" }, { status: 502 }); }
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv(); const body = await request.json() as { workspaceId: number; adAccountId: string; accessToken: string }; const account = body.adAccountId?.replace(/^act_/, "").trim();
  if (!body.workspaceId || !account || !body.accessToken) return Response.json({ error: "Missing Meta connection details" }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10); try { await insights(account, body.accessToken, today, today); } catch { return Response.json({ error: "Meta could not verify that account and token" }, { status: 400 }); }
  const sql = await neon(runtime); if (sql) await sql.query("INSERT INTO meta_connections (workspace_id,ad_account_id,access_token) VALUES ($1,$2,$3) ON CONFLICT(workspace_id) DO UPDATE SET ad_account_id=EXCLUDED.ad_account_id,access_token=EXCLUDED.access_token,updated_at=NOW()", [body.workspaceId, account, body.accessToken]);
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("INSERT INTO meta_connections (workspace_id,ad_account_id,access_token,updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET ad_account_id=excluded.ad_account_id,access_token=excluded.access_token,updated_at=excluded.updated_at").bind(body.workspaceId, account, body.accessToken, new Date().toISOString()).run(); }
  else return Response.json({ error: "Database unavailable" }, { status: 503 });
  return Response.json({ ok: true, connected: true });
}
