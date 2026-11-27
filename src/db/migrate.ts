import { config } from "dotenv";
import fs from "fs";
import path from "path";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function migrate() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL_UNPOOLED / DATABASE_URL is not set. Run `neon deploy` or configure .env.local."
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const ddl = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration ${file} via direct Postgres connection...`);
    await sql.unsafe(ddl);
  }

  console.log(`All ${files.length} migrations applied cleanly.`);
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
