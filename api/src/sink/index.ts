import { Hono } from "hono";
import { allowedOrigin } from "../cors";
import { readLimitedText } from "../security";
import { consumeSink } from "./consume";
import { liveSnapshot, pingRealtime } from "./live";
import {
  asString,
  isSiteId,
  SINK_MAX_BATCH,
  SINK_MAX_BATCH_BYTES,
  SINK_MAX_JSON_BYTES,
  toDataPoint,
  type ArchivedEvent,
  type IncomingEvent,
} from "./schema";
import { hintsFromRequest, normalizeEvent, parseIncomingList, shouldDropRequest } from "./normalize";
import { overRateLimit } from "./rateLimit";
import { originHostAllowed, siteAllowsHost } from "./sites";
import { trackerSource } from "./tracker";

type Bindings = Cloudflare.Env;

export const sink = new Hono<{ Bindings: Bindings }>();

const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (ch) => ch.charCodeAt(0),
);

sink.use("/v1/sink/*", async (c, next) => {
  const allowDev = c.env.ALLOW_DEV_ORIGINS === "true";
  const origin = c.req.header("Origin") || "";
  let allow = "";
  if (origin) {
    allow = allowedOrigin(origin, allowDev);
    if (!allow && (await originHostAllowed(c.env, origin))) allow = origin;
  }
  if (allow) {
    c.header("Access-Control-Allow-Origin", allow);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Max-Age", "600");
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

sink.get("/v1/sink/t.js", (c) => scriptResponse(c));
sink.get("/v1/sink/script.js", (c) => scriptResponse(c));

sink.get("/v1/sink/e", async (c) => {
  const incoming: IncomingEvent = {
    site_id: c.req.query("site_id"),
    type: c.req.query("type") || "pageview",
    event_name: c.req.query("event_name") || c.req.query("name"),
    url: c.req.query("url"),
    pathname: c.req.query("pathname"),
    hostname: c.req.query("hostname"),
    referrer: c.req.query("referrer") || c.req.header("referer"),
  };
  await ingestOne(c, incoming);
  return c.body(PIXEL, 200, {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store",
  });
});

sink.post("/v1/sink/e", (c) => ingestPost(c, SINK_MAX_JSON_BYTES));
sink.post("/v1/sink/track", (c) => ingestPost(c, SINK_MAX_JSON_BYTES));
sink.post("/v1/sink/batch", (c) => ingestPost(c, SINK_MAX_BATCH_BYTES));

sink.get("/v1/sink/internal/live/:site", async (c) => {
  if (!internalOk(c)) return c.json({ error: "Not found." }, 404);
  const site = c.req.param("site");
  if (!isSiteId(site)) return c.json({ error: "Not found." }, 404);
  return c.json({ site, ...(await liveSnapshot(c.env, site)) });
});

async function ingestPost(
  c: { req: { raw: Request }; env: Bindings; executionCtx: ExecutionContext; json: (b: unknown, s?: number) => Response },
  maxBytes: number,
): Promise<Response> {
  const raw = await readLimitedText(c.req.raw, maxBytes);
  if (raw === null) return c.json({ success: false, error: "Payload too large." }, 413);
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ success: false, error: "Send a JSON body." }, 400);
  }
  const events = parseIncomingList(body);
  if (!events || events.length === 0) return c.json({ success: false, error: "Invalid payload." }, 400);
  const slice = events.slice(0, SINK_MAX_BATCH);
  for (const event of slice) await ingestOne(c, event);
  return c.body(null, 204);
}

async function ingestOne(
  c: { req: { raw: Request; header: (n: string) => string | undefined }; env: Bindings; executionCtx: ExecutionContext },
  incoming: IncomingEvent,
): Promise<void> {
  const hints = hintsFromRequest(c.req.raw);
  if (shouldDropRequest(hints)) return;

  const siteId = asString(incoming.site_id).trim();
  if (!isSiteId(siteId)) return;

  const ip = hints.ip;
  if (await overRateLimit(c.env.SINK_CACHE, siteId, ip)) return;

  const salt = c.env.SINK_SALT || "thenormal";
  const event = await normalizeEvent(incoming, hints, salt);
  if (!event) return;

  const origin = c.req.header("origin") || "";
  const originHost = originHostOf(origin);
  const pageHost = event.host;
  const hostOk =
    (await siteAllowsHost(c.env, siteId, pageHost)) ||
    (originHost ? await siteAllowsHost(c.env, siteId, originHost) : false);
  if (!hostOk) return;

  try {
    if (c.env.SINK) c.env.SINK.writeDataPoint(toDataPoint(event));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", source: "ae", message: String(error) }));
  }

  const archived: ArchivedEvent = { ...event, receivedAt: new Date().toISOString() };
  const work: Promise<unknown>[] = [];
  if (c.env.SINK_EVENTS) {
    work.push(
      c.env.SINK_EVENTS.send(archived).catch((error: unknown) => {
        console.error(JSON.stringify({ level: "error", source: "queue", message: String(error) }));
      }),
    );
  }
  work.push(pingRealtime(c.env, siteId, event.visitor, event.session));
  if (!work.length) return;
  try {
    const ctx = c.executionCtx;
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(Promise.all(work));
      return;
    }
  } catch {
    /* app.request in tests has no ExecutionContext */
  }
  await Promise.all(work);
}

function originHostOf(origin: string): string {
  if (!origin) return "";
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
}

function scriptResponse(c: { body: (b: string, s: number, h?: Record<string, string>) => Response }): Response {
  return c.body(trackerSource(), 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
}

function internalOk(c: { req: { header: (n: string) => string | undefined; raw: Request }; env: Bindings }): boolean {
  const secret = c.env.SINK_INTERNAL_SECRET || "";
  const given = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && given && timingSafe(secret, given)) return true;
  if (c.req.header("cf-worker")) return true;
  if (c.env.ALLOW_DEV_ORIGINS === "true") return true;
  return false;
}

function timingSafe(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export { consumeSink };
