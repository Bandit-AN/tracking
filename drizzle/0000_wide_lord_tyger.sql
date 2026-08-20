CREATE TABLE `meta_oauth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` integer NOT NULL,
	`browser_nonce` text NOT NULL,
	`access_token` text NOT NULL,
	`accounts_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_meta_oauth_sessions_expires_at` ON `meta_oauth_sessions` (`expires_at`);