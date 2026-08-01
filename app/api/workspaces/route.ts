type Binding = { prepare: (query: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> } } };
type RuntimeEnv = { DB?: Binding; DATABASE_URL?: string; GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL?: string };

async function runtimeEnv(): Promise<RuntimeEnv> {
  if (process.env.VERCEL) return process.env as RuntimeEnv;
  try {
    const cloudflareSpecifier = "cloudflare:workers";
    const cloudflare = await import(cloudflareSpecifier);
    return cloudflare.env as RuntimeEnv;
  } catch { return process.env as RuntimeEnv; }
}

async function setupD1(db: Binding) {
  await db.prepare("CREATE TABLE IF NOT EXISTS workspaces (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', industry TEXT NOT NULL DEFAULT 'Sales workspace', initials TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#7646ff', sheet_url TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)").bind().run();
  for (const statement of [
    "ALTER TABLE workspaces ADD COLUMN industry TEXT NOT NULL DEFAULT 'Sales workspace'",
    "ALTER TABLE workspaces ADD COLUMN initials TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE workspaces ADD COLUMN color TEXT NOT NULL DEFAULT '#7646ff'",
    "ALTER TABLE workspaces ADD COLUMN sheet_url TEXT NOT NULL DEFAULT ''",
  ]) { try { await db.prepare(statement).bind().run(); } catch {} }
  await db.prepare("CREATE TABLE IF NOT EXISTS payouts (id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, member TEXT NOT NULL, date TEXT NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL, created_at TEXT NOT NULL)").bind().run();
  await db.prepare("INSERT OR IGNORE INTO workspaces (id,name,avatar,industry,initials,color,sheet_url,updated_at) VALUES (1,'Seller Syndicate','','Sales workspace','SS','#7646ff','https://docs.google.com/spreadsheets/d/1ahyY64u9uYmcEDFi1XAJRFmnZ_gX_6VQHUnWvswkvmg/edit?usp=sharing',?)").bind(new Date().toISOString()).run();
}

