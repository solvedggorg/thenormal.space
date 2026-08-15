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
const d1Analytics = requireVal(b, "d1_analytics_id");
const kvAuth = requireVal(b, "kv_auth_id");
const kvShop = requireVal(b, "kv_shop_id");
const kvStats = requireVal(b, "kv_stats_id");
const kvAnalytics = requireVal(b, "kv_analytics_id");
const r2Media = requireVal(b, "r2_media");
const r2Analytics = requireVal(b, "r2_analytics");
const queueName = requireVal(b, "queue_name");
const analyticsQueue = requireVal(b, "analytics_queue_name");
const accountId = requireVal(b, "account_id");
const zoneId = requireVal(b, "zone_id");

function bind(list, name) {
  return (list || []).find((item) => item.binding === name || item.name === name);
}

patch("api/wrangler.jsonc", (cfg) => {
  bind(cfg.d1_databases, "DB").database_id = d1List;
  bind(cfg.d1_databases, "SHOP_DB").database_id = d1Shop;
  bind(cfg.d1_databases, "ANALYTICS_DB").database_id = d1Analytics;
  bind(cfg.kv_namespaces, "SHOP_CACHE").id = kvShop;
  bind(cfg.kv_namespaces, "SINK_CACHE").id = kvAnalytics;
  bind(cfg.r2_buckets, "MEDIA").bucket_name = r2Media;
  bind(cfg.r2_buckets, "SINK_RAW").bucket_name = r2Analytics;
  bind(cfg.queues.producers, "SHOP_EVENTS").queue = queueName;
  bind(cfg.queues.producers, "SINK_EVENTS").queue = analyticsQueue;
  const shopConsumer = (cfg.queues.consumers || []).find((item) => item.queue.includes("shop"));
  const sinkConsumer = (cfg.queues.consumers || []).find((item) => item.queue.includes("analytics"));
  if (shopConsumer) shopConsumer.queue = queueName;
  if (sinkConsumer) sinkConsumer.queue = analyticsQueue;
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

patch("analytics/wrangler.jsonc", (cfg) => {
  bind(cfg.d1_databases, "ANALYTICS_DB").database_id = d1Analytics;
  bind(cfg.kv_namespaces, "KV").id = kvAnalytics;
  cfg.vars.CF_ACCOUNT_ID = accountId;
  if (b.analytics_policy_aud) {
    cfg.vars.POLICY_AUD = b.analytics_policy_aud;
    if (cfg.access?.dev) cfg.access.dev.aud = b.analytics_policy_aud;
  }
  if (b.team_domain) cfg.vars.TEAM_DOMAIN = b.team_domain;
});
