CREATE TABLE IF NOT EXISTS "meta_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "connected_by_user_id" uuid REFERENCES "portal_users"("id") ON DELETE SET NULL,
  "meta_user_id" text NOT NULL,
  "meta_user_name" text DEFAULT '' NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "token_expires_at" timestamp with time zone,
  "ad_account_id" text,
  "ad_account_name" text DEFAULT '' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_synced_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "connected_by_user_id" uuid REFERENCES "portal_users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "meta_user_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "meta_user_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "access_token_encrypted" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ALTER COLUMN "access_token_encrypted" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "ad_account_id" text;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "ad_account_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'connected' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_connections_workspace_uidx" ON "meta_connections" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_connections_status_idx" ON "meta_connections" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_oauth_states" (
  "state_hash" text PRIMARY KEY NOT NULL,
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "portal_users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_oauth_states_expires_idx" ON "meta_oauth_states" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ad_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "ad_account_id" text NOT NULL,
  "campaign_id" text NOT NULL,
  "campaign_name" text DEFAULT 'Untitled campaign' NOT NULL,
  "date" date NOT NULL,
  "impressions" bigint DEFAULT 0 NOT NULL,
  "reach" bigint DEFAULT 0 NOT NULL,
  "clicks" bigint DEFAULT 0 NOT NULL,
  "spend" numeric(14,2) DEFAULT 0 NOT NULL,
  "leads" bigint DEFAULT 0 NOT NULL,
  "purchases" bigint DEFAULT 0 NOT NULL,
  "purchase_value" numeric(14,2) DEFAULT 0 NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_ad_insights_workspace_campaign_date_uidx" ON "meta_ad_insights" ("workspace_id", "ad_account_id", "campaign_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_insights_workspace_date_idx" ON "meta_ad_insights" ("workspace_id", "date");
