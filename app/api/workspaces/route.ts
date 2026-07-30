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
  const binding = db(); if (!binding) return Response.json({ ok: true, ephemeral: true });
  await setup(binding); const body = await request.json() as { workspaceId: number; member: string; date: string; method: string; amount: number };
  await binding.prepare("INSERT INTO payouts (workspace_id,member,date,method,amount,created_at) VALUES (?,?,?,?,?,?)").bind(body.workspaceId, body.member, body.date, body.method, body.amount, new Date().toISOString()).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const binding = db(); if (!binding) return Response.json({ ok: true, ephemeral: true });
  await setup(binding); const id = Number(new URL(request.url).searchParams.get("workspaceId"));
  await binding.prepare("DELETE FROM payouts WHERE workspace_id = ?").bind(id).run();
  await binding.prepare("DELETE FROM workspaces WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
