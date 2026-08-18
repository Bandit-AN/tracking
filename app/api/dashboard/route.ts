import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  applicantEvents,
  deals,
  meetings,
  metaAdInsights,
  metaConnections,
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
  const isAgency =
    workspaceId === 0 && authResult.context.portalUser.role === "admin";
  if (
    !isAgency &&
    !(await canAccessWorkspace(authResult.context, workspaceId))
  ) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const db = getDb();
  const isStudent = authResult.context.portalUser.role === "student";
  const [
    workspaceRows,
    performanceRows,
    dealRows,
    meetingRows,
    applicantRows,
    applicantBaselineRows,
    payoutRows,
    syncRows,
    metaInsightRows,
    metaConnectionRows,
  ] =
    await Promise.all([
      isAgency
        ? Promise.resolve([
            {
              id: 0,
              name: "Agency overview",
              avatar: null,
              industry: "All client offers",
              initials: "MR",
              color: "#7646ff",
              sheetUrl: null,
              updatedAt: new Date(),
            },
          ])
        : db
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
              isAgency
                ? eq(teamMembers.active, true)
                : and(
                    eq(teamMembers.workspaceId, workspaceId),
                    eq(teamMembers.active, true),
                  ),
            ),
      db
        .select({
          id: deals.id,
          workspaceId: deals.workspaceId,
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
          source: deals.attributionSource,
          medium: deals.attributionMedium,
          campaign: deals.attributionCampaign,
          video: deals.attributionVideo,
        })
        .from(deals)
        .where(
          isAgency
            ? undefined
            : isStudent
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
          workspaceId: meetings.workspaceId,
          lead: meetings.leadName,
          phone: meetings.phone,
          email: meetings.email,
          setter: meetings.setter,
          closer: meetings.closer,
          date: meetings.scheduledAt,
          status: meetings.status,
          taken: meetings.taken,
          notes: meetings.notes,
          recording: meetings.recordingUrl,
          feedback: meetings.feedback,
        })
        .from(meetings)
        .where(
          isAgency
            ? undefined
            : isStudent
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
              id: applicantEvents.id,
              workspaceId: applicantEvents.workspaceId,
              date: applicantEvents.occurredAt,
              event: applicantEvents.eventName,
              source: applicantEvents.source,
              medium: applicantEvents.medium,
              campaign: applicantEvents.campaign,
              content: applicantEvents.content,
              video: applicantEvents.videoId,
            })
            .from(applicantEvents)
            .where(isAgency ? undefined : eq(applicantEvents.workspaceId, workspaceId))
            .orderBy(desc(applicantEvents.occurredAt)),
      isStudent
        ? Promise.resolve([{ value: 0 }])
        : isAgency
          ? db.select({ value: sql<number>`count(*) * 17` }).from(workspaces)
          : Promise.resolve([{ value: 17 }]),
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
            .where(isAgency ? undefined : eq(payouts.workspaceId, workspaceId))
            .orderBy(desc(payouts.date), desc(payouts.id)),
      db
        .select({
          status: syncRuns.status,
          recordsImported: syncRuns.recordsImported,
          finishedAt: syncRuns.finishedAt,
        })
        .from(syncRuns)
        .where(isAgency ? undefined : eq(syncRuns.workspaceId, workspaceId))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1),
      db
        .select({
          id: metaAdInsights.id,
          workspaceId: metaAdInsights.workspaceId,
          date: metaAdInsights.date,
          adAccountId: metaAdInsights.adAccountId,
          campaignId: metaAdInsights.campaignId,
          campaignName: metaAdInsights.campaignName,
          impressions: metaAdInsights.impressions,
          reach: metaAdInsights.reach,
          clicks: metaAdInsights.clicks,
          spend: metaAdInsights.spend,
          leads: metaAdInsights.leads,
          purchases: metaAdInsights.purchases,
          purchaseValue: metaAdInsights.purchaseValue,
        })
        .from(metaAdInsights)
        .where(isAgency ? undefined : eq(metaAdInsights.workspaceId, workspaceId))
        .orderBy(desc(metaAdInsights.date)),
      db
        .select({
          workspaceId: metaConnections.workspaceId,
          adAccountName: metaConnections.adAccountName,
          currency: metaConnections.currency,
          status: metaConnections.status,
          lastSyncedAt: metaConnections.lastSyncedAt,
        })
        .from(metaConnections)
        .where(isAgency ? undefined : eq(metaConnections.workspaceId, workspaceId)),
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
    attributionEvents: applicantRows,
    applicantBaseline: Number(applicantBaselineRows[0]?.value ?? 0),
    payouts: payoutRows,
    lastSync: syncRows[0] ?? null,
    metaInsights: metaInsightRows,
    metaConnections: metaConnectionRows,
    permissions: {
      canManage:
        authResult.context.portalUser.role === "admin" && !isAgency,
      canViewTeam: !isStudent,
      canViewPayouts: !isStudent,
    },
  });
}