async function neonSql(url: string) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  await sql.query("CREATE TABLE IF NOT EXISTS workspaces (id BIGINT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', industry TEXT NOT NULL DEFAULT 'Sales workspace', initials TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#7646ff', sheet_url TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("CREATE TABLE IF NOT EXISTS payouts (id BIGINT PRIMARY KEY, workspace_id BIGINT NOT NULL, member TEXT NOT NULL, date TEXT NOT NULL, method TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await sql.query("INSERT INTO workspaces (id,name,avatar,industry,initials,color,sheet_url) VALUES (1,'Seller Syndicate','','Sales workspace','SS','#7646ff','https://docs.google.com/spreadsheets/d/1ahyY64u9uYmcEDFi1XAJRFmnZ_gX_6VQHUnWvswkvmg/edit?usp=sharing') ON CONFLICT (id) DO NOTHING");
  return sql;
}

async function syncWebhook(runtime: RuntimeEnv, payload: Record<string, unknown>) {
  if (!runtime.GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL) return false;
  try { return (await fetch(runtime.GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })).ok; } catch { return false; }
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv(); const url = new URL(request.url); const all = url.searchParams.get("all") === "true"; const id = Number(url.searchParams.get("workspaceId") || 1);
  if (runtime.DATABASE_URL) {
    const sql = await neonSql(runtime.DATABASE_URL);
    if (all) return Response.json({ workspaces: await sql.query("SELECT id,name,avatar,industry,initials,color,sheet_url AS \"sheetUrl\" FROM workspaces ORDER BY id") });
    const workspace = await sql.query("SELECT name,avatar,industry,initials,color,sheet_url AS \"sheetUrl\" FROM workspaces WHERE id=$1", [id]);
    const payouts = await sql.query("SELECT id,workspace_id AS \"workspaceId\",member,date,method,amount FROM payouts WHERE workspace_id=$1 ORDER BY date DESC,id DESC", [id]);
    return Response.json({ workspace: workspace[0] ?? null, payouts });
  }
  if (runtime.DB) {
    await setupD1(runtime.DB);
    if (all) return Response.json({ workspaces: (await runtime.DB.prepare("SELECT id,name,avatar,industry,initials,color,sheet_url as sheetUrl FROM workspaces ORDER BY id").bind().all()).results ?? [] });
    const workspace = await runtime.DB.prepare("SELECT name,avatar,industry,initials,color,sheet_url as sheetUrl FROM workspaces WHERE id=?").bind(id).all();
    const payouts = await runtime.DB.prepare("SELECT id,workspace_id as workspaceId,member,date,method,amount FROM payouts WHERE workspace_id=? ORDER BY date DESC,id DESC").bind(id).all();
    return Response.json({ workspace: workspace.results?.[0] ?? null, payouts: payouts.results ?? [] });
  }
  return Response.json({ workspaces: [], payouts: [] });
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv(); const body = await request.json() as { workspaceId: number; name: string; avatar?: string; industry?: string; initials?: string; color?: string; sheetUrl?: string };
  const values = [body.workspaceId, body.name, body.avatar || "", body.industry || "Sales workspace", body.initials || "", body.color || "#7646ff", body.sheetUrl || ""] as const;
  if (runtime.DATABASE_URL) { const sql = await neonSql(runtime.DATABASE_URL); await sql.query("INSERT INTO workspaces (id,name,avatar,industry,initials,color,sheet_url) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,avatar=EXCLUDED.avatar,industry=EXCLUDED.industry,initials=EXCLUDED.initials,color=EXCLUDED.color,sheet_url=EXCLUDED.sheet_url,updated_at=NOW()", [...values]); return Response.json({ ok: true }); }
  if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("INSERT INTO workspaces (id,name,avatar,industry,initials,color,sheet_url,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,industry=excluded.industry,initials=excluded.initials,color=excluded.color,sheet_url=excluded.sheet_url,updated_at=excluded.updated_at").bind(...values, new Date().toISOString()).run(); return Response.json({ ok: true }); }
  return Response.json({ ok: false, error: "Database unavailable" }, { status: 503 });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv(); const body = await request.json() as { kind?: string; id: number; workspaceId: number; name?: string; member?: string; date?: string; method?: string; amount?: number; industry?: string; initials?: string; color?: string; sheetUrl?: string };
  if (body.kind === "workspace") {
    const workspace = { workspaceId: body.id, name: body.name || "New workspace", industry: body.industry, initials: body.initials, color: body.color, sheetUrl: body.sheetUrl };
    return PATCH(new Request(request.url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(workspace) }));
  }
  if (!body.member || !body.date || !body.method || !body.amount) return Response.json({ error: "Invalid payout" }, { status: 400 });
  if (runtime.DATABASE_URL) { const sql = await neonSql(runtime.DATABASE_URL); await sql.query("INSERT INTO payouts (id,workspace_id,member,date,method,amount) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET member=EXCLUDED.member,date=EXCLUDED.date,method=EXCLUDED.method,amount=EXCLUDED.amount", [body.id, body.workspaceId, body.member, body.date, body.method, body.amount]); }
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("INSERT OR REPLACE INTO payouts (id,workspace_id,member,date,method,amount,created_at) VALUES (?,?,?,?,?,?,?)").bind(body.id,body.workspaceId,body.member,body.date,body.method,body.amount,new Date().toISOString()).run(); }
  const [role,payee] = body.member.includes(":") ? body.member.split(":") : ["Team",body.member];
  const sheetSynced = await syncWebhook(runtime, { action:"add",id:body.id,payee,role,date:body.date,method:body.method,amount:body.amount });
  return Response.json({ ok:true,sheetSynced,ephemeral:!runtime.DB&&!runtime.DATABASE_URL });
}

export async function DELETE(request: Request) {
  const runtime = await runtimeEnv(); const url = new URL(request.url); const workspaceId = Number(url.searchParams.get("workspaceId")); const payoutId = Number(url.searchParams.get("payoutId"));
  if (runtime.DATABASE_URL) { const sql = await neonSql(runtime.DATABASE_URL); if (payoutId) await sql.query("DELETE FROM payouts WHERE id=$1 AND workspace_id=$2",[payoutId,workspaceId]); else { await sql.query("DELETE FROM payouts WHERE workspace_id=$1",[workspaceId]); await sql.query("DELETE FROM workspaces WHERE id=$1",[workspaceId]); } }
  else if (runtime.DB) { await setupD1(runtime.DB); if (payoutId) await runtime.DB.prepare("DELETE FROM payouts WHERE id=? AND workspace_id=?").bind(payoutId,workspaceId).run(); else { await runtime.DB.prepare("DELETE FROM payouts WHERE workspace_id=?").bind(workspaceId).run(); await runtime.DB.prepare("DELETE FROM workspaces WHERE id=?").bind(workspaceId).run(); } }
  const sheetSynced = payoutId ? await syncWebhook(runtime,{action:"delete",id:payoutId}) : false;
  return Response.json({ok:true,sheetSynced});
}
