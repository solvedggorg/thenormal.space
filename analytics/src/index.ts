import { Hono } from "hono";
import { isSiteId } from "../../api/src/sink/schema";
import { accessTokenFrom, verifyAccess } from "./access";
import { loginPage } from "./html";
import {
  destroyJumpCloudSession,
  finishJumpCloudLogin,
  isJumpCloudPublicPath,
  jumpcloudEnabled,
  readJumpCloudSession,
  startJumpCloudLogin,
} from "./jumpcloud";
import {
  aeSql,
  bounceRate,
  cellNumber,
  cellString,
  emptyOverview,
  parseAeTable,
  parseRange,
  type BreakdownDim,
  type Overview,
  type Range,
} from "./query";
import { addGoal, addHost, createSite, listGoals, listSites, removeGoal, removeHost, snippetFor } from "./sites";

export type AnalyticsEnv = {
  ANALYTICS_DB: D1Database;
  KV: KVNamespace;
  ASSETS: { fetch(request: Request): Promise<Response> | Response };
  SINK_API?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID: string;
  SINK_DATASET?: string;
  SINK_ORIGIN?: string;
  SINK_INTERNAL_SECRET?: string;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  ACCESS_JWKS?: string;
  ALLOW_DEV_ACCESS?: string;
  DEV_ACCESS_EMAIL?: string;
  JUMPCLOUD_CLIENT_ID?: string;
  JUMPCLOUD_CLIENT_SECRET?: string;
  JUMPCLOUD_ISSUER?: string;
  JUMPCLOUD_REDIRECT_URI?: string;
  TEST_JUMPCLOUD_USER?: string;
};

type AppEnv = { Bindings: AnalyticsEnv; Variables: { email: string } };

const DIMS = new Set<BreakdownDim>([
  "pages",
  "referrers",
  "countries",
  "regions",
  "cities",
  "devices",
  "browsers",
  "os",
  "events",
]);

export const app = new Hono<AppEnv>();

app.onError((error, c) => {
  console.error(JSON.stringify({ level: "error", message: error.message }));
  return c.json({ error: "Something went wrong." }, 500);
});

app.use("*", async (c, next) => {
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-Frame-Options", "DENY");
  await next();
});

app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (c.env.ALLOW_DEV_ACCESS === "true") {
    c.set("email", c.env.DEV_ACCESS_EMAIL || "dev@thenormal.space");
    await next();
    return;
  }
  const team = c.env.TEAM_DOMAIN || "";
  const aud = c.env.POLICY_AUD || "";
  if (!team || !aud) return c.text("Access is not configured.", 500);
  try {
    const identity = await verifyAccess({
      token: accessTokenFrom(c.req.raw),
      teamDomain: team,
      audience: aud,
      jwksJson: c.env.ACCESS_JWKS,
    });
    c.set("email", identity.email);
  } catch {
    return c.text("Access denied.", 403);
  }
  if (jumpcloudEnabled(c.env) && path !== "/health") {
    if (isJumpCloudPublicPath(path)) {
      await next();
      return;
    }
    const jc = await readJumpCloudSession(c);
    if (!jc) return c.redirect(`/login?next=${encodeURIComponent(path === "/" ? "/" : path)}`, 302);
    c.set("email", jc.email);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, admin: c.get("email") }));

app.get("/login", (c) => {
  if (!jumpcloudEnabled(c.env)) return c.text("JumpCloud is not configured.", 503);
  return c.html(loginPage(c.req.query("next") || "/"));
});
app.get("/login/jumpcloud", (c) => startJumpCloudLogin(c));
app.get("/oidc/callback", (c) => finishJumpCloudLogin(c));
app.post("/logout", async (c) => {
  await destroyJumpCloudSession(c);
  return c.redirect("/login", 302);
});

app.get("/api/me", (c) => c.json({ email: c.get("email") }));

app.get("/api/sites", async (c) => {
  return c.json({ sites: await listSites(c.env.ANALYTICS_DB) });
});

