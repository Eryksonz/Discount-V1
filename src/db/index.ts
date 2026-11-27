import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cachedClient: ReturnType<typeof postgres> | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && url.startsWith("postgres"));
}

export function getDb() {
  if (!isDatabaseConfigured()) {
    return null;
  }
  if (!cachedDb) {
    cachedClient = postgres(process.env.DATABASE_URL!, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    cachedDb = drizzle(cachedClient, { schema });
  }
  return cachedDb;
}

export function getSqlClient() {
  if (!isDatabaseConfigured()) {
    return null;
  }
  if (!cachedClient) {
    getDb();
  }
  return cachedClient;
}
