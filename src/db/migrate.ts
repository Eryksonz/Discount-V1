import { config } from "dotenv";
import fs from "fs";
import path from "path";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function migrate() {
  // Per neon-postgres best practices: always prefer direct (unpooled) connection for migrations
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL_UNPOOLED / DATABASE_URL is not set. Run `neon deploy` or configure .env.local.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const migrationFile = path.resolve(process.cwd(), "src/db/migrations/0001_init.sql");
  const ddl = fs.readFileSync(migrationFile, "utf8");

  console.log("Applying migration 0001_init.sql via direct Postgres connection...");
  await sql.unsafe(ddl);
  console.log("Migration complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
