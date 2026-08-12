ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "attribution_source" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "attribution_medium" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "attribution_campaign" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "attribution_video" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicant_events" ADD COLUMN IF NOT EXISTS "source" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicant_events" ADD COLUMN IF NOT EXISTS "medium" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicant_events" ADD COLUMN IF NOT EXISTS "campaign" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicant_events" ADD COLUMN IF NOT EXISTS "content" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicant_events" ADD COLUMN IF NOT EXISTS "video_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicant_events" ADD COLUMN IF NOT EXISTS "landing_page" text DEFAULT '' NOT NULL;
