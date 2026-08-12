import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials:
    process.env.DATABASE_URL && process.env.DATABASE_URL !== "[SENSITIVE]"
      ? { url: process.env.DATABASE_URL }
      : undefined,
});
