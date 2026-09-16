// Apply db/schema.sql to DATABASE_URL. Idempotent.
//   npm run db:migrate
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main(): Promise<void> {
  const { getPool } = await import("../src/lib/db");
  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const pool = getPool();
  await pool.query(sql);
  await pool.end();
  console.log("schema applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
