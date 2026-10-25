// Apply every SQL file in supabase/migrations (in name order) to the database.
// The migrations are idempotent ("if not exists"), so re-running is safe.
// Usage (PowerShell):  npm run db:migrate

import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("POSTGRES_URL_NON_POOLING is not set. Run `vercel env pull .env.local` first.");
  process.exit(1);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(await readFile(new URL(file, dir), "utf8"));
    console.log(`applied ${file}`);
  }
} finally {
  await sql.end();
}
