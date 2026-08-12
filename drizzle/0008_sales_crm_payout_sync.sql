ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "lead_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "setter" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "closer" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recording_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "feedback" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "source_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_workspace_source_uidx" ON "payouts" ("workspace_id", "source_key");
