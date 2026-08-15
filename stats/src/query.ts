import { COUNTED_HOSTS, type Range } from "./schema";

export const RULE_OUTSIDE_US = "cf9ae583904041d18bdb7c8a433bdaa1";
export const RULE_VPN_TOR = "718db37fffd04b5e9a1c84e4cf47a293";
export const BOT_SOURCES = ["sbfm", "botfight", "botmanagement", "aibot"] as const;

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
const HOST_IN_SQL = COUNTED_HOSTS.map((h) => `'${h}'`).join(", ");
const HOST_IN_GQL = COUNTED_HOSTS.map((h) => `"${h}"`).join(", ");
const VIEWS_SQL = "SUM(_sample_interval * double1)";

export function rangeStart(range: Range, now: Date): Date {
  if (range === "24h") return new Date(now.getTime() - 24 * MS_HOUR);
  if (range === "7d") return new Date(now.getTime() - 7 * MS_DAY);
  return new Date(now.getTime() - 30 * MS_DAY);
}

function rangeInterval(range: Range): string {
  if (range === "24h") return "INTERVAL '24' HOUR";
  if (range === "7d") return "INTERVAL '7' DAY";
  return "INTERVAL '30' DAY";
}

function aeWhere(range: Range): string {
  return `timestamp >= NOW() - ${rangeInterval(range)} AND index1 IN (${HOST_IN_SQL})`;
}

export function aeSql(
  range: Range,
  now: Date,
): { pages: string; referrers: string; devices: string; states: string; series: string } {
  const where = aeWhere(range);
  const bucket = range === "30d" ? "toStartOfDay" : "toStartOfHour";
  return {
    pages: `SELECT index1 AS host, blob1 AS path, ${VIEWS_SQL} AS views
FROM thenormal_pageviews
WHERE ${where}
GROUP BY host, path
ORDER BY views DESC
LIMIT 50`,
    referrers: `SELECT blob2 AS host, ${VIEWS_SQL} AS views
FROM thenormal_pageviews
WHERE ${where}
GROUP BY host
ORDER BY views DESC
LIMIT 50`,
    devices: `SELECT blob3 AS class, ${VIEWS_SQL} AS views
FROM thenormal_pageviews
WHERE ${where}
GROUP BY class
ORDER BY views DESC
LIMIT 50`,
    states: `SELECT blob4 AS code, ${VIEWS_SQL} AS views
FROM thenormal_pageviews
WHERE ${where}
GROUP BY code
ORDER BY views DESC`,
    series: `SELECT ${bucket}(timestamp) AS t, ${VIEWS_SQL} AS pageviews
FROM thenormal_pageviews
WHERE ${where}
GROUP BY t
ORDER BY t ASC`,
  };
}

export function visitsQuery(range: Range, startIso: string, endIso: string): string {
  const timeFilter =
    range === "30d"
      ? `date_geq: "${startIso.slice(0, 10)}"
          date_leq: "${endIso.slice(0, 10)}"`
      : `datetime_geq: "${startIso}"
          datetime_lt: "${endIso}"`;
  const dim = range === "30d" ? "date" : "datetimeHour";
  return `query Visits($zoneTag: String!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        filter: {
          ${timeFilter}
          requestSource: "eyeball"
          clientRequestHTTPHost_in: [${HOST_IN_GQL}]
        }
        limit: 1000
        orderBy: [${dim}_ASC]
      ) {
        sum { visits }
        dimensions { ${dim} }
      }
    }
  }
}`;
}

export function firewallQuery(startIso: string, endIso: string): string {
  return `query Firewall($zoneTag: String!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      firewallEventsAdaptiveGroups(
        filter: {
          datetime_geq: "${startIso}"
          datetime_lt: "${endIso}"
          action: "block"
        }
        limit: 100
        orderBy: [count_DESC]
      ) {
        count
        dimensions { ruleId source }
      }
    }
  }
}`;
}

const BUCKET_TIME =
  /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;

/** Canonical series bucket: `YYYY-MM-DDTHH:mm:ss.000Z` (UTC). */
export function normalizeBucketTime(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";
  const m = s.match(BUCKET_TIME);
  if (!m) return "";
  const [, date, hh = "00", mm = "00", ss = "00"] = m;
  return `${date}T${hh}:${mm}:${ss}.000Z`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCell(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

function rowsFrom(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) {
    return value.data.filter(isRecord);
  }
  return null;
}

function aeRows(json: unknown): Record<string, unknown>[] {
  if (!isRecord(json)) return [];
  const fromData = rowsFrom(json.data);
  if (fromData) return fromData;
  if (Array.isArray(json.result)) {
    const first = json.result[0];
    const fromFirst = rowsFrom(first);
    if (fromFirst) return fromFirst;
  }
  const fromResult = rowsFrom(json.result);
  if (fromResult) return fromResult;
  return [];
}

export function parseAeTable(
  json: unknown,
  keys: string[],
): Record<string, string | number>[] {
  return aeRows(json).map((row) => {
    const out: Record<string, string | number> = {};
    for (const key of keys) {
      if (key === "t") {
        const t = normalizeBucketTime(row[key]);
        if (t) out.t = t;
        continue;
      }
      const cell = asCell(row[key]);
      if (cell !== undefined) out[key] = cell;
    }
    return out;
  });
}

export function bucketFirewall(
  rows: { ruleId?: string; source?: string; count: number }[],
): { outsideUs: number; vpnTor: number; bots: number } {
  let outsideUs = 0;
  let vpnTor = 0;
  let bots = 0;
  for (const row of rows) {
    if (row.ruleId === RULE_OUTSIDE_US) {
      outsideUs += row.count;
      continue;
    }
    if (row.ruleId === RULE_VPN_TOR) {
      vpnTor += row.count;
      continue;
    }
    const source = (row.source ?? "").toLowerCase();
    if (BOT_SOURCES.some((needle) => source.includes(needle))) {
      bots += row.count;
    }
  }
  return { outsideUs, vpnTor, bots };
}

function visitBucket(dims: Record<string, unknown>): string | null {
  const t = normalizeBucketTime(dims.datetimeHour ?? dims.date);
  return t || null;
}

function visitCount(sum: Record<string, unknown>): number {
  if (typeof sum.visits === "number" && Number.isFinite(sum.visits)) return sum.visits;
  if (typeof sum.visits === "string") {
    const n = Number(sum.visits);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function parseVisits(gql: unknown): {
  total: number;
  series: { t: string; visitors: number }[];
} {
  if (!isRecord(gql) || !isRecord(gql.data)) return { total: 0, series: [] };
  const viewer = gql.data.viewer;
  if (!isRecord(viewer) || !Array.isArray(viewer.zones) || !isRecord(viewer.zones[0])) {
    return { total: 0, series: [] };
  }
  const groups = viewer.zones[0].httpRequestsAdaptiveGroups;
  if (!Array.isArray(groups)) return { total: 0, series: [] };

  const series: { t: string; visitors: number }[] = [];
  let total = 0;
  for (const group of groups) {
    if (!isRecord(group)) continue;
    const t = isRecord(group.dimensions) ? visitBucket(group.dimensions) : null;
    if (!t) continue;
    const visitors = isRecord(group.sum) ? visitCount(group.sum) : 0;
    total += visitors;
    series.push({ t, visitors });
  }
  return { total, series };
}
