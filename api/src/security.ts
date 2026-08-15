import type { Context } from "hono";
import { cors } from "hono/cors";
import { allowedOrigin } from "./cors";

export const MAX_JSON_BYTES = 4096;

export type SecurityReason = "not_allowlisted" | "origin_denied" | "turnstile_failed";

const ALLOWED = new Set([
  "OPTIONS /list/subscribe",
  "POST /list/subscribe",
  "GET /list/confirm",
  "GET /list/unsubscribe",
  "POST /list/unsubscribe",
  "OPTIONS /contact",
  "POST /contact",
  "GET /shop/health",
  "OPTIONS /shop/products",
  "GET /shop/products",
  "OPTIONS /shop/webhooks/medusa",
  "POST /shop/webhooks/medusa",
  "OPTIONS /v1/sink/e",
  "GET /v1/sink/e",
  "POST /v1/sink/e",
  "OPTIONS /v1/sink/track",
  "POST /v1/sink/track",
  "OPTIONS /v1/sink/batch",
  "POST /v1/sink/batch",
  "GET /v1/sink/t.js",
  "GET /v1/sink/script.js",
]);

export function isAllowlisted(method: string, pathname: string): boolean {
  const key = `${method.toUpperCase()} ${pathname}`;
  if (ALLOWED.has(key)) return true;
  if (["GET", "PUT", "DELETE"].includes(method.toUpperCase()) && pathname.startsWith("/shop/media/")) {
    return true;
  }
  if (method.toUpperCase() === "GET" && pathname.startsWith("/shop/products/")) return true;
  if (method.toUpperCase() === "GET" && pathname.startsWith("/v1/sink/")) return true;
  return false;
}

export function applySecurityHeaders(c: Context): void {
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-Frame-Options", "DENY");
  c.header("Cache-Control", "no-store");
}

export function logSecurity(c: Context, reason: SecurityReason): void {
  const url = new URL(c.req.url);
  console.log(
    JSON.stringify({
      level: "security",
      event: "denied",
      reason,
      host: url.host,
      path: url.pathname,
      method: c.req.method,
      ip: c.req.header("CF-Connecting-IP") || "",
      country: c.req.header("CF-IPCountry") || "",
      ua: c.req.header("User-Agent") || "",
    }),
  );
}

export function denyNotFound(c: Context): Response {
  logSecurity(c, "not_allowlisted");
  return c.json({ error: "Not found." }, 404);
}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  return new TextDecoder().decode(buf);
}

export function formCors(allowDev: boolean) {
  return cors({
    origin: (origin) => allowedOrigin(origin, allowDev),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
  });
}
