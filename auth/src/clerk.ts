import { createClerkClient } from "@clerk/backend";
import type { Context } from "hono";
import type { AppEnv } from "./app-env";
import { nowIso, randomId } from "./lib/crypto";
import type { AuthStore, User } from "./store/types";

export type ClerkIdentity = {
  clerkId: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
};

export function clerkConfigured(env: Cloudflare.Env): boolean {
  return Boolean(env.CLERK_PUBLISHABLE_KEY);
}

export function clerkFrontendApi(env: Cloudflare.Env): string {
  if (env.CLERK_FRONTEND_API) return env.CLERK_FRONTEND_API.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const key = env.CLERK_PUBLISHABLE_KEY || "";
  const raw = key.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = atob(raw);
    const host = decoded.split("$")[0] || "";
    if (host.includes(".")) return host;
  } catch {
    /* ignore */
  }
  return "";
}

export async function readClerkIdentity(c: Context<AppEnv>): Promise<ClerkIdentity | null> {
  if (c.env.TEST_CLERK_USER) {
    return {
      clerkId: c.env.TEST_CLERK_ID || "user_test",
      email: c.env.TEST_CLERK_USER,
      name: "Clerk",
      emailVerified: true,
    };
  }
  if (!c.env.CLERK_SECRET_KEY) return null;
  const clerk = createClerkClient({
    secretKey: c.env.CLERK_SECRET_KEY,
    publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
    jwtKey: c.env.CLERK_JWT_KEY,
  });
  const origin = new URL(c.req.url).origin;
  const state = await clerk.authenticateRequest(c.req.raw, {
    authorizedParties: [origin, c.env.ISSUER, "https://auth.thenormal.space"].filter(Boolean),
  });
  if (!state.isAuthenticated) return null;
  const auth = state.toAuth();
  const clerkId = auth.userId;
  if (!clerkId) return null;
  const claims = auth.sessionClaims as { email?: string; name?: string } | null;
  let email = typeof claims?.email === "string" ? claims.email : "";
  let name = typeof claims?.name === "string" ? claims.name : null;
  let emailVerified = true;
  if (!email) {
    const user = await clerk.users.getUser(clerkId);
    email = user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || "";
    name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
    emailVerified = user.primaryEmailAddress?.verification?.status === "verified";
  }
  if (!email) return null;
  return { clerkId, email, name, emailVerified };
}

export async function upsertClerkUser(store: AuthStore, identity: ClerkIdentity): Promise<User> {
  const now = nowIso();
  const existing = (await store.getUserByClerkId(identity.clerkId)) || (await store.getUserByEmail(identity.email));
  if (!existing) {
    return store.createUser({
      id: randomId(),
      email: identity.email.toLowerCase(),
      name: identity.name,
      status: "active",
      email_verified_at: identity.emailVerified ? now : null,
      clerk_user_id: identity.clerkId,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    });
  }
  const next = await store.updateUser(existing.id, {
    email: identity.email.toLowerCase(),
    name: identity.name ?? existing.name,
    status: existing.status === "disabled" ? "disabled" : "active",
    email_verified_at: existing.email_verified_at || (identity.emailVerified ? now : null),
    clerk_user_id: identity.clerkId,
    updated_at: now,
    last_login_at: now,
  });
  return next || existing;
}
