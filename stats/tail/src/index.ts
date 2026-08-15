import { toDataPoint, type PageRequest } from "../../src/pageview";

export type TraceLike = {
  event?: {
    request?: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      cf?: {
        country?: string;
        regionCode?: string;
        deviceType?: string;
        botManagement?: { verifiedBot?: boolean; score?: number };
      };
    };
    response?: { status?: number };
  };
};

function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return "";
}

export function requestFromTrace(event: TraceLike): PageRequest | null {
  const request = event.event?.request;
  const url = request?.url;
  if (!url) return null;

  let host: string;
  try {
    host = new URL(url).host.replace(/:\d+$/, "");
  } catch {
    return null;
  }

  const cf = request?.cf;
  const bot = cf?.botManagement;
  const deviceType =
    cf?.deviceType || headerValue(request?.headers, "CF-Device-Type") || undefined;

  return {
    method: request?.method ?? "GET",
    url,
    host,
    referer: headerValue(request?.headers, "referer"),
    deviceType,
    country: cf?.country,
    regionCode: cf?.regionCode,
    status: event.event?.response?.status ?? 0,
    verifiedBot: bot?.verifiedBot === true,
    // score === 1 is definitely automated; missing botManagement → not a bot
    definitelyAutomated: bot != null && bot.score === 1,
  };
}

export function writeFromEvents(
  events: TraceLike[],
  analytics: { writeDataPoint(point: unknown): void },
): number {
  let written = 0;
  for (const event of events) {
    const req = requestFromTrace(event);
    if (!req) continue;
    const point = toDataPoint(req);
    if (!point) continue;
    analytics.writeDataPoint(point);
    written += 1;
  }
  return written;
}

type TailEnv = {
  PAGEVIEWS: { writeDataPoint(point: unknown): void };
};

export default {
  tail(events: TraceLike[], env: TailEnv) {
    writeFromEvents(events, env.PAGEVIEWS);
  },
};
