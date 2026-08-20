type Binding = { prepare: (query: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> } } };
type RuntimeEnv = { DB?: Binding; DATABASE_URL?: string; MOONRIFT_ADMIN_EMAILS?: string };

async function runtimeEnv(): Promise<RuntimeEnv> {
  if (process.env.VERCEL) return process.env as RuntimeEnv;
  try { const cloudflare = await import("cloudflare:workers"); return cloudflare.env as RuntimeEnv; } catch { return process.env as RuntimeEnv; }
}

const schema = "CREATE TABLE IF NOT EXISTS support_messages (id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, workspace_name TEXT NOT NULL, sender_email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, resolved_at TEXT)";
async function setupD1(db: Binding) { await db.prepare(schema).bind().run(); await db.prepare("CREATE INDEX IF NOT EXISTS idx_support_messages_status_created ON support_messages(status,created_at)").bind().run(); }
async function neon(runtime: RuntimeEnv) { if (!runtime.DATABASE_URL) return null; const { neon } = await import("@neondatabase/serverless"); const sql = neon(runtime.DATABASE_URL); await sql.query("CREATE TABLE IF NOT EXISTS support_messages (id BIGINT PRIMARY KEY, workspace_id BIGINT NOT NULL, workspace_name TEXT NOT NULL, sender_email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ)"); await sql.query("CREATE INDEX IF NOT EXISTS idx_support_messages_status_created ON support_messages(status,created_at)"); return sql; }
const emailFor = (request: Request) => request.headers.get("oai-authenticated-user-email") || "local-preview@moonrift.media";
const isAdmin = (runtime: RuntimeEnv, email: string) => {
  const approvedEmails = new Set([
    "peterphan441@gmail.com",
    ...(runtime.MOONRIFT_ADMIN_EMAILS || "").split(","),
  ].map((value) => value.trim().toLowerCase()).filter(Boolean));
  return approvedEmails.has(email.toLowerCase());
};
const normalize = (row: Record<string, unknown>) => ({ id: Number(row.id), workspaceId: Number(row.workspace_id), workspaceName: row.workspace_name, senderEmail: row.sender_email, message: row.message, status: row.status, createdAt: row.created_at });

export async function GET(request: Request) {
  const runtime = await runtimeEnv(); const email = emailFor(request); const admin = isAdmin(runtime, email); const workspaceId = Number(new URL(request.url).searchParams.get("workspaceId") || 1); let rows: Record<string, unknown>[] = [];
  const sql = await neon(runtime); if (sql) rows = await sql.query(admin ? "SELECT * FROM support_messages ORDER BY status ASC,created_at DESC" : "SELECT * FROM support_messages WHERE workspace_id=$1 AND sender_email=$2 ORDER BY created_at DESC", admin ? [] : [workspaceId, email]) as Record<string, unknown>[];
  else if (runtime.DB) { await setupD1(runtime.DB); const result = admin ? await runtime.DB.prepare("SELECT * FROM support_messages ORDER BY status ASC,created_at DESC").bind().all() : await runtime.DB.prepare("SELECT * FROM support_messages WHERE workspace_id=? AND sender_email=? ORDER BY created_at DESC").bind(workspaceId, email).all(); rows = (result.results ?? []) as Record<string, unknown>[]; }
  return Response.json({ isAdmin: admin, messages: rows.map(normalize) });
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv(); const body = await request.json() as { workspaceId: number; workspaceName: string; message: string }; const email = emailFor(request); const id = Date.now(); const createdAt = new Date().toISOString();
  if (!body.message?.trim()) return Response.json({ error: "Message required" }, { status: 400 });
  const sql = await neon(runtime); if (sql) await sql.query("INSERT INTO support_messages (id,workspace_id,workspace_name,sender_email,message,status,created_at) VALUES ($1,$2,$3,$4,$5,'open',$6)", [id, body.workspaceId, body.workspaceName, email, body.message.trim(), createdAt]);
  else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("INSERT INTO support_messages (id,workspace_id,workspace_name,sender_email,message,status,created_at) VALUES (?,?,?,?,?,'open',?)").bind(id, body.workspaceId, body.workspaceName, email, body.message.trim(), createdAt).run(); }
  else return Response.json({ error: "Database unavailable" }, { status: 503 }); return Response.json({ ok: true, id });
}

export async function PATCH(request: Request) {
  const runtime = await runtimeEnv(); const email = emailFor(request); if (!isAdmin(runtime, email)) return Response.json({ error: "Agency admin required" }, { status: 403 }); const body = await request.json() as { id: number; status: "open" | "resolved" }; const resolved = body.status === "resolved" ? new Date().toISOString() : null;
  const sql = await neon(runtime); if (sql) await sql.query("UPDATE support_messages SET status=$1,resolved_at=$2 WHERE id=$3", [body.status, resolved, body.id]); else if (runtime.DB) { await setupD1(runtime.DB); await runtime.DB.prepare("UPDATE support_messages SET status=?,resolved_at=? WHERE id=?").bind(body.status, resolved, body.id).run(); } else return Response.json({ error: "Database unavailable" }, { status: 503 }); return Response.json({ ok: true });
}
