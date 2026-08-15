export const SINK_DATASET = "thenormal_sink";
export const SINK_MAX_JSON_BYTES = 8192;
export const SINK_MAX_BATCH_BYTES = 32_768;
export const SINK_MAX_BATCH = 25;
export const SINK_RATE_PER_MINUTE = 120;

export const EVENT_TYPES = ["pageview", "custom", "outbound", "error", "performance"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const RANGES = ["24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];

export const SITE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** First-party sites when D1 is empty or missing. */
export const DEFAULT_SITES: Record<string, { name: string; hosts: string[] }> = {
  tns: {
    name: "The Normal Space",
    hosts: ["thenormal.space", "www.thenormal.space"],
  },
  shop: {
    name: "Shop",
    hosts: ["shop.thenormal.space"],
  },
};

export const DEV_HOSTS: Record<string, string[]> = {
  tns: ["localhost:4321", "127.0.0.1:4321"],
  shop: ["localhost:4322", "127.0.0.1:4322"],
};

export type IncomingEvent = {
  site_id?: unknown;
  type?: unknown;
  name?: unknown;
  event_name?: unknown;
  url?: unknown;
  href?: unknown;
  pathname?: unknown;
  hostname?: unknown;
  referrer?: unknown;
  title?: unknown;
  language?: unknown;
  screen_width?: unknown;
  screenWidth?: unknown;
  visitor_id?: unknown;
  visitorId?: unknown;
  session_id?: unknown;
  sessionId?: unknown;
  user_id?: unknown;
  userId?: unknown;
  tag?: unknown;
  properties?: unknown;
  props?: unknown;
  duration_ms?: unknown;
  duration?: unknown;
};

export type NormalizedEvent = {
  siteId: string;
  type: EventType;
  host: string;
  path: string;
  referrer: string;
  name: string;
  country: string;
  region: string;
  city: string;
  device: "phone" | "computer" | "other";
  browser: string;
  os: string;
  visitor: string;
  session: string;
  utmSource: string;
  language: string;
  utmMedium: string;
  utmCampaign: string;
  tag: string;
  count: 1;
  durationMs: number;
};

/** Analytics Engine column map for `thenormal_sink`. */
export type SinkDataPoint = {
  indexes: [string];
  blobs: [
    string, // 1 type
    string, // 2 host
    string, // 3 path
    string, // 4 referrer
    string, // 5 name
    string, // 6 country
    string, // 7 region
    string, // 8 city
    string, // 9 device
    string, // 10 browser
    string, // 11 os
    string, // 12 visitor
    string, // 13 session
    string, // 14 utm_source
    string, // 15 language
    string, // 16 utm_medium
    string, // 17 utm_campaign
    string, // 18 tag
  ];
  doubles: [1, number];
};

export type ArchivedEvent = NormalizedEvent & {
  receivedAt: string;
};

export function parseRange(raw: string | null | undefined): Range {
  if (raw === "24h" || raw === "7d" || raw === "30d") return raw;
  return "7d";
}

export function isSiteId(value: string): boolean {
  return SITE_ID_RE.test(value);
}

export function toDataPoint(event: NormalizedEvent): SinkDataPoint {
  return {
    indexes: [event.siteId],
    blobs: [
      event.type,
      event.host,
      event.path,
      event.referrer,
      event.name,
      event.country,
      event.region,
      event.city,
      event.device,
      event.browser,
      event.os,
      event.visitor,
      event.session,
      event.utmSource,
      event.language,
      event.utmMedium,
      event.utmCampaign,
      event.tag,
    ],
    doubles: [1, event.durationMs],
  };
}

export function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}
