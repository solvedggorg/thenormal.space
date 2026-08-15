import type { Context } from "hono";
import { cors } from "hono/cors";

export function applySecurityHeaders(c: Context, frame = false): void {
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-Frame-Options", frame ? "SAMEORIGIN" : "DENY");
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.clerk.accounts.dev https://clerk.thenormal.space",
      "style-src 'self' 'unsafe-inline' https://thenormal.space",
      "font-src 'self' https://thenormal.space data:",
      "img-src 'self' data: https://img.clerk.com https://images.clerk.dev",
      "connect-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev https://api.clerk.com https://clerk.thenormal.space",
      "frame-src https://challenges.cloudflare.com https://*.clerk.accounts.dev https://clerk.thenormal.space",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; "),
  );
}

export function allowedOrigin(origin: string | undefined, allowDev: boolean): string | null {
  if (!origin) return null;
  if (allowDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "thenormal.space" || url.hostname.endsWith(".thenormal.space")) return origin;
  } catch {
    return null;
  }
  return null;
}

export function formCors(allowDev: boolean) {
  return cors({
    origin: (origin) => allowedOrigin(origin, allowDev) || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  });
}

export function oauthCors(allowDev: boolean) {
  return cors({
    origin: (origin) => allowedOrigin(origin, allowDev) || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  });
}

export function clientIp(c: Context): string {
  return c.req.header("CF-Connecting-IP") || "";
}

export function userAgent(c: Context): string {
  return (c.req.header("User-Agent") || "").slice(0, 400);
}

export function logJson(level: "info" | "error" | "security", fields: Record<string, unknown>): void {
  const line = JSON.stringify({ level, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export async function readLimitedJson(request: Request, maxBytes = 16_384): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
