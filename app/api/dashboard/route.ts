import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  deals,
  meetings,
  payouts,
  syncRuns,
  teamMembers,
  teamPerformance,
  workspaces,
} from "@/db/schema";
import {
  canAccessWorkspace,
  requireApiUser,
} from "@/lib/auth/authorization";

export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;

  const workspaceId = Number(new URL(request.url).searchParams.get("workspaceId"));
  if (!(await canAccessWorkspace(authResult.context, workspaceId))) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const db = getDb();
  const isStudent = authResult.context.portalUser.role === "student";
  const [workspaceRows, performanceRows, dealRows, meetingRows, payoutRows, syncRows] =
    await Promise.all([
      db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          avatar: workspaces.avatar,
          industry: workspaces.industry,
          initials: workspaces.initials,
          color: workspaces.color,
          sheetUrl: workspaces.sheetUrl,
          updatedAt: workspaces.updatedAt,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1),
      isStudent
        ? Promise.resolve([])
        : db
            .select({
              id: teamMembers.id,
              name: teamMembers.name,
              role: teamMembers.role,
              calls: teamPerformance.calls,
              closed: teamPerformance.closed,
              cash: teamPerformance.cashCollected,
              revenue: teamPerformance.revenue,
              commission: teamPerformance.commission,
              paid: teamPerformance.paid,
            })
            .from(teamMembers)
            .innerJoin(
              teamPerformance,
              eq(teamPerformance.teamMemberId, teamMembers.id),
            )
            .where(
              and(
                eq(teamMembers.workspaceId, workspaceId),
                eq(teamMembers.active, true),
              ),
            ),
      db
        .select({
          id: deals.id,
          lead: deals.leadName,
          phone: deals.phone,
          email: deals.email,
          setter: deals.setter,
          closer: deals.closer,
          method: deals.paymentMethod,
          cash: deals.cashCollected,
          offer: deals.offerAmount,
          owed: deals.amountOwed,
          date: deals.closedAt,
          next: deals.nextPaymentAt,
          end: deals.contractEndAt,
        })
        .from(deals)
        .where(
          isStudent
            ? and(
                eq(deals.workspaceId, workspaceId),
                eq(deals.clientUserId, authResult.context.portalUser.id),
              )
            : eq(deals.workspaceId, workspaceId),
        )
        .orderBy(desc(deals.closedAt)),
      db
        .select({
          id: meetings.id,
          date: meetings.scheduledAt,
          status: meetings.status,
          taken: meetings.taken,
        })
        .from(meetings)
        .where(
          isStudent
            ? and(
                eq(meetings.workspaceId, workspaceId),
                eq(meetings.clientUserId, authResult.context.portalUser.id),
              )
            : eq(meetings.workspaceId, workspaceId),
        )
        .orderBy(desc(meetings.scheduledAt)),
      isStudent
        ? Promise.resolve([])
        : db
            .select({
              id: payouts.id,
              workspaceId: payouts.workspaceId,
              member: payouts.member,
              date: payouts.date,
              method: payouts.method,
              amount: payouts.amount,
            })
            .from(payouts)
            .where(eq(payouts.workspaceId, workspaceId))
            .orderBy(desc(payouts.date), desc(payouts.id)),
      db
        .select({
          status: syncRuns.status,
          recordsImported: syncRuns.recordsImported,
          finishedAt: syncRuns.finishedAt,
        })
        .from(syncRuns)
        .where(eq(syncRuns.workspaceId, workspaceId))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1),
    ]);

  if (!workspaceRows[0]) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  return Response.json({
    workspace:
      authResult.context.portalUser.role === "admin"
        ? workspaceRows[0]
        : { ...workspaceRows[0], sheetUrl: undefined },
    performance: performanceRows,
    deals: dealRows,
    meetings: meetingRows,
    payouts: payoutRows,
    lastSync: syncRows[0] ?? null,
    permissions: {
      canManage: authResult.context.portalUser.role === "admin",
      canViewTeam: !isStudent,
      canViewPayouts: !isStudent,
    },
  });
}
