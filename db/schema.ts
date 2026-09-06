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

export const whopOauthSessions = sqliteTable("whop_oauth_sessions", {
  id: text("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  browserNonce: text("browser_nonce").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: text("token_expires_at"),
  accountsJson: text("accounts_json"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_whop_oauth_sessions_expires_at").on(table.expiresAt)]);

export const whopConnections = sqliteTable("whop_connections", {
  workspaceId: integer("workspace_id").primaryKey(),
  accountId: text("account_id").notNull(),
  accountName: text("account_name").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: text("token_expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
