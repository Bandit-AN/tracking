CREATE TABLE `whop_connections` (
	`workspace_id` integer PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`token_expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
