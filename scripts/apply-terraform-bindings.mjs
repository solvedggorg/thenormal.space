#!/usr/bin/env node
// Write Terraform wrangler_bindings output into first-party wrangler.jsonc files.
// Usage (from repo root):
//   terraform -chdir=infra output -json wrangler_bindings | node scripts/apply-terraform-bindings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseJsonc(text) {
  return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
}

function patch(rel, apply) {
  const path = join(root, rel);
  const cfg = parseJsonc(readFileSync(path, "utf8"));
  apply(cfg);
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`updated ${rel}`);
}

function requireVal(bindings, key) {
  const value = bindings[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`wrangler_bindings missing ${key}`);
  }
  return value;
}

const input = readFileSync(0, "utf8").trim();
if (!input) {
  console.error("pipe `terraform -chdir=infra output -json wrangler_bindings` into this script");
  process.exit(2);
}
const parsed = JSON.parse(input);
const b = parsed.value ?? parsed;

const d1Auth = requireVal(b, "d1_auth_id");
const d1List = requireVal(b, "d1_list_id");
const d1Shop = requireVal(b, "d1_shop_id");
const kvAuth = requireVal(b, "kv_auth_id");
const kvShop = requireVal(b, "kv_shop_id");
const kvStats = requireVal(b, "kv_stats_id");
const r2Media = requireVal(b, "r2_media");
const queueName = requireVal(b, "queue_name");
const accountId = requireVal(b, "account_id");
const zoneId = requireVal(b, "zone_id");

patch("api/wrangler.jsonc", (cfg) => {
  cfg.d1_databases[0].database_id = d1List;
  cfg.d1_databases[1].database_id = d1Shop;
  cfg.kv_namespaces[0].id = kvShop;
  cfg.r2_buckets[0].bucket_name = r2Media;
  cfg.queues.producers[0].queue = queueName;
  cfg.queues.consumers[0].queue = queueName;
});

patch("auth/wrangler.jsonc", (cfg) => {
  cfg.d1_databases[0].database_id = d1Auth;
  cfg.kv_namespaces[0].id = kvAuth;
});

patch("auth/admin/wrangler.jsonc", (cfg) => {
  cfg.d1_databases[0].database_id = d1Auth;
  cfg.kv_namespaces[0].id = kvAuth;
  if (b.policy_aud) {
    cfg.vars.POLICY_AUD = b.policy_aud;
    if (cfg.access?.dev) cfg.access.dev.aud = b.policy_aud;
  }
  if (b.team_domain) cfg.vars.TEAM_DOMAIN = b.team_domain;
});

patch("stats/app/wrangler.jsonc", (cfg) => {
  cfg.kv_namespaces[0].id = kvStats;
  cfg.vars.CF_ACCOUNT_ID = accountId;
  cfg.vars.CF_ZONE_ID = zoneId;
});

patch("store/wrangler.jsonc", (cfg) => {
  cfg.kv_namespaces[0].id = kvShop;
  cfg.r2_buckets[0].bucket_name = r2Media;
});

patch("store/backend/wrangler.jsonc", (cfg) => {
  if (b.hyperdrive_id) cfg.hyperdrive[0].id = b.hyperdrive_id;
  cfg.r2_buckets[0].bucket_name = r2Media;
  cfg.vars.S3_BUCKET = r2Media;
  cfg.vars.S3_ENDPOINT = `https://${accountId}.r2.cloudflarestorage.com`;
});
