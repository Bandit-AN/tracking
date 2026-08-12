import "dotenv/config";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl === "[SENSITIVE]") {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const sql = neon(databaseUrl);
const db = drizzle(sql);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Database migrations completed successfully.");
