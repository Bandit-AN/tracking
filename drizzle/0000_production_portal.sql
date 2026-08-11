DO $$ BEGIN
  CREATE TYPE "portal_role" AS ENUM ('admin', 'team_member', 'student');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "portal_user_status" AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "team_role" AS ENUM ('closer', 'setter', 'operator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" bigint PRIMARY KEY,
  "name" text NOT NULL,
  "avatar" text NOT NULL DEFAULT '',
  "industry" text NOT NULL DEFAULT 'Sales workspace',
  "initials" text NOT NULL DEFAULT '',
  "color" text NOT NULL DEFAULT '#7646ff',
  "sheet_url" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "auth_user_id" text,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "role" "portal_role" NOT NULL,
  "status" "portal_user_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_auth_user_id_uidx" ON "portal_users" ("auth_user_id") WHERE "auth_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_email_lower_uidx" ON "portal_users" (lower("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_email_uidx" ON "portal_users" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "portal_users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspace_user_uidx" ON "workspace_members" ("workspace_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_user_idx" ON "workspace_members" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payouts" (
  "id" bigint PRIMARY KEY,
  "workspace_id" bigint NOT NULL,
  "member" text NOT NULL,
  "date" date NOT NULL,
  "method" text NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payouts'
      AND column_name = 'date' AND data_type = 'text'
  ) THEN
    IF EXISTS (SELECT 1 FROM "payouts" WHERE "date" !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'payouts.date contains a non-ISO value; migration stopped without modifying it';
    END IF;
    ALTER TABLE "payouts" ALTER COLUMN "date" TYPE date USING "date"::date;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "amount" TYPE numeric(14,2) USING "amount"::numeric(14,2);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_created_by_user_id_portal_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "portal_users"("id") ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_workspace_date_idx" ON "payouts" ("workspace_id", "date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "portal_user_id" uuid REFERENCES "portal_users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "email" text,
  "role" "team_role" NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_workspace_name_role_uidx" ON "team_members" ("workspace_id", "name", "role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_portal_user_idx" ON "team_members" ("portal_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_performance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "team_member_id" uuid NOT NULL REFERENCES "team_members"("id") ON DELETE CASCADE,
  "calls" bigint NOT NULL DEFAULT 0,
  "closed" bigint NOT NULL DEFAULT 0,
  "cash_collected" numeric(14,2) NOT NULL DEFAULT 0,
  "revenue" numeric(14,2) NOT NULL DEFAULT 0,
  "commission" numeric(14,2) NOT NULL DEFAULT 0,
  "paid" numeric(14,2) NOT NULL DEFAULT 0,
  "synced_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_performance_member_uidx" ON "team_performance" ("team_member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_performance_workspace_idx" ON "team_performance" ("workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "client_user_id" uuid REFERENCES "portal_users"("id") ON DELETE SET NULL,
  "source_key" text NOT NULL,
  "lead_name" text NOT NULL,
  "phone" text NOT NULL DEFAULT '',
  "email" text NOT NULL DEFAULT '',
  "setter" text NOT NULL DEFAULT '',
  "closer" text NOT NULL DEFAULT '',
  "payment_method" text NOT NULL DEFAULT '',
  "cash_collected" numeric(14,2) NOT NULL DEFAULT 0,
  "offer_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "amount_owed" numeric(14,2) NOT NULL DEFAULT 0,
  "closed_at" date,
  "next_payment_at" date,
  "contract_end_at" date,
  "synced_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deals_workspace_source_uidx" ON "deals" ("workspace_id", "source_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_workspace_closed_idx" ON "deals" ("workspace_id", "closed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_client_user_idx" ON "deals" ("client_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "client_user_id" uuid REFERENCES "portal_users"("id") ON DELETE SET NULL,
  "source_key" text NOT NULL,
  "scheduled_at" date NOT NULL,
  "status" text NOT NULL DEFAULT 'booked',
  "taken" boolean NOT NULL DEFAULT false,
  "synced_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meetings_workspace_source_uidx" ON "meetings" ("workspace_id", "source_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_workspace_date_idx" ON "meetings" ("workspace_id", "scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_client_user_idx" ON "meetings" ("client_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_runs" (
  "id" bigserial PRIMARY KEY,
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "records_imported" bigint NOT NULL DEFAULT 0,
  "error_message" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_workspace_started_idx" ON "sync_runs" ("workspace_id", "started_at");
