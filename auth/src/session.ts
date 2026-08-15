import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "./app-env";
import { laterIso, nowIso, randomId } from "./lib/crypto";
import { readClerkIdentity, upsertClerkUser } from "./clerk";
import type { Session, User } from "./store/types";

export type Identity = {
  user: User;
  session: Session;
  source: "clerk" | "local";
};

export const SESSION_COOKIE = "ns_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function readSession(c: Context<AppEnv>): Promise<Identity | null> {
  return readIdentity(c);
}

export async function readIdentity(c: Context<AppEnv>): Promise<Identity | null> {
  const clerk = await readClerkIdentity(c);
  if (clerk) {
    const user = await upsertClerkUser(c.get("store"), clerk);
    if (user.status === "disabled") return null;
    const session: Session = {
      id: `clerk:${clerk.clerkId}`,
      user_id: user.id,
      aal: 2,
      amr: JSON.stringify(["clerk"]),
      expires_at: laterIso(SESSION_TTL_MS),
      created_at: user.last_login_at || nowIso(),
      ip: c.req.header("CF-Connecting-IP") || null,
      ua: (c.req.header("User-Agent") || "").slice(0, 400) || null,
      revoked_at: null,
    };
    return { user, session, source: "clerk" };
  }

  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const store = c.get("store");
  const session = await store.getSession(id);
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  const user = await store.getUserById(session.user_id);
  if (!user || user.status === "disabled") return null;
  return { session, user, source: "local" };
}

export function writeSessionCookie(c: Context<AppEnv>, sessionId: string): void {
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function createSession(
  c: Context<AppEnv>,
  userId: string,
  aal: 1 | 2,
  amr: string[],
): Promise<Session> {
  const store = c.get("store");
  const session: Session = {
    id: randomId(),
    user_id: userId,
    aal,
    amr: JSON.stringify(amr),
    expires_at: laterIso(SESSION_TTL_MS),
    created_at: nowIso(),
    ip: c.req.header("CF-Connecting-IP") || null,
    ua: (c.req.header("User-Agent") || "").slice(0, 400) || null,
    revoked_at: null,
  };
  await store.createSession(session);
  writeSessionCookie(c, session.id);
  return session;
}

export function parseAmr(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function userHasMfa(c: Context<AppEnv>, userId: string): Promise<boolean> {
  const store = c.get("store");
  const [keys, totp] = await Promise.all([store.listPasskeys(userId), store.getTotp(userId)]);
  return keys.length > 0 || Boolean(totp?.verified_at);
}
