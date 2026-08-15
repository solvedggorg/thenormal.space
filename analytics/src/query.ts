import { isSiteId, type Range } from "../../api/src/sink/schema";

export { parseRange, type Range } from "../../api/src/sink/schema";

const VIEWS = "SUM(_sample_interval * double1)";

export type BreakdownDim =
  | "pages"
  | "referrers"
  | "countries"
  | "regions"
  | "cities"
  | "devices"
  | "browsers"
  | "os"
  | "events";

export type Overview = {
  range: Range;
  generatedAt: string;
  live: { visitors: number; sessions: number };
  visitors: number;
  pageviews: number;
  sessions: number;
  bounceRate: number | null;
  durationMs: number;
  series: { t: string; visitors: number; pageviews: number }[];
  pages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
  countries: { code: string; views: number }[];
  regions: { name: string; views: number }[];
  cities: { name: string; views: number }[];
  devices: { class: string; views: number }[];
  browsers: { name: string; views: number }[];
  os: { name: string; views: number }[];
  events: { name: string; views: number }[];
  unavailable?: boolean;
};

export function rangeInterval(range: Range): string {
  if (range === "24h") return "INTERVAL '24' HOUR";
  if (range === "7d") return "INTERVAL '7' DAY";
  return "INTERVAL '30' DAY";
}

export function aeWhere(dataset: string, siteId: string, range: Range, extra = ""): string {
  if (!isSiteId(siteId)) throw new Error("site");
  const extraSql = extra ? ` AND ${extra}` : "";
  return `FROM ${dataset}
WHERE index1 = '${siteId}' AND timestamp >= NOW() - ${rangeInterval(range)}${extraSql}`;
}

export function aeSql(dataset: string, siteId: string, range: Range): Record<string, string> {
  const bucket = range === "30d" ? "toStartOfDay" : "toStartOfHour";
  const base = aeWhere(dataset, siteId, range);
  const pages = aeWhere(dataset, siteId, range, "blob1 = 'pageview'");
  return {
    totals: `SELECT COUNT(DISTINCT blob12) AS visitors, ${VIEWS} AS pageviews, COUNT(DISTINCT blob13) AS sessions, avg(double2) AS duration
${pages}`,
    series: `SELECT ${bucket}(timestamp) AS t, COUNT(DISTINCT blob12) AS visitors, ${VIEWS} AS pageviews
${pages}
GROUP BY t
ORDER BY t ASC`,
    pages: `SELECT blob3 AS path, ${VIEWS} AS views
${pages}
GROUP BY path
ORDER BY views DESC
LIMIT 30`,
    referrers: `SELECT blob4 AS host, ${VIEWS} AS views
${pages}
GROUP BY host
ORDER BY views DESC
LIMIT 20`,
    countries: `SELECT blob6 AS code, ${VIEWS} AS views
${pages}
GROUP BY code
ORDER BY views DESC
LIMIT 20`,
    regions: `SELECT blob7 AS name, ${VIEWS} AS views
${pages}
GROUP BY name
ORDER BY views DESC
LIMIT 20`,
    cities: `SELECT blob8 AS name, ${VIEWS} AS views
${pages}
GROUP BY name
ORDER BY views DESC
LIMIT 20`,
    devices: `SELECT blob9 AS class, ${VIEWS} AS views
${pages}
GROUP BY class
ORDER BY views DESC
LIMIT 10`,
    browsers: `SELECT blob10 AS name, ${VIEWS} AS views
${pages}
GROUP BY name
ORDER BY views DESC
LIMIT 15`,
    os: `SELECT blob11 AS name, ${VIEWS} AS views
${pages}
GROUP BY name
ORDER BY views DESC
LIMIT 15`,
    events: `SELECT blob5 AS name, ${VIEWS} AS views
${aeWhere(dataset, siteId, range, "blob1 = 'custom'")}
GROUP BY name
ORDER BY views DESC
LIMIT 30`,
    sessions: `SELECT blob13 AS session, ${VIEWS} AS views
${pages}
GROUP BY session
LIMIT 5000`,
    live: `SELECT COUNT(DISTINCT blob12) AS visitors, COUNT(DISTINCT blob13) AS sessions
${aeWhere(dataset, siteId, "24h", "blob1 = 'pageview' AND timestamp >= NOW() - INTERVAL '5' MINUTE")}`,
  };
}

export function breakdownSql(dataset: string, siteId: string, range: Range, dim: BreakdownDim): string {
  return aeSql(dataset, siteId, range)[dim];
}

export function parseAeTable(json: unknown, keys: string[]): Record<string, string | number>[] {
  if (!json || typeof json !== "object") return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const rows: Record<string, string | number>[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const row: Record<string, string | number> = {};
    for (const key of keys) {
      const value = rec[key];
      if (typeof value === "number" && Number.isFinite(value)) row[key] = value;
      else if (typeof value === "string") row[key] = value;
    }
    rows.push(row);
  }
  return rows;
}

export function cellString(row: Record<string, string | number>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

export function cellNumber(row: Record<string, string | number>, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function bounceRate(sessionRows: { views: number }[]): number | null {
  if (!sessionRows.length) return null;
  const bounced = sessionRows.filter((row) => row.views <= 1).length;
  return bounced / sessionRows.length;
}

export function emptyOverview(range: Range, generatedAt: string): Overview {
  return {
    range,
    generatedAt,
    live: { visitors: 0, sessions: 0 },
    visitors: 0,
    pageviews: 0,
    sessions: 0,
    bounceRate: null,
    durationMs: 0,
    series: [],
    pages: [],
    referrers: [],
    countries: [],
    regions: [],
    cities: [],
    devices: [],
    browsers: [],
    os: [],
    events: [],
    unavailable: true,
  };
}
