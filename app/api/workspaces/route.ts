import { env } from "cloudflare:workers";

type Binding = { prepare: (query: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> } } };
const db = () => (env as unknown as { DB?: Binding }).DB;

async function setup(binding: Binding) {
  await binding.prepare("CREATE TABLE IF NOT EXISTS workspaces (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)").bind().run();
  await binding.prepare("CREATE TABLE IF NOT EXISTS payouts (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL, member TEXT NOT NULL, date TEXT NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL, created_at TEXT NOT NULL)").bind().run();
}

export async function GET(request: Request) {
  const binding = db(); if (!binding) return Response.json({ payouts: [] });
  await setup(binding); const id = Number(new URL(request.url).searchParams.get("workspaceId") || 1);
  const workspace = await binding.prepare("SELECT name, avatar FROM workspaces WHERE id = ?").bind(id).all();
  const payouts = await binding.prepare("SELECT id, workspace_id as workspaceId, member, date, method, amount FROM payouts WHERE workspace_id = ? ORDER BY date DESC, id DESC").bind(id).all();
  return Response.json({ workspace: workspace.results?.[0] ?? null, payouts: payouts.results ?? [] });
}

export async function PATCH(request: Request) {
  const binding = db(); if (!binding) return Response.json({ ok: true, ephemeral: true });
  await setup(binding); const body = await request.json() as { workspaceId: number; name: string; avatar?: string };
  await binding.prepare("INSERT INTO workspaces (id,name,avatar,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar, updated_at=excluded.updated_at").bind(body.workspaceId, body.name, body.avatar || "", new Date().toISOString()).run();
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json() as { id: number; workspaceId: number; member: string; date: string; method: string; amount: number };
  const binding = db(); if (binding) { await setup(binding); await binding.prepare("INSERT OR REPLACE INTO payouts (id,workspace_id,member,date,method,amount,created_at) VALUES (?,?,?,?,?,?,?)").bind(body.id, body.workspaceId, body.member, body.date, body.method, body.amount, new Date().toISOString()).run(); }
  const [role, payee] = body.member.includes(":") ? body.member.split(":") : ["Team", body.member];
  const webhook = (env as unknown as { GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL?: string }).GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL;
  let sheetSynced = false;
  if (webhook) {
    try {
      const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", id: body.id, payee, role, date: body.date, method: body.method, amount: body.amount }) });
      sheetSynced = response.ok;
    } catch {}
  }
  return Response.json({ ok: true, sheetSynced, ephemeral: !binding });
}

export async function DELETE(request: Request) {
  const binding = db(); if (!binding) return Response.json({ ok: true, ephemeral: true });
  await setup(binding); const url = new URL(request.url); const id = Number(url.searchParams.get("workspaceId")); const payoutId = Number(url.searchParams.get("payoutId"));
  if (payoutId) {
    await binding.prepare("DELETE FROM payouts WHERE id = ? AND workspace_id = ?").bind(payoutId, id).run();
    const webhook = (env as unknown as { GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL?: string }).GOOGLE_SHEETS_PAYOUT_WEBHOOK_URL;
    let sheetSynced = false;
    if (webhook) { try { const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: payoutId }) }); sheetSynced = response.ok; } catch {} }
    return Response.json({ ok: true, sheetSynced });
  }
  await binding.prepare("DELETE FROM payouts WHERE workspace_id = ?").bind(id).run(); await binding.prepare("DELETE FROM workspaces WHERE id = ?").bind(id).run();
  return Response.json({ ok: true, sheetSynced: false });
}
