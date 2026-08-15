import {
  COUNTED_HOSTS,
  STATE_CODES,
  type Range,
  type Snapshot,
} from "./schema";

export type SeriesPoint = { t: string; visitors: number; pageviews: number };

export type SnapshotInput = {
  range: Range;
  generatedAt: string;
  visitors: number;
  pages: { host: string; path: string; views: number }[];
  referrers: { host: string; views: number }[];
  devices: { class: string; views: number }[];
  states: { code: string; views: number }[];
  pageviewSeries: { t: string; pageviews: number }[];
  visitorSeries: { t: string; visitors: number }[];
  blocked: { outsideUs: number; vpnTor: number; bots: number };
};

const COUNTED_HOST_SET = new Set<string>(COUNTED_HOSTS);
const STATE_CODE_SET = new Set<string>(STATE_CODES);

function deviceClass(raw: string): "phone" | "computer" | "other" {
  if (raw === "phone" || raw === "computer") return raw;
  return "other";
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const countedPages = input.pages.filter((p) => COUNTED_HOST_SET.has(p.host));
  // Hero pageviews is the unbounded AE series total; pages is only the ranked slice.
  const pageviews = input.pageviewSeries.reduce((sum, p) => sum + p.pageviews, 0);
  const pages = [...countedPages]
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

  const referrers = [...input.referrers]
    .sort((a, b) => b.views - a.views)
    .slice(0, 15);

  const deviceViews = new Map<"phone" | "computer" | "other", number>();
  for (const d of input.devices) {
    const cls = deviceClass(d.class);
    deviceViews.set(cls, (deviceViews.get(cls) ?? 0) + d.views);
  }
  const seen = new Set<"phone" | "computer" | "other">();
  const devices: { class: "phone" | "computer" | "other"; views: number }[] =
    [];
  for (const d of input.devices) {
    const cls = deviceClass(d.class);
    if (seen.has(cls)) continue;
    seen.add(cls);
    devices.push({ class: cls, views: deviceViews.get(cls)! });
  }

  const stateViews = new Map<string, number>(
    STATE_CODES.map((code) => [code, 0]),
  );
  for (const s of input.states) {
    if (s.code === "US") continue;
    if (!STATE_CODE_SET.has(s.code)) continue;
    stateViews.set(s.code, (stateViews.get(s.code) ?? 0) + s.views);
  }
  const states = STATE_CODES.map((code) => ({
    code,
    views: stateViews.get(code) ?? 0,
  }));

  const seriesMap = new Map<string, SeriesPoint>();
  for (const p of input.pageviewSeries) {
    const cur = seriesMap.get(p.t) ?? { t: p.t, visitors: 0, pageviews: 0 };
    cur.pageviews = p.pageviews;
    seriesMap.set(p.t, cur);
  }
  for (const v of input.visitorSeries) {
    const cur = seriesMap.get(v.t) ?? { t: v.t, visitors: 0, pageviews: 0 };
    cur.visitors = v.visitors;
    seriesMap.set(v.t, cur);
  }
  const series = [...seriesMap.values()].sort((a, b) =>
    a.t < b.t ? -1 : a.t > b.t ? 1 : 0,
  );

  return {
    range: input.range,
    generatedAt: input.generatedAt,
    visitors: input.visitors,
    pageviews,
    series,
    pages,
    referrers,
    devices,
    states,
    blocked: { ...input.blocked },
  };
}
