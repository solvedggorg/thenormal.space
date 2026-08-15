import { expect, test } from "bun:test";
import { app } from "../src/index";

function memoryKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function memoryDb() {
  const sites = [
    { id: "tns", name: "The Normal Space" },
    { id: "shop", name: "Shop" },
  ];
  const hosts = [
    { site_id: "tns", host: "thenormal.space" },
    { site_id: "shop", host: "shop.thenormal.space" },
  ];
  return {
    prepare(sql: string) {
      const exec = {
        async all() {
          if (sql.includes("FROM sites")) return { results: sites };
          if (sql.includes("FROM site_hosts")) return { results: hosts };
          if (sql.includes("FROM goals")) return { results: [] };
          return { results: [] };
        },
        async first() {
          return null;
        },
        async run() {
          return { success: true };
        },
        bind() {
          return exec;
        },
      };
      return exec;
    },
  };
}

function env(overrides: Record<string, unknown> = {}) {
  return {
    ANALYTICS_DB: memoryDb(),
    KV: memoryKv(),
    ASSETS: { fetch: () => new Response("ok") },
    CF_ACCOUNT_ID: "acct",
    SINK_ORIGIN: "https://api.thenormal.space",
    ALLOW_DEV_ACCESS: "true",
    DEV_ACCESS_EMAIL: "dev@thenormal.space",
    ...overrides,
  };
}

const origin = "https://admin3.thenormal.space";

test("health is the signed-in email", async () => {
  const res = await app.request(`${origin}/health`, {}, env());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, admin: "dev@thenormal.space" });
});

test("lists first-party sites", async () => {
  const res = await app.request(`${origin}/api/sites`, {}, env());
  expect(res.status).toBe(200);
  const body = (await res.json()) as { sites: { id: string }[] };
  expect(body.sites.map((s) => s.id)).toEqual(["tns", "shop"]);
});

test("snippet is the sink script", async () => {
  const res = await app.request(`${origin}/api/sites/tns/snippet`, {}, env());
  expect(res.status).toBe(200);
  const body = (await res.json()) as { html: string };
  expect(body.html).toContain("https://api.thenormal.space/v1/sink/script.js");
  expect(body.html).toContain('data-site-id="tns"');
});

test("overview without a token is unavailable, not fake zeros presented as live data", async () => {
  const res = await app.request(`${origin}/api/overview?site=tns&range=7d`, {}, env());
  expect(res.status).toBe(200);
  const body = (await res.json()) as { unavailable?: boolean; visitors: number };
  expect(body.unavailable).toBe(true);
  expect(body.visitors).toBe(0);
});

test("Access is required when not in dev", async () => {
  const res = await app.request(
    `${origin}/api/sites`,
    {},
    env({ ALLOW_DEV_ACCESS: "", TEAM_DOMAIN: "https://iresolved-llc.cloudflareaccess.com", POLICY_AUD: "aud" }),
  );
  expect(res.status).toBe(403);
});

test("unknown site id is 404", async () => {
  const res = await app.request(`${origin}/api/overview?site=nope!`, {}, env());
  expect(res.status).toBe(404);
});
