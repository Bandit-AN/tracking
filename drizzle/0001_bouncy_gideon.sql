CREATE TABLE `whop_oauth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` integer NOT NULL,
	`browser_nonce` text NOT NULL,
	`code_verifier` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` text,
	`accounts_json` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_whop_oauth_sessions_expires_at` ON `whop_oauth_sessions` (`expires_at`);