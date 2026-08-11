CREATE SEQUENCE IF NOT EXISTS "workspaces_id_seq" AS bigint;
--> statement-breakpoint
SELECT setval(
  'workspaces_id_seq',
  GREATEST(COALESCE((SELECT MAX("id") FROM "workspaces"), 0) + 1, 1),
  false
);
--> statement-breakpoint
ALTER SEQUENCE "workspaces_id_seq" OWNED BY "workspaces"."id";
--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "id" SET DEFAULT nextval('workspaces_id_seq');
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "payouts_id_seq" AS bigint;
--> statement-breakpoint
SELECT setval(
  'payouts_id_seq',
  GREATEST(COALESCE((SELECT MAX("id") FROM "payouts"), 0) + 1, 1),
  false
);
--> statement-breakpoint
ALTER SEQUENCE "payouts_id_seq" OWNED BY "payouts"."id";
--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "id" SET DEFAULT nextval('payouts_id_seq');
