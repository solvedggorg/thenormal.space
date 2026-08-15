import { Hono } from "hono";
import {
  aeSql,
  bucketFirewall,
  firewallQuery,
  parseAeTable,
  parseVisits,
  rangeStart,
  visitsQuery,
} from "../../src/query";
import { parseRange, RANGES, type Range, type Snapshot } from "../../src/schema";
import { buildSnapshot, type SnapshotInput } from "../../src/snapshot";

export type StatsBindings = {
  STATS: {
    get(key: string, type?: string): Promise<unknown>;
    put(key: string, value: string): Promise<void>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> | Response };
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_ZONE_ID: string;
};

const GQL_URL = "https://api.cloudflare.com/client/v4/graphql";

export const app = new Hono<{ Bindings: StatsBindings }>();

app.use("*", async (c, next) => {
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-Frame-Options", "DENY");
  await next();
});

app.get("/api/snapshot", async (c) => {
  const range = parseRange(c.req.query("range"));
  const snap = (await c.env.STATS.get(`snapshot:${range}`, "json")) as Snapshot | null;
  c.header("Cache-Control", "public, max-age=30");
  if (snap == null) {
    return c.json({
      range,
      unavailable: true,
      generatedAt: null,
      visitors: 0,
      pageviews: 0,
      series: [],
      pages: [],
      referrers: [],
      devices: [],
      states: [],
      blocked: { outsideUs: 0, vpnTor: 0, bots: 0 },
    });
  }
  return c.json(snap);
});

type FetchOk = { ok: true; json: unknown };
type FetchFail = { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasGraphqlErrors(json: unknown): boolean {
  if (!isRecord(json)) return false;
  const { errors } = json;
  if (errors == null) return false;
  return !Array.isArray(errors) || errors.length > 0;
}

function cellString(row: Record<string, string | number>, key: string): string {
  const value = row[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function cellNumber(row: Record<string, string | number>, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseFirewall(gql: unknown): { ruleId?: string; source?: string; count: number }[] {
  if (!isRecord(gql) || !isRecord(gql.data)) return [];
  const viewer = gql.data.viewer;
  if (!isRecord(viewer) || !Array.isArray(viewer.zones) || !isRecord(viewer.zones[0])) {
    return [];
  }
  const groups = viewer.zones[0].firewallEventsAdaptiveGroups;
  if (!Array.isArray(groups)) return [];
  const rows: { ruleId?: string; source?: string; count: number }[] = [];
  for (const group of groups) {
    if (!isRecord(group)) continue;
    const raw = group.count;
    const count =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (!Number.isFinite(count)) continue;
    const dims = isRecord(group.dimensions) ? group.dimensions : {};
    rows.push({
      ruleId: typeof dims.ruleId === "string" ? dims.ruleId : undefined,
      source: typeof dims.source === "string" ? dims.source : undefined,
      count,
    });
  }
  return rows;
}

async function postAe(env: StatsBindings, sql: string): Promise<FetchOk | FetchFail> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "text/plain",
        },
        body: sql,
      },
    );
    if (!res.ok) {
      console.error(JSON.stringify({ level: "error", source: "ae", status: res.status }));
      return { ok: false };
    }
    return { ok: true, json: await res.json() };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", source: "ae", message: String(error) }));
    return { ok: false };
  }
}

async function postGraphql(env: StatsBindings, query: string): Promise<FetchOk | FetchFail> {
  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      // Queries declare $zoneTag; bind the zone id or GraphQL rejects the request.
      body: JSON.stringify({
        query,
        variables: { zoneTag: env.CF_ZONE_ID },
      }),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ level: "error", source: "graphql", status: res.status }));
      return { ok: false };
    }
    const json: unknown = await res.json();
    if (hasGraphqlErrors(json)) {
      console.error(JSON.stringify({ level: "error", source: "graphql", errors: true }));
      return { ok: false };
    }
    return { ok: true, json };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", source: "graphql", message: String(error) }));
    return { ok: false };
  }
}

function snapshotInput(
  range: Range,
  generatedAt: string,
  pagesJson: unknown,
  referrersJson: unknown,
  devicesJson: unknown,
  statesJson: unknown,
  seriesJson: unknown,
  visitsJson: unknown,
  firewallJson: unknown,
): SnapshotInput {
  const visits = parseVisits(visitsJson);
  return {
    range,
    generatedAt,
    visitors: visits.total,
    pages: parseAeTable(pagesJson, ["host", "path", "views"]).map((row) => ({
      host: cellString(row, "host"),
      path: cellString(row, "path"),
      views: cellNumber(row, "views"),
    })),
    referrers: parseAeTable(referrersJson, ["host", "views"]).map((row) => ({
      host: cellString(row, "host"),
      views: cellNumber(row, "views"),
    })),
    devices: parseAeTable(devicesJson, ["class", "views"]).map((row) => ({
      class: cellString(row, "class"),
      views: cellNumber(row, "views"),
    })),
    states: parseAeTable(statesJson, ["code", "views"]).map((row) => ({
      code: cellString(row, "code"),
      views: cellNumber(row, "views"),
    })),
    pageviewSeries: parseAeTable(seriesJson, ["t", "pageviews"])
      .filter((row) => typeof row.t === "string" && row.t.length > 0)
      .map((row) => ({
        t: String(row.t),
        pageviews: cellNumber(row, "pageviews"),
      })),
    visitorSeries: visits.series,
    blocked: bucketFirewall(parseFirewall(firewallJson)),
  };
}

async function buildRange(env: StatsBindings, range: Range, now: Date): Promise<boolean> {
  const sql = aeSql(range, now);
  const startIso = rangeStart(range, now).toISOString();
  const endIso = now.toISOString();
  const [pages, referrers, devices, states, series, visits, firewall] = await Promise.all([
    postAe(env, sql.pages),
    postAe(env, sql.referrers),
    postAe(env, sql.devices),
    postAe(env, sql.states),
    postAe(env, sql.series),
    postGraphql(env, visitsQuery(range, startIso, endIso)),
    postGraphql(env, firewallQuery(startIso, endIso)),
  ]);
  if (
    !pages.ok ||
    !referrers.ok ||
    !devices.ok ||
    !states.ok ||
    !series.ok ||
    !visits.ok ||
    !firewall.ok
  ) {
    return false;
  }
  const snap = buildSnapshot(
    snapshotInput(
      range,
      now.toISOString(),
      pages.json,
      referrers.json,
      devices.json,
      states.json,
      series.json,
      visits.json,
      firewall.json,
    ),
  );
  await env.STATS.put(`snapshot:${range}`, JSON.stringify(snap));
  return true;
}

export async function buildAndStore(env: StatsBindings, now?: Date): Promise<boolean> {
  const at = now ?? new Date();
  let allWrote = true;
  for (const range of RANGES) {
    const wrote = await buildRange(env, range, at);
    if (!wrote) allWrote = false;
  }
  return allWrote;
}

export default {
  async fetch(request: Request, env: StatsBindings): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return app.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: unknown, env: StatsBindings): Promise<void> {
    await buildAndStore(env);
  },
};
