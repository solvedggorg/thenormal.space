import { COUNTED_HOSTS, parseRange } from "./schema";

export { parseRange };
export { COUNTED_HOSTS, STATE_CODES, type Range } from "./schema";

export type PageRequest = {
  method: string;
  url: string;
  host: string;
  referer: string;
  deviceType: string | undefined;
  country: string | undefined;
  regionCode: string | undefined;
  status: number;
  verifiedBot: boolean;
  definitelyAutomated: boolean;
};

export type DataPoint = {
  indexes: [string];
  blobs: [string, string, string, string, string];
  doubles: [1];
};

const ASSET_EXT =
  /\.(woff2|css|js|map|png|ico|svg|jpg|jpeg|webp|gif|txt|xml|json)$/i;

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "");
}

function isCountedHost(host: string): boolean {
  const h = normalizeHost(host);
  return (COUNTED_HOSTS as readonly string[]).includes(h);
}

/** True when referer host is same-site (*.thenormal.space or thenormal.space). */
function isSameSiteRefererHost(host: string): boolean {
  const h = normalizeHost(host);
  return h === "thenormal.space" || h.endsWith(".thenormal.space");
}

function pathnameOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function isAssetPath(pathname: string): boolean {
  if (pathname.includes("/_astro")) return true;
  const last = pathname.split("/").pop() ?? "";
  return ASSET_EXT.test(last);
}

export function isPageLook(req: PageRequest): boolean {
  if (req.method.toUpperCase() !== "GET") return false;
  if (req.verifiedBot || req.definitelyAutomated) return false;
  if (!isCountedHost(req.host)) return false;

  const pathname = pathnameOf(req.url);
  if (pathname === null) return false;
  if (isAssetPath(pathname)) return false;

  return true;
}

function deviceClass(deviceType: string | undefined): "phone" | "computer" | "other" {
  if (deviceType === "mobile" || deviceType === "tablet") return "phone";
  if (deviceType === "desktop") return "computer";
  return "other";
}

function stateCode(regionCode: string | undefined, _country: string | undefined): string {
  if (regionCode && /^[A-Z]{2}$/.test(regionCode)) return regionCode;
  return "US";
}

function referrerHost(referer: string): string {
  if (!referer) return "(direct)";
  try {
    const host = new URL(referer).host;
    if (!host || isSameSiteRefererHost(host)) return "(direct)";
    return host;
  } catch {
    return "(direct)";
  }
}

export function toDataPoint(req: PageRequest): DataPoint | null {
  if (!isPageLook(req)) return null;

  const pathname = pathnameOf(req.url);
  if (pathname === null) return null;
  if (pathname.includes("REDACTED")) return null;

  const path = pathname.length > 256 ? pathname.slice(0, 256) : pathname;
  const host = normalizeHost(req.host);

  return {
    indexes: [host],
    blobs: [
      path,
      referrerHost(req.referer),
      deviceClass(req.deviceType),
      stateCode(req.regionCode, req.country),
      String(req.status),
    ],
    doubles: [1],
  };
}
