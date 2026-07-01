// One documented command to stand up the environment against your hosted Supabase
// project: `npm run setup`. It verifies env, pushes migrations, and applies the seed.
//
// Requires .env.local filled in (see .env.example). No Docker needed — this targets
// your linked hosted project, not a local stack.
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function loadEnvLocal() {
  if (!existsSync(".env.local")) {
    console.error("Missing .env.local — copy .env.example to .env.local and fill in credentials.");
    process.exit(1);
  }
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function require(name) {
  if (!process.env[name]) {
    console.error(`Missing required env: ${name} (set it in .env.local)`);
    process.exit(1);
  }
  return process.env[name];
}

loadEnvLocal();
const ref = require("SUPABASE_PROJECT_REF");
require("SUPABASE_DB_URL");

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

console.log("→ Linking Supabase project...");
run(`npx supabase link --project-ref ${ref}`);

console.log("→ Pushing migrations...");
run("npx supabase db push");

console.log("→ Applying seed...");
run(`npx supabase db push --include-seed`);

console.log("\n✓ Environment is up. Run `npm run db:test` to verify the substrate.");
