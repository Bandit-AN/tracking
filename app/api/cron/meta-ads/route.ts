import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { metaConnections } from "@/db/schema";
import { syncMetaAdsForWorkspace } from "@/lib/meta";

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const connections = await getDb()
    .select({ workspaceId: metaConnections.workspaceId })
    .from(metaConnections)
    .where(eq(metaConnections.status, "active"));
  const results: Array<{ workspaceId: number; ok: boolean; recordsImported?: number }> = [];
  for (const connection of connections) {
    try {
      const sync = await syncMetaAdsForWorkspace(connection.workspaceId, 30);
      results.push({ workspaceId: connection.workspaceId, ok: true, recordsImported: sync.recordsImported });
    } catch {
      results.push({ workspaceId: connection.workspaceId, ok: false });
    }
  }
  return Response.json({ ok: results.every((result) => result.ok), results });
}
