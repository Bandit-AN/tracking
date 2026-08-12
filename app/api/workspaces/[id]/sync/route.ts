import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  deals,
  meetings,
  syncRuns,
  teamMembers,
  teamPerformance,
  workspaces,
} from "@/db/schema";
import {
  canAccessWorkspace,
  requireAdmin,
  requireApiUser,
} from "@/lib/auth/authorization";
import { importGoogleSheet } from "@/lib/google-sheets";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;
  const denied = requireAdmin(authResult.context);
  if (denied) return denied;

  const workspaceId = Number((await params).id);
  if (!(await canAccessWorkspace(authResult.context, workspaceId))) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const db = getDb();
  const [workspace] = await db
    .select({ sheetUrl: workspaces.sheetUrl })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace?.sheetUrl) {
    return Response.json({ error: "No Google Sheet is configured" }, { status: 400 });
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ workspaceId, status: "running" })
    .returning({ id: syncRuns.id, startedAt: syncRuns.startedAt });

  try {
    const imported = await importGoogleSheet(workspace.sheetUrl);
    const syncedAt = new Date();

    for (const person of imported.people) {
      const [member] = await db
        .insert(teamMembers)
        .values({
          workspaceId,
          name: person.name,
          role: person.role,
          updatedAt: syncedAt,
        })
        .onConflictDoUpdate({
          target: [teamMembers.workspaceId, teamMembers.name, teamMembers.role],
          set: { active: true, updatedAt: syncedAt },
        })
        .returning({ id: teamMembers.id });

      await db
        .insert(teamPerformance)
        .values({
          workspaceId,
          teamMemberId: member.id,
          calls: person.calls,
          closed: person.closed,
          cashCollected: person.cash,
          revenue: person.revenue,
          commission: person.commission,
          paid: person.paid,
          syncedAt,
        })
        .onConflictDoUpdate({
          target: teamPerformance.teamMemberId,
          set: {
            calls: person.calls,
            closed: person.closed,
            cashCollected: person.cash,
            revenue: person.revenue,
            commission: person.commission,
            paid: person.paid,
            syncedAt,
          },
        });
    }

    if (imported.deals.length) {
      await db
        .insert(deals)
        .values(
          imported.deals.map((deal) => ({ ...deal, workspaceId, syncedAt })),
        )
        .onConflictDoUpdate({
          target: [deals.workspaceId, deals.sourceKey],
          set: {
            leadName: sql`excluded."lead_name"`,
            phone: sql`excluded."phone"`,
            email: sql`excluded."email"`,
            setter: sql`excluded."setter"`,
            closer: sql`excluded."closer"`,
            paymentMethod: sql`excluded."payment_method"`,
            cashCollected: sql`excluded."cash_collected"`,
            offerAmount: sql`excluded."offer_amount"`,
            amountOwed: sql`excluded."amount_owed"`,
            closedAt: sql`excluded."closed_at"`,
            nextPaymentAt: sql`excluded."next_payment_at"`,
            contractEndAt: sql`excluded."contract_end_at"`,
            syncedAt,
            updatedAt: syncedAt,
          },
        });
    }

    if (imported.meetings.length) {
      await db
        .insert(meetings)
        .values(
          imported.meetings.map((meeting) => ({
            ...meeting,
            workspaceId,
            syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [meetings.workspaceId, meetings.sourceKey],
          set: {
            scheduledAt: sql`excluded."scheduled_at"`,
            status: sql`excluded."status"`,
            taken: sql`excluded."taken"`,
            syncedAt,
            updatedAt: syncedAt,
          },
        });
    }

    const recordsImported =
      imported.people.length +
      imported.deals.length +
      imported.meetings.length +
      Math.max(0, imported.applicantCount - 17);
    await db
      .update(syncRuns)
      .set({ status: "succeeded", recordsImported, finishedAt: new Date() })
      .where(eq(syncRuns.id, run.id));
    await db
      .update(workspaces)
      .set({ applicantCount: imported.applicantCount, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    return Response.json({ ok: true, recordsImported });
  } catch (error) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error",
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, run.id));
    return Response.json(
      { error: "The data source could not be synchronized" },
      { status: 502 },
    );
  }
}
