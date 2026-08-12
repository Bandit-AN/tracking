import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const portalRole = pgEnum("portal_role", [
  "admin",
  "team_member",
  "student",
]);

export const portalUserStatus = pgEnum("portal_user_status", [
  "active",
  "disabled",
]);

export const teamRole = pgEnum("team_role", [
  "closer",
  "setter",
  "operator",
]);

export const portalUsers = pgTable(
  "portal_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: text("auth_user_id").unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: portalRole("role").notNull(),
    status: portalUserStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("portal_users_email_uidx").on(table.email)],
);

// These two tables predate the production migration. Their column definitions
// intentionally remain compatible with the existing Neon records.
export const workspaces = pgTable("workspaces", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull().default(""),
  industry: text("industry").notNull().default("Sales workspace"),
  initials: text("initials").notNull().default(""),
  color: text("color").notNull().default("#7646ff"),
  sheetUrl: text("sheet_url").notNull().default(""),
  applicantCount: bigint("applicant_count", { mode: "number" })
    .notNull()
    .default(17),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_uidx").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_user_idx").on(table.userId),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    member: text("member").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    method: text("method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" })
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(
      () => portalUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payouts_workspace_date_idx").on(table.workspaceId, table.date),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    portalUserId: uuid("portal_user_id").references(() => portalUsers.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email"),
    role: teamRole("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("team_members_workspace_name_role_uidx").on(
      table.workspaceId,
      table.name,
      table.role,
    ),
    index("team_members_portal_user_idx").on(table.portalUserId),
  ],
);

export const teamPerformance = pgTable(
  "team_performance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamMemberId: uuid("team_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    calls: bigint("calls", { mode: "number" }).notNull().default(0),
    closed: bigint("closed", { mode: "number" }).notNull().default(0),
    cashCollected: numeric("cash_collected", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    revenue: numeric("revenue", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    commission: numeric("commission", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    paid: numeric("paid", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("team_performance_member_uidx").on(table.teamMemberId),
    index("team_performance_workspace_idx").on(table.workspaceId),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientUserId: uuid("client_user_id").references(() => portalUsers.id, {
      onDelete: "set null",
    }),
    sourceKey: text("source_key").notNull(),
    leadName: text("lead_name").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    setter: text("setter").notNull().default(""),
    closer: text("closer").notNull().default(""),
    paymentMethod: text("payment_method").notNull().default(""),
    cashCollected: numeric("cash_collected", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    offerAmount: numeric("offer_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    amountOwed: numeric("amount_owed", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    closedAt: date("closed_at", { mode: "string" }),
    nextPaymentAt: date("next_payment_at", { mode: "string" }),
    contractEndAt: date("contract_end_at", { mode: "string" }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("deals_workspace_source_uidx").on(
      table.workspaceId,
      table.sourceKey,
    ),
    index("deals_workspace_closed_idx").on(table.workspaceId, table.closedAt),
    index("deals_client_user_idx").on(table.clientUserId),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientUserId: uuid("client_user_id").references(() => portalUsers.id, {
      onDelete: "set null",
    }),
    sourceKey: text("source_key").notNull(),
    scheduledAt: date("scheduled_at", { mode: "string" }).notNull(),
    status: text("status").notNull().default("booked"),
    taken: boolean("taken").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("meetings_workspace_source_uidx").on(
      table.workspaceId,
      table.sourceKey,
    ),
    index("meetings_workspace_date_idx").on(
      table.workspaceId,
      table.scheduledAt,
    ),
    index("meetings_client_user_idx").on(table.clientUserId),
  ],
);

export const applicantEvents = pgTable(
  "applicant_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    occurredAt: date("occurred_at", { mode: "string" }).notNull(),
    eventName: text("event_name").notNull().default("application_submitted"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("applicant_events_workspace_source_uidx").on(
      table.workspaceId,
      table.sourceKey,
    ),
    index("applicant_events_workspace_date_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: bigint("workspace_id", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    recordsImported: bigint("records_imported", { mode: "number" })
      .notNull()
      .default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("sync_runs_workspace_started_idx").on(table.workspaceId, table.startedAt)],
);
