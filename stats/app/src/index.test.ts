import { expect, test } from "bun:test";
import worker, { app, buildAndStore } from "./index";

type RequestInfo = Request | string | URL;

function memoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      return value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test("unknown range is 7d; missing snapshot is 200 with unavailable", async () => {
  const STATS = memoryKv();
  const res = await app.request("https://stats.thenormal.space/api/snapshot?range=nope", {}, { STATS } as never);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.range).toBe("7d");
  expect(body.unavailable).toBe(true);
  expect(JSON.stringify(body)).not.toContain("secret");
});

test("serves stored snapshot and does not leak the token", async () => {
  const STATS = memoryKv();
  await STATS.put(
    "snapshot:24h",
    JSON.stringify({
      range: "24h",
      generatedAt: "2026-08-14T12:00:00.000Z",
      visitors: 1,
      pageviews: 2,
      series: [],
      pages: [],
      referrers: [],
      devices: [],
      states: [],
      blocked: { outsideUs: 0, vpnTor: 0, bots: 0 },
    }),
  );
  const res = await app.request(
    "https://stats.thenormal.space/api/snapshot?range=24h",
    {},
    { STATS, CF_API_TOKEN: "secret-token" } as never,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("max-age=30");
  const text = await res.text();
  expect(text).toContain("\"visitors\":1");
  expect(text).not.toContain("secret-token");
});

test("buildAndStore writes only when both fetches succeed", async () => {
  const STATS = memoryKv();
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("analytics_engine/sql")) {
      return Response.json({ data: [] });
    }
    if (url.includes("graphql")) {
      return Response.json({
        data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [], firewallEventsAdaptiveGroups: [] }] } },
      });
    }
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  try {
    const ok = await buildAndStore({
      STATS,
      CF_API_TOKEN: "t",
      CF_ACCOUNT_ID: "acct",
      CF_ZONE_ID: "zone",
    } as never);
    expect(ok).toBe(true);
    expect(STATS.store.has("snapshot:7d")).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

test("buildAndStore keeps old snapshot when GraphQL fails", async () => {
  const STATS = memoryKv();
  await STATS.put("snapshot:7d", JSON.stringify({ range: "7d", keep: true }));
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("graphql")) return new Response("nope", { status: 429 });
    return Response.json({ data: [] });
  }) as typeof fetch;
  try {
    const ok = await buildAndStore({
      STATS,
      CF_API_TOKEN: "t",
      CF_ACCOUNT_ID: "acct",
      CF_ZONE_ID: "zone",
    } as never);
    expect(ok).toBe(false);
    expect(JSON.parse((await STATS.get("snapshot:7d"))!)).toEqual({ range: "7d", keep: true });
  } finally {
    globalThis.fetch = original;
  }
});

function stubOkFetch() {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const url = String(input);
    if (url.includes("analytics_engine/sql")) return Response.json({ data: [] });
    if (url.includes("graphql")) {
      return Response.json({
        data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [], firewallEventsAdaptiveGroups: [] }] } },
      });
    }
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const cronEnv = (STATS: ReturnType<typeof memoryKv>) =>
  ({
    STATS,
    CF_API_TOKEN: "t",
    CF_ACCOUNT_ID: "acct",
    CF_ZONE_ID: "zone",
  }) as never;

