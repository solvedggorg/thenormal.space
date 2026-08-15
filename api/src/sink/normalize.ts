import { hashId } from "./hash";
import {
  asString,
  clip,
  type EventType,
  type IncomingEvent,
  type NormalizedEvent,
} from "./schema";
import { looksLikeBot, parseUserAgent } from "./ua";

export type RequestHints = {
  url: string;
  host: string;
  referer: string;
  userAgent: string;
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  deviceType?: string;
  verifiedBot?: boolean;
  definitelyAutomated?: boolean;
  botScore?: number;
};

const TYPE_ALIASES: Record<string, EventType> = {
  pageview: "pageview",
  page: "pageview",
  custom: "custom",
  custom_event: "custom",
  event: "custom",
  outbound: "outbound",
  error: "error",
  performance: "performance",
};

export function parseEventType(raw: unknown): EventType | null {
  const key = asString(raw, "pageview").trim().toLowerCase();
  return TYPE_ALIASES[key] ?? null;
}

export function parseIncomingList(body: unknown): IncomingEvent[] | null {
  if (Array.isArray(body)) return body as IncomingEvent[];
  if (body && typeof body === "object") {
    const rec = body as { events?: unknown };
    if (Array.isArray(rec.events)) return rec.events as IncomingEvent[];
    return [body as IncomingEvent];
  }
  return null;
}

export function shouldDropRequest(hints: RequestHints): boolean {
  if (hints.verifiedBot || hints.definitelyAutomated) return true;
  if (typeof hints.botScore === "number" && hints.botScore < 30) return true;
  if (looksLikeBot(hints.userAgent)) return true;
  return false;
}

export async function normalizeEvent(
  raw: IncomingEvent,
  hints: RequestHints,
  salt: string,
): Promise<NormalizedEvent | null> {
  const siteId = asString(raw.site_id).trim();
  if (!siteId) return null;
  const type = parseEventType(raw.type ?? "pageview");
  if (!type) return null;

  const parsed = parsePage(raw, hints);
  if (!parsed) return null;

  const name = clip(asString(raw.event_name || raw.name).trim(), 128);
  if ((type === "custom" || type === "error") && !name) return null;

  const visitorRaw =
    asString(raw.visitor_id || raw.visitorId).trim() ||
    asString(raw.user_id || raw.userId).trim() ||
    `${hints.ip}|${hints.userAgent}`;
  const sessionRaw = asString(raw.session_id || raw.sessionId).trim() || visitorRaw;
  const [visitor, session] = await Promise.all([
    hashId([salt, siteId, "v", visitorRaw]),
    hashId([salt, siteId, "s", sessionRaw]),
  ]);

  const utm = utmFrom(parsed.search);
  const tech = parseUserAgent(hints.userAgent);
  const duration = numberOf(raw.duration_ms ?? raw.duration);

  return {
    siteId,
    type,
    host: parsed.host,
    path: parsed.path,
    referrer: referrerHost(asString(raw.referrer) || hints.referer, parsed.host),
    name,
    country: clip(hints.country || "", 8).toUpperCase() || "XX",
    region: clip(hints.region || "", 32),
    city: clip(hints.city || "", 64),
    device: deviceClass(hints.deviceType),
    browser: tech.browser,
    os: tech.os,
    visitor,
    session,
    utmSource: clip(utm.source, 64),
    language: clip(asString(raw.language).split(",")[0]?.trim() || "", 16),
    utmMedium: clip(utm.medium, 64),
    utmCampaign: clip(utm.campaign, 64),
    tag: clip(asString(raw.tag).trim(), 64),
    count: 1,
    durationMs: duration > 0 && duration < 3_600_000 ? Math.round(duration) : 0,
  };
}

function parsePage(
  raw: IncomingEvent,
  hints: RequestHints,
): { host: string; path: string; search: string } | null {
  const href = asString(raw.url || raw.href).trim();
  if (href) {
    try {
      const u = new URL(href);
      return {
        host: u.host.toLowerCase(),
        path: clip(cleanPath(u.pathname), 256),
        search: u.search,
      };
    } catch {
      return null;
    }
  }
  const path = asString(raw.pathname).trim();
  const host = asString(raw.hostname).trim() || hints.host;
  if (!host || !path.startsWith("/")) return null;
  return { host: host.toLowerCase(), path: clip(cleanPath(path), 256), search: "" };
}

function cleanPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function referrerHost(referrer: string, pageHost: string): string {
  if (!referrer) return "(direct)";
  try {
    const host = new URL(referrer).host.toLowerCase();
    if (!host || host === pageHost.toLowerCase()) return "(direct)";
    if (host === "thenormal.space" || host.endsWith(".thenormal.space")) return "(direct)";
    return clip(host, 128);
  } catch {
    return "(direct)";
  }
}

function utmFrom(search: string): { source: string; medium: string; campaign: string } {
  if (!search) return { source: "", medium: "", campaign: "" };
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
  };
}

function deviceClass(deviceType: string | undefined): "phone" | "computer" | "other" {
  if (deviceType === "mobile" || deviceType === "tablet") return "phone";
  if (deviceType === "desktop") return "computer";
  return "other";
}

function numberOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function hintsFromRequest(request: Request): RequestHints {
  const url = new URL(request.url);
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const bot = cf?.botManagement as
    | { verifiedBot?: boolean; score?: number; definitelyAutomated?: boolean; ja3Hash?: string }
    | undefined;
  return {
    url: request.url,
    host: (request.headers.get("host") || url.host).toLowerCase(),
    referer: request.headers.get("referer") || request.headers.get("referrer") || "",
    userAgent: request.headers.get("user-agent") || "",
    ip: request.headers.get("cf-connecting-ip") || "",
    country: (cf?.country as string | undefined) || request.headers.get("cf-ipcountry") || "",
    region: (cf?.regionCode as string | undefined) || (cf?.region as string | undefined) || "",
    city: (cf?.city as string | undefined) || "",
    deviceType: cf?.deviceType as string | undefined,
    verifiedBot: Boolean(bot?.verifiedBot),
    definitelyAutomated: bot?.definitelyAutomated === true,
    botScore: typeof bot?.score === "number" ? bot.score : undefined,
  };
}
