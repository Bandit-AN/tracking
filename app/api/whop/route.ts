import { canAccessWorkspace, canEdit, forbiddenResponse, getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";
import { fetchWhopCampaigns, revokeWhopToken } from "@/lib/whop-oauth";
import { deleteWhopConnection, getWhopConnection } from "@/lib/whop-store";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request.headers); if (!user) return unauthorizedResponse(); const url = new URL(request.url); const workspaceId = Number(url.searchParams.get("workspaceId") || 1); if (!canAccessWorkspace(user, workspaceId)) return forbiddenResponse(); const connection = await getWhopConnection(workspaceId); if (!connection) return Response.json({ connected: false, campaigns: [] });
  const until = url.searchParams.get("until") || new Date().toISOString().slice(0, 10); const since = url.searchParams.get("since") || until;
  try { const campaigns = await fetchWhopCampaigns(connection.accessToken, connection.accountId, since, until); return Response.json({ connected: true, accountId: connection.accountId, accountName: connection.accountName, campaigns }); }
  catch (error) { return Response.json({ connected: true, accountId: connection.accountId, accountName: connection.accountName, campaigns: [], error: error instanceof Error ? error.message : "Whop Ads unavailable" }, { status: 502 }); }
}

export async function DELETE(request: Request) { const user = await getAuthenticatedUser(request.headers); if (!user) return unauthorizedResponse(); if (!canEdit(user)) return forbiddenResponse(); const workspaceId = Number(new URL(request.url).searchParams.get("workspaceId") || 0); if (!canAccessWorkspace(user, workspaceId)) return forbiddenResponse(); const connection = await getWhopConnection(workspaceId); if (connection) await revokeWhopToken(connection.refreshToken); await deleteWhopConnection(workspaceId); return Response.json({ ok: true }); }
