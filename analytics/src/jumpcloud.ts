import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const JC_COOKIE = "ns_jc";
export const JC_SESSION_TTL_SEC = 12 * 60 * 60;
const PUBLIC_PATHS = new Set(["/login", "/login/jumpcloud", "/oidc/callback", "/logout"]);

export type JumpCloudSession = { email: string; name: string | null };

type OidcState = { verifier: string; nonce: string; next: string };

type JcEnv = {
  KV: KVNamespace;
  JUMPCLOUD_CLIENT_ID?: string;
  JUMPCLOUD_CLIENT_SECRET?: string;
  JUMPCLOUD_ISSUER?: string;
  JUMPCLOUD_REDIRECT_URI?: string;
  TEST_JUMPCLOUD_USER?: string;
};

export function jumpcloudEnabled(env: JcEnv): boolean {
  return Boolean(env.JUMPCLOUD_CLIENT_ID && (env.JUMPCLOUD_CLIENT_SECRET || env.TEST_JUMPCLOUD_USER));
}

export function isJumpCloudPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

export function issuerOf(env: JcEnv): string {
  return (env.JUMPCLOUD_ISSUER || "https://oauth.id.jumpcloud.com").replace(/\/$/, "");
}

export function redirectUriOf(env: JcEnv, url: string): string {
  if (env.JUMPCLOUD_REDIRECT_URI) return env.JUMPCLOUD_REDIRECT_URI;
  return `${new URL(url).origin}/oidc/callback`;
}

export async function readJumpCloudSession(c: Context<{ Bindings: JcEnv }>): Promise<JumpCloudSession | null> {
  const id = getCookie(c, JC_COOKIE);
  if (!id) return null;
  const raw = await c.env.KV.get(`jc:sess:${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { email?: string; name?: string | null; exp?: number };
    if (!parsed.email || (parsed.exp && parsed.exp * 1000 <= Date.now())) return null;
    return { email: parsed.email, name: parsed.name ?? null };
  } catch {
    return null;
  }
}

export function writeJumpCloudCookie(c: Context, sessionId: string): void {
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, JC_COOKIE, sessionId, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: JC_SESSION_TTL_SEC,
  });
}

export function clearJumpCloudCookie(c: Context): void {
  deleteCookie(c, JC_COOKIE, { path: "/" });
}

export async function startJumpCloudLogin(c: Context<{ Bindings: JcEnv }>): Promise<Response> {
  if (!c.env.JUMPCLOUD_CLIENT_ID) return c.text("JumpCloud is not configured.", 503);
  const next = safeNext(c.req.query("next"));
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(32);
  const challenge = toBase64Url(await sha256Bytes(verifier));
  await c.env.KV.put(`jc:oidc:${state}`, JSON.stringify({ verifier, nonce, next } satisfies OidcState), {
    expirationTtl: 600,
  });
  const issuer = issuerOf(c.env);
  const auth = new URL(`${issuer}/oauth2/auth`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", c.env.JUMPCLOUD_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUriOf(c.env, c.req.url));
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("nonce", nonce);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  return c.redirect(auth.toString(), 302);
}

export async function finishJumpCloudLogin(c: Context<{ Bindings: JcEnv }>): Promise<Response> {
  const code = c.req.query("code") || "";
  const state = c.req.query("state") || "";
  if (!code || !state) return c.text("JumpCloud returned no code.", 400);
  const raw = await c.env.KV.get(`jc:oidc:${state}`);
  await c.env.KV.delete(`jc:oidc:${state}`);
  if (!raw) return c.text("That sign-in is not valid.", 400);
  const saved = JSON.parse(raw) as OidcState;
  const identity = await exchangeJumpCloud(c.env, {
    code,
    verifier: saved.verifier,
    nonce: saved.nonce,
    redirectUri: redirectUriOf(c.env, c.req.url),
  });
  if (!identity) return c.text("JumpCloud did not accept this sign-in.", 403);
  const sessionId = crypto.randomUUID();
  await c.env.KV.put(
    `jc:sess:${sessionId}`,
    JSON.stringify({
      email: identity.email,
      name: identity.name,
      exp: Math.floor(Date.now() / 1000) + JC_SESSION_TTL_SEC,
    }),
    { expirationTtl: JC_SESSION_TTL_SEC },
  );
  writeJumpCloudCookie(c, sessionId);
  return c.redirect(saved.next || "/", 302);
}

export async function destroyJumpCloudSession(c: Context<{ Bindings: JcEnv }>): Promise<void> {
  const id = getCookie(c, JC_COOKIE);
  if (id) await c.env.KV.delete(`jc:sess:${id}`);
  clearJumpCloudCookie(c);
}

async function exchangeJumpCloud(
  env: JcEnv,
  input: { code: string; verifier: string; nonce: string; redirectUri: string },
): Promise<JumpCloudSession | null> {
  if (env.TEST_JUMPCLOUD_USER) return { email: env.TEST_JUMPCLOUD_USER, name: "JumpCloud" };
  if (!env.JUMPCLOUD_CLIENT_ID || !env.JUMPCLOUD_CLIENT_SECRET) return null;
  const issuer = issuerOf(env);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: env.JUMPCLOUD_CLIENT_ID,
    client_secret: env.JUMPCLOUD_CLIENT_SECRET,
    code_verifier: input.verifier,
  });
  const tokenRes = await fetch(`${issuer}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return null;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: [`${issuer}`, `${issuer}/`],
    audience: env.JUMPCLOUD_CLIENT_ID,
  });
  if (payload.nonce && payload.nonce !== input.nonce) return null;
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!email) return null;
  const name = typeof payload.name === "string" ? payload.name : null;
  return { email, name };
}

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

function randomToken(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Bytes(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}
