CREATE TABLE IF NOT EXISTS "applicant_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" bigint NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "source_key" text NOT NULL,
  "occurred_at" date NOT NULL,
  "event_name" text NOT NULL DEFAULT 'application_submitted',
  "synced_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "applicant_events_workspace_source_uidx"
  ON "applicant_events" ("workspace_id", "source_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "applicant_events_workspace_date_idx"
  ON "applicant_events" ("workspace_id", "occurred_at");
