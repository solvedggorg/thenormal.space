#!/usr/bin/env node
// After `astro build`, Workers Builds still runs
// `npx wrangler deploy --config wrangler.jsonc`. That file's `main` is the
// Vite virtual entry (`@astrojs/cloudflare/entrypoints/server`), which is not
// a file Wrangler can deploy. Rewrite it to the generated worker so the
// dashboard command works. Local `bun run build` leaves wrangler.jsonc alone.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const storeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function shouldRewrite(env = process.env, argv = process.argv.slice(2)) {
  return env.WORKERS_CI === "1" || argv.includes("--force");
}

export function rewriteWranglerForDeploy(root = storeRoot) {
  const entry = join(root, "dist/server/entry.mjs");
  const client = join(root, "dist/client");
  const wranglerPath = join(root, "wrangler.jsonc");

  if (!existsSync(entry)) {
    throw new Error(`shop deploy: missing ${entry} — run astro build first`);
  }
  if (!existsSync(client)) {
    throw new Error(`shop deploy: missing ${client} — run astro build first`);
  }

  const text = readFileSync(wranglerPath, "utf8");
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const cfg = JSON.parse(stripped);
  cfg.main = "./dist/server/entry.mjs";
  cfg.assets = { ...cfg.assets, directory: "./dist/client" };
  cfg.no_bundle = true;
  writeFileSync(wranglerPath, `${JSON.stringify(cfg, null, 2)}\n`);
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  if (!shouldRewrite()) {
    process.exit(0);
  }
  try {
    rewriteWranglerForDeploy();
    console.log("shop deploy: pointed wrangler.jsonc at dist/server/entry.mjs");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
