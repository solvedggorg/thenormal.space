import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewriteWranglerForDeploy, shouldRewrite } from "./point-wrangler-at-dist.mjs";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shop-wrangler-"));
  dirs.push(root);
  mkdirSync(join(root, "dist/server"), { recursive: true });
  mkdirSync(join(root, "dist/client"), { recursive: true });
  writeFileSync(join(root, "dist/server/entry.mjs"), "export default {}\n");
  writeFileSync(
    join(root, "wrangler.jsonc"),
    `{
  // virtual entry used by astro/vite
  "name": "thenormalspace-shop",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": true
  }
}
`,
  );
  return root;
}

test("rewrites only on Workers CI or --force", () => {
  expect(shouldRewrite({}, [])).toBe(false);
  expect(shouldRewrite({ CI: "true" }, [])).toBe(false);
  expect(shouldRewrite({ WORKERS_CI: "1" }, [])).toBe(true);
  expect(shouldRewrite({}, ["--force"])).toBe(true);
});

test("points wrangler.jsonc at the generated worker", () => {
  const root = fixture();
  rewriteWranglerForDeploy(root);
  const cfg = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
  expect(cfg.main).toBe("./dist/server/entry.mjs");
  expect(cfg.assets.directory).toBe("./dist/client");
  expect(cfg.assets.binding).toBe("ASSETS");
  expect(cfg.assets.run_worker_first).toBe(true);
  expect(cfg.no_bundle).toBe(true);
});

test("fails when the astro output is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "shop-wrangler-empty-"));
  dirs.push(root);
  writeFileSync(join(root, "wrangler.jsonc"), `{"main":"x"}\n`);
  expect(() => rewriteWranglerForDeploy(root)).toThrow(/missing/);
});