app.post("/api/sites", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { id?: string; name?: string } | null;
  if (!body || !c.env.ANALYTICS_DB) return c.json({ error: "Need an id and a name." }, 400);
  try {
    const site = await createSite(c.env.ANALYTICS_DB, body.id || "", body.name || "");
    if (!site) return c.json({ error: "Need an id and a name." }, 400);
    return c.json({ site }, 201);
  } catch {
    return c.json({ error: "That site already exists." }, 409);
  }
});

app.post("/api/sites/:id/hosts", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { host?: string } | null;
  if (!c.env.ANALYTICS_DB || !body?.host) return c.json({ error: "Need a host." }, 400);
  const ok = await addHost(c.env.ANALYTICS_DB, id, body.host);
  if (!ok) return c.json({ error: "Need a host." }, 400);
  await c.env.KV.delete(`sitehosts:${id}`);
  return c.json({ ok: true });
});

app.delete("/api/sites/:id/hosts", async (c) => {
  const host = c.req.query("host") || "";
  if (!c.env.ANALYTICS_DB || !host) return c.json({ error: "Need a host." }, 400);
  await removeHost(c.env.ANALYTICS_DB, c.req.param("id"), host);
  await c.env.KV.delete(`sitehosts:${c.req.param("id")}`);
  return c.json({ ok: true });
});

app.get("/api/sites/:id/snippet", (c) => {
  const id = c.req.param("id");
  if (!isSiteId(id)) return c.json({ error: "Unknown site." }, 404);
  const origin = (c.env.SINK_ORIGIN || "https://api.thenormal.space").replace(/\/$/, "");
  return c.json({ site: id, origin, html: snippetFor(origin, id) });
});

app.get("/api/sites/:id/goals", async (c) => {
  return c.json({ goals: await listGoals(c.env.ANALYTICS_DB, c.req.param("id")) });
});

app.post("/api/sites/:id/goals", async (c) => {
  if (!c.env.ANALYTICS_DB) return c.json({ error: "Not found." }, 404);
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    match_type?: string;
    match_value?: string;
  } | null;
  const goal = await addGoal(c.env.ANALYTICS_DB, c.req.param("id"), {
    name: body?.name || "",
    match_type: body?.match_type || "event",
    match_value: body?.match_value || "",
  });
  if (!goal) return c.json({ error: "Need a name and a match." }, 400);
  return c.json({ goal }, 201);
});

app.delete("/api/sites/:id/goals/:goalId", async (c) => {
  if (!c.env.ANALYTICS_DB) return c.json({ error: "Not found." }, 404);
  await removeGoal(c.env.ANALYTICS_DB, c.req.param("id"), c.req.param("goalId"));
  return c.json({ ok: true });
});

app.get("/api/realtime", async (c) => {
  const site = c.req.query("site") || "tns";
  if (!isSiteId(site)) return c.json({ error: "Unknown site." }, 404);
  return c.json(await liveFor(c.env, site));
});

app.get("/api/overview", async (c) => {
  const site = c.req.query("site") || "tns";
  const range = parseRange(c.req.query("range"));
  if (!isSiteId(site)) return c.json({ error: "Unknown site." }, 404);
  c.header("Cache-Control", "private, max-age=15");
  const cacheKey = `ov:${site}:${range}`;
  const cached = (await c.env.KV.get(cacheKey, "json")) as Overview | null;
  if (cached) return c.json(cached);
  const snap = await buildOverview(c.env, site, range);
  if (!snap.unavailable) await c.env.KV.put(cacheKey, JSON.stringify(snap), { expirationTtl: 20 });
  return c.json(snap);
});

async function liveFor(env: AnalyticsEnv, site: string): Promise<{ visitors: number; sessions: number }> {
  if (env.SINK_API) {
    try {
      const headers: Record<string, string> = {};
      if (env.SINK_INTERNAL_SECRET) headers.authorization = `Bearer ${env.SINK_INTERNAL_SECRET}`;
      const res = await env.SINK_API.fetch(`https://api.thenormal.space/v1/sink/internal/live/${site}`, { headers });
      if (res.ok) {
        const json = (await res.json()) as { visitors?: number; sessions?: number };
        return { visitors: Number(json.visitors) || 0, sessions: Number(json.sessions) || 0 };
      }
    } catch (error) {
      console.error(JSON.stringify({ level: "error", source: "live", message: String(error) }));
    }
  }
  const sql = aeSql(env.SINK_DATASET || "thenormal_sink", site, "24h").live;
  const json = await postAe(env, sql);
  if (!json.ok) return { visitors: 0, sessions: 0 };
  const rows = parseAeTable(json.json, ["visitors", "sessions"]);
  const row = rows[0] ?? {};
  return { visitors: cellNumber(row, "visitors"), sessions: cellNumber(row, "sessions") };
}

