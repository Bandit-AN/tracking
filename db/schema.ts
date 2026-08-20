import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const metaOauthSessions = sqliteTable("meta_oauth_sessions", {
  id: text("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  browserNonce: text("browser_nonce").notNull(),
  accessToken: text("access_token").notNull(),
  accountsJson: text("accounts_json").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_meta_oauth_sessions_expires_at").on(table.expiresAt)]);
