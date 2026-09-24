import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { __pool?: Pool };
const pool =
  g.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 20_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
if (!g.__pool) {
  // Serverless databases (Neon, Supabase) close idle connections; don't let that crash the app.
  pool.on("error", (err) => console.error("[db] idle connection closed:", err.message));
}
if (process.env.NODE_ENV !== "production") g.__pool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export * as t from "./schema";