async function buildOverview(env: AnalyticsEnv, site: string, range: Range): Promise<Overview> {
  const generatedAt = new Date().toISOString();
  if (!env.CF_API_TOKEN) return emptyOverview(range, generatedAt);
  const sql = aeSql(env.SINK_DATASET || "thenormal_sink", site, range);
  const keys = ["totals", "series", "pages", "referrers", "countries", "regions", "cities", "devices", "browsers", "os", "events", "sessions"] as const;
  const results = await Promise.all(keys.map((key) => postAe(env, sql[key])));
  if (results.some((row) => !row.ok)) return emptyOverview(range, generatedAt);

  const [totals, series, pages, referrers, countries, regions, cities, devices, browsers, os, events, sessions] =
    results.map((row) => row.json);
  const totalRow = parseAeTable(totals, ["visitors", "pageviews", "sessions", "duration"])[0] ?? {};
  const sessionRows = parseAeTable(sessions, ["session", "views"]).map((row) => ({
    views: cellNumber(row, "views"),
  }));
  const live = await liveFor(env, site);
  return {
    range,
    generatedAt,
    live,
    visitors: cellNumber(totalRow, "visitors"),
    pageviews: cellNumber(totalRow, "pageviews"),
    sessions: cellNumber(totalRow, "sessions"),
    bounceRate: bounceRate(sessionRows),
    durationMs: cellNumber(totalRow, "duration"),
    series: parseAeTable(series, ["t", "visitors", "pageviews"])
      .filter((row) => cellString(row, "t"))
      .map((row) => ({
        t: cellString(row, "t"),
        visitors: cellNumber(row, "visitors"),
        pageviews: cellNumber(row, "pageviews"),
      })),
    pages: parseAeTable(pages, ["path", "views"]).map((row) => ({
      path: cellString(row, "path") || "/",
      views: cellNumber(row, "views"),
    })),
    referrers: parseAeTable(referrers, ["host", "views"]).map((row) => ({
      host: cellString(row, "host") || "(direct)",
      views: cellNumber(row, "views"),
    })),
    countries: parseAeTable(countries, ["code", "views"]).map((row) => ({
      code: cellString(row, "code") || "XX",
      views: cellNumber(row, "views"),
    })),
    regions: parseAeTable(regions, ["name", "views"])
      .filter((row) => cellString(row, "name"))
      .map((row) => ({ name: cellString(row, "name"), views: cellNumber(row, "views") })),
    cities: parseAeTable(cities, ["name", "views"])
      .filter((row) => cellString(row, "name"))
      .map((row) => ({ name: cellString(row, "name"), views: cellNumber(row, "views") })),
    devices: parseAeTable(devices, ["class", "views"]).map((row) => ({
      class: cellString(row, "class") || "other",
      views: cellNumber(row, "views"),
    })),
    browsers: parseAeTable(browsers, ["name", "views"]).map((row) => ({
      name: cellString(row, "name") || "other",
      views: cellNumber(row, "views"),
    })),
    os: parseAeTable(os, ["name", "views"]).map((row) => ({
      name: cellString(row, "name") || "other",
      views: cellNumber(row, "views"),
    })),
    events: parseAeTable(events, ["name", "views"])
      .filter((row) => cellString(row, "name"))
      .map((row) => ({ name: cellString(row, "name"), views: cellNumber(row, "views") })),
  };
}

type FetchOk = { ok: true; json: unknown };
type FetchFail = { ok: false };

async function postAe(env: AnalyticsEnv, sql: string): Promise<FetchOk | FetchFail> {
  if (!env.CF_API_TOKEN) return { ok: false };
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

export default {
  async fetch(request: Request, env: AnalyticsEnv, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/login") || path === "/oidc/callback" || path === "/logout" || path === "/health") {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};

export { DIMS };
