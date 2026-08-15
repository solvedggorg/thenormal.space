import { DEFAULT_SITES, isSiteId } from "../../api/src/sink/schema";

export type SiteRow = { id: string; name: string; hosts: string[] };
export type GoalRow = { id: string; site_id: string; name: string; match_type: string; match_value: string };

type Db = D1Database;

function fallbackSites(): SiteRow[] {
  return Object.entries(DEFAULT_SITES).map(([id, site]) => ({ id, name: site.name, hosts: site.hosts }));
}

export async function listSites(db: Db | undefined): Promise<SiteRow[]> {
  if (!db) return fallbackSites();
  let sites: { results?: { id: string; name: string }[] };
  let hosts: { results?: { site_id: string; host: string }[] };
  try {
    sites = await db.prepare("SELECT id, name FROM sites ORDER BY name").all<{ id: string; name: string }>();
    hosts = await db.prepare("SELECT site_id, host FROM site_hosts").all<{ site_id: string; host: string }>();
  } catch {
    return fallbackSites();
  }
  const bySite = new Map<string, string[]>();
  for (const row of hosts.results ?? []) {
    const list = bySite.get(row.site_id) ?? [];
    list.push(row.host);
    bySite.set(row.site_id, list);
  }
  const rows = sites.results ?? [];
  if (!rows.length) return fallbackSites();
  return rows.map((row) => ({ id: row.id, name: row.name, hosts: bySite.get(row.id) ?? [] }));
}

export async function createSite(db: Db, id: string, name: string): Promise<SiteRow | null> {
  if (!isSiteId(id) || !name.trim()) return null;
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO sites (id, name, created_at) VALUES (?, ?, ?)").bind(id, name.trim(), now).run();
  return { id, name: name.trim(), hosts: [] };
}

export async function addHost(db: Db, siteId: string, host: string): Promise<boolean> {
  if (!isSiteId(siteId)) return false;
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!h || h.includes(" ") || h.length > 253) return false;
  await db.prepare("INSERT OR REPLACE INTO site_hosts (host, site_id) VALUES (?, ?)").bind(h, siteId).run();
  return true;
}

export async function removeHost(db: Db, siteId: string, host: string): Promise<void> {
  await db.prepare("DELETE FROM site_hosts WHERE site_id = ? AND host = ?").bind(siteId, host).run();
}

export async function listGoals(db: Db | undefined, siteId: string): Promise<GoalRow[]> {
  if (!db || !isSiteId(siteId)) return [];
  const { results } = await db
    .prepare("SELECT id, site_id, name, match_type, match_value FROM goals WHERE site_id = ? ORDER BY name")
    .bind(siteId)
    .all<GoalRow>();
  return results ?? [];
}

export async function addGoal(
  db: Db,
  siteId: string,
  input: { name: string; match_type: string; match_value: string },
): Promise<GoalRow | null> {
  if (!isSiteId(siteId) || !input.name.trim() || !input.match_value.trim()) return null;
  const matchType = input.match_type === "path" ? "path" : "event";
  const row: GoalRow = {
    id: crypto.randomUUID(),
    site_id: siteId,
    name: input.name.trim(),
    match_type: matchType,
    match_value: input.match_value.trim(),
  };
  await db
    .prepare("INSERT INTO goals (id, site_id, name, match_type, match_value, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.site_id, row.name, row.match_type, row.match_value, new Date().toISOString())
    .run();
  return row;
}

export async function removeGoal(db: Db, siteId: string, id: string): Promise<void> {
  await db.prepare("DELETE FROM goals WHERE site_id = ? AND id = ?").bind(siteId, id).run();
}

export function snippetFor(origin: string, siteId: string): string {
  return `<script src="${origin.replace(/\/$/, "")}/v1/sink/script.js" defer data-site-id="${siteId}"></script>`;
}
