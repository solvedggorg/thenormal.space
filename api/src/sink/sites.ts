import { DEFAULT_SITES, DEV_HOSTS, isSiteId } from "./schema";

export type SiteRecord = { id: string; name: string; hosts: string[] };

type HostLookup = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

type SiteDb = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

export function defaultHostsFor(siteId: string, allowDev: boolean): string[] {
  const base = DEFAULT_SITES[siteId]?.hosts ?? [];
  if (!allowDev) return base;
  return [...base, ...(DEV_HOSTS[siteId] ?? [])];
}

export function hostAllowed(siteId: string, host: string, allowDev: boolean, extra: string[] = []): boolean {
  const h = normalizeHost(host);
  if (extra.includes(h)) return true;
  if (defaultHostsFor(siteId, allowDev).includes(h)) return true;
  if (allowDev && (h.startsWith("localhost:") || h.startsWith("127.0.0.1:"))) return true;
  return false;
}

export async function hostsForSite(
  env: { ANALYTICS_DB?: SiteDb; SINK_CACHE?: HostLookup },
  siteId: string,
): Promise<string[]> {
  if (!isSiteId(siteId)) return [];
  const cacheKey = `sitehosts:${siteId}`;
  const cached = env.SINK_CACHE ? await env.SINK_CACHE.get(cacheKey) : null;
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as string[];
      if (Array.isArray(parsed)) return parsed.map(normalizeHost);
    } catch {
      /* fall through */
    }
  }
  if (!env.ANALYTICS_DB) return [];
  try {
    const { results } = await env.ANALYTICS_DB.prepare(
      "SELECT host FROM site_hosts WHERE site_id = ?",
    )
      .bind(siteId)
      .all<{ host: string }>();
    const hosts = (results ?? []).map((row) => normalizeHost(row.host)).filter(Boolean);
    if (env.SINK_CACHE) {
      await env.SINK_CACHE.put(cacheKey, JSON.stringify(hosts), { expirationTtl: 60 });
    }
    return hosts;
  } catch {
    return [];
  }
}

export async function siteAllowsHost(
  env: { ANALYTICS_DB?: SiteDb; SINK_CACHE?: HostLookup; ALLOW_DEV_ORIGINS?: string },
  siteId: string,
  host: string,
): Promise<boolean> {
  const allowDev = env.ALLOW_DEV_ORIGINS === "true";
  const extra = await hostsForSite(env, siteId);
  return hostAllowed(siteId, host, allowDev, extra);
}

export async function originHostAllowed(
  env: { ANALYTICS_DB?: SiteDb; SINK_CACHE?: HostLookup; ALLOW_DEV_ORIGINS?: string },
  origin: string,
): Promise<boolean> {
  if (!origin) return false;
  let host = "";
  try {
    host = normalizeHost(new URL(origin).host);
  } catch {
    return false;
  }
  const allowDev = env.ALLOW_DEV_ORIGINS === "true";
  for (const siteId of Object.keys(DEFAULT_SITES)) {
    if (hostAllowed(siteId, host, allowDev)) return true;
  }
  if (!env.ANALYTICS_DB) return false;
  try {
    const row = await env.ANALYTICS_DB.prepare("SELECT site_id FROM site_hosts WHERE host = ?")
      .bind(host)
      .first<{ site_id: string }>();
    return Boolean(row?.site_id);
  } catch {
    return false;
  }
}

export async function listSites(env: { ANALYTICS_DB?: SiteDb }): Promise<SiteRecord[]> {
  if (!env.ANALYTICS_DB) {
    return Object.entries(DEFAULT_SITES).map(([id, site]) => ({
      id,
      name: site.name,
      hosts: site.hosts,
    }));
  }
  const sites = await env.ANALYTICS_DB.prepare("SELECT id, name FROM sites ORDER BY name")
    .bind()
    .all<{ id: string; name: string }>();
  const hosts = await env.ANALYTICS_DB.prepare("SELECT site_id, host FROM site_hosts")
    .bind()
    .all<{ site_id: string; host: string }>();
  const bySite = new Map<string, string[]>();
  for (const row of hosts.results ?? []) {
    const list = bySite.get(row.site_id) ?? [];
    list.push(row.host);
    bySite.set(row.site_id, list);
  }
  const rows = sites.results ?? [];
  if (!rows.length) {
    return Object.entries(DEFAULT_SITES).map(([id, site]) => ({
      id,
      name: site.name,
      hosts: site.hosts,
    }));
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    hosts: bySite.get(row.id) ?? [],
  }));
}
