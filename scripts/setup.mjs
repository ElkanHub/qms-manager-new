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


// The SOP storage bucket (private; the app reads it via short-lived signed
// URLs). Idempotent — an existing bucket is left alone. The upload action
// also self-heals if this step was skipped.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (supabaseUrl && serviceKey) {
  console.log("\u2192 Ensuring the sop-files storage bucket exists...");
  const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ id: "sop-files", name: "sop-files", public: false }),
  });
  if (res.ok) console.log("  bucket created");
  else {
    const body = await res.text();
    if (/already exists|Duplicate/i.test(body)) console.log("  bucket already exists");
    else console.warn(`  could not create bucket (${res.status}): ${body} \u2014 the app will retry on first upload`);
  }
} else {
  console.warn("\u2192 Skipping bucket creation (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)");
}

console.log("\n✓ Environment is up. Run `npm run db:test` to verify the substrate.");