test("GraphQL posts bind zoneTag; AE posts are text/plain", async () => {
  const STATS = memoryKv();
  const stub = stubOkFetch();
  try {
    await buildAndStore(cronEnv(STATS));
  } finally {
    stub.restore();
  }
  const ae = stub.calls.filter((c) => c.url.includes("analytics_engine/sql"));
  const gql = stub.calls.filter((c) => c.url.includes("graphql"));
  expect(ae).toHaveLength(15);
  expect(gql).toHaveLength(6);
  expect(ae[0]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/analytics_engine/sql");
  const aeHeaders = new Headers(ae[0]?.init?.headers);
  expect(aeHeaders.get("content-type")).toBe("text/plain");
  expect(aeHeaders.get("authorization")).toBe("Bearer t");
  const gqlBody = JSON.parse(String(gql[0]?.init?.body)) as {
    query: string;
    variables: { zoneTag: string };
  };
  expect(gqlBody.variables).toEqual({ zoneTag: "zone" });
  expect(gqlBody.query).toContain("$zoneTag");
});

test("buildAndStore keeps old snapshot when GraphQL returns errors", async () => {
  const STATS = memoryKv();
  await STATS.put("snapshot:7d", JSON.stringify({ range: "7d", keep: true }));
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("graphql")) return Response.json({ errors: [{ message: "rate limited" }] });
    return Response.json({ data: [] });
  }) as typeof fetch;
  try {
    const ok = await buildAndStore(cronEnv(STATS));
    expect(ok).toBe(false);
    expect(JSON.parse((await STATS.get("snapshot:7d"))!)).toEqual({ range: "7d", keep: true });
  } finally {
    globalThis.fetch = original;
  }
});

test("failed range is skipped; other ranges still write", async () => {
  const STATS = memoryKv();
  await STATS.put("snapshot:24h", JSON.stringify({ range: "24h", keep: true }));
  let ae = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("analytics_engine/sql")) {
      ae += 1;
      if (ae <= 5) return new Response("no", { status: 500 });
      return Response.json({ data: [] });
    }
    if (url.includes("graphql")) {
      return Response.json({
        data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [], firewallEventsAdaptiveGroups: [] }] } },
      });
    }
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  try {
    const ok = await buildAndStore(cronEnv(STATS));
    expect(ok).toBe(false);
    expect(JSON.parse((await STATS.get("snapshot:24h"))!)).toEqual({ range: "24h", keep: true });
    expect(STATS.store.has("snapshot:7d")).toBe(true);
    expect(STATS.store.has("snapshot:30d")).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

test("successful snapshot is a Snapshot with 51 states", async () => {
  const STATS = memoryKv();
  const stub = stubOkFetch();
  try {
    expect(await buildAndStore(cronEnv(STATS), new Date("2026-08-14T12:00:00.000Z"))).toBe(true);
  } finally {
    stub.restore();
  }
  const snap = JSON.parse((await STATS.get("snapshot:7d"))!) as {
    range: string;
    generatedAt: string;
    visitors: number;
    states: unknown[];
  };
  expect(snap.range).toBe("7d");
  expect(snap.generatedAt).toBe("2026-08-14T12:00:00.000Z");
  expect(snap.visitors).toBe(0);
  expect(snap.states).toHaveLength(51);
});

test("snapshot sets security headers", async () => {
  const STATS = memoryKv();
  const res = await app.request("https://stats.thenormal.space/api/snapshot", {}, { STATS } as never);
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(res.headers.get("x-frame-options")).toBe("DENY");
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get("cache-control")).toContain("max-age=30");
});

test("fetch serves api via Hono and other paths via ASSETS", async () => {
  const STATS = memoryKv();
  const env = {
    STATS,
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  } as never;
  const api = await worker.fetch(new Request("https://stats.thenormal.space/api/snapshot"), env);
  expect(api.status).toBe(200);
  expect(await api.json()).toMatchObject({ range: "7d", unavailable: true });
  const page = await worker.fetch(new Request("https://stats.thenormal.space/"), env);
  expect(await page.text()).toBe("asset");
});

test("scheduled awaits buildAndStore", async () => {
  const STATS = memoryKv();
  const stub = stubOkFetch();
  try {
    await worker.scheduled({}, cronEnv(STATS));
    expect(STATS.store.has("snapshot:24h")).toBe(true);
    expect(STATS.store.has("snapshot:7d")).toBe(true);
    expect(STATS.store.has("snapshot:30d")).toBe(true);
  } finally {
    stub.restore();
  }
});
