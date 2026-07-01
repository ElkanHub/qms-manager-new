// Zero-framework SQL test runner.
// Runs every supabase/tests/*.sql against SUPABASE_DB_URL, each inside a rolled-back
// transaction so tests never pollute the DB. A test file "passes" if it runs without
// raising; it signals failure with `RAISE EXCEPTION` (see tests/_helpers.sql: assert()).
//
// ponytail: no pgTAP dependency — Postgres RAISE + a rollback loop is the whole harness.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const testsDir = join(here, "..", "supabase", "tests");
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set. Copy .env.example → .env.local and fill it in.");
  process.exit(2);
}

const helpers = readFileSync(join(testsDir, "_helpers.sql"), "utf8");
const files = readdirSync(testsDir)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
  .sort();

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

let failed = 0;
for (const file of files) {
  const sql = readFileSync(join(testsDir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(helpers); // assert() helper, scoped to this tx
    await client.query(sql);
    await client.query("rollback");
    console.log(`  ok   ${file}`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    failed++;
    console.error(`  FAIL ${file}\n       ${String(err.message).split("\n")[0]}`);
  }
}

await client.end();
console.log(`\n${files.length - failed}/${files.length} SQL test files passed.`);
process.exit(failed ? 1 : 0);
