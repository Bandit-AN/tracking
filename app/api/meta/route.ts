import { metaConfig } from "@/lib/meta-oauth";
import { deleteMetaConnection, getMetaConnection, saveMetaConnection } from "@/lib/meta-store";

async function appSecretProof(accessToken: string) {
  const { appSecret } = metaConfig(); if (!appSecret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken)));
  return Array.from(signed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function insights(adAccountId: string, accessToken: string, since: string, until: string) {
  const account = adAccountId.replace(/^act_/, ""); const { version } = metaConfig();
  const params = new URLSearchParams({ fields: "date_start,date_stop,ad_id,ad_name,campaign_name,spend,impressions,clicks", level: "ad", time_increment: "1", limit: "500", time_range: JSON.stringify({ since, until }) });
  const proof = await appSecretProof(accessToken); if (proof) params.set("appsecret_proof", proof);
  const response = await fetch(`https://graph.facebook.com/${version}/act_${account}/insights?${params}`, { cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Meta Ads rejected the connection");
  return await response.json() as { data?: unknown[] };
}

export async function GET(request: Request) {
  const url = new URL(request.url); const workspaceId = Number(url.searchParams.get("workspaceId") || 1); const saved = await getMetaConnection(workspaceId);
  if (!saved) return Response.json({ connected: false, insights: [] });
  const until = url.searchParams.get("until") || new Date().toISOString().slice(0, 10); const since = url.searchParams.get("since") || until;
  try { const result = await insights(saved.adAccountId, saved.accessToken, since, until); return Response.json({ connected: true, adAccountId: `act_${saved.adAccountId}`, insights: result.data ?? [] }); }
  catch (error) { return Response.json({ connected: true, adAccountId: `act_${saved.adAccountId}`, insights: [], error: error instanceof Error ? error.message : "Meta Ads unavailable" }, { status: 502 }); }
}

// Kept for backwards compatibility with existing private connections. New
// connections use the browser-based OAuth flow under /api/meta/oauth/start.
export async function POST(request: Request) {
  const body = await request.json() as { workspaceId: number; adAccountId: string; accessToken: string }; const account = body.adAccountId?.replace(/^act_/, "").trim();
  if (!body.workspaceId || !account || !body.accessToken) return Response.json({ error: "Missing Meta connection details" }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10); try { await insights(account, body.accessToken, today, today); } catch { return Response.json({ error: "Meta could not verify that account and token" }, { status: 400 }); }
  await saveMetaConnection(body.workspaceId, account, body.accessToken); return Response.json({ ok: true, connected: true });
}

export async function DELETE(request: Request) {
  const workspaceId = Number(new URL(request.url).searchParams.get("workspaceId") || 0);
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) return Response.json({ error: "Invalid workspace" }, { status: 400 });
  await deleteMetaConnection(workspaceId); return Response.json({ ok: true });
}
