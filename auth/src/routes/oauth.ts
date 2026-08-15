import { Hono, type Context } from "hono";
import type { AppEnv } from "../app-env";
import { laterIso, nowIso, randomId, randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { signJwt } from "../lib/jwt";
import { verifyS256 } from "../lib/pkce";
import { logJson, oauthCors, readLimitedJson } from "../lib/security";
import {
  consentCovers,
  discovery,
  grantAllowed,
  issuerOf,
  oauthCodeRedirect,
  oauthErrorRedirect,
  parseBasicAuth,
  parseList,
  parseScopes,
  redirectAllowed,
  safeNext,
  scopeAllowed,
} from "../oauth";
import { parseAmr, readSession, userHasMfa } from "../session";

export const oauth = new Hono<AppEnv>();

oauth.use("/oauth/token", async (c, next) => oauthCors(c.env.ALLOW_DEV_ORIGINS === "true")(c, next));
oauth.use("/oauth/userinfo", async (c, next) => oauthCors(c.env.ALLOW_DEV_ORIGINS === "true")(c, next));
oauth.use("/userinfo", async (c, next) => oauthCors(c.env.ALLOW_DEV_ORIGINS === "true")(c, next));
oauth.use("/oauth/revoke", async (c, next) => oauthCors(c.env.ALLOW_DEV_ORIGINS === "true")(c, next));
oauth.use("/oauth/introspect", async (c, next) => oauthCors(c.env.ALLOW_DEV_ORIGINS === "true")(c, next));

oauth.get("/.well-known/openid-configuration", (c) => c.json(discovery(issuerOf(c.env, c.req.url))));
oauth.get("/.well-known/oauth-authorization-server", (c) => c.json(discovery(issuerOf(c.env, c.req.url))));
oauth.get("/oauth/jwks", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ keys: [c.get("signing").publicJwk] });
});
oauth.get("/jwks.json", (c) => c.redirect("/oauth/jwks", 302));

oauth.get("/oauth/authorize", async (c) => {
  const params = c.req.query();
  const checked = await validateAuthorize(c, params);
  if ("response" in checked) return checked.response;

  const next = `/oauth/authorize?${new URL(c.req.url).searchParams.toString()}`;
  const session = await readSession(c);
  if (!session || params.prompt === "login") {
    if (params.prompt === "none") {
      return c.redirect(oauthErrorRedirect(checked.redirectUri, "login_required", "Sign in first.", params.state), 302);
    }
    return c.redirect(`/?next=${encodeURIComponent(next)}`, 302);
  }
  if (session.user.status !== "active") {
    return c.redirect(oauthErrorRedirect(checked.redirectUri, "access_denied", "This account is disabled.", params.state), 302);
  }
  if (session.source !== "clerk") {
    if (!session.user.email_verified_at) {
      return c.redirect(`/?next=${encodeURIComponent(next)}`, 302);
    }
    if (session.session.aal < 2 || !(await userHasMfa(c, session.user.id))) {
      if (params.prompt === "none") {
        return c.redirect(
          oauthErrorRedirect(checked.redirectUri, "interaction_required", "A passkey or code is required.", params.state),
          302,
        );
      }
      return c.redirect(`/?next=${encodeURIComponent(next)}`, 302);
    }
  }

  const store = c.get("store");
  const consent = await store.getConsent(session.user.id, checked.client.client_id);
  const firstParty = checked.client.first_party === 1;
  if (params.prompt === "consent" || (!firstParty && (!consent || !consentCovers(consent.scope, checked.scopes)))) {
    return c.redirect(`/consent?${new URL(c.req.url).searchParams.toString()}`, 302);
  }

  const location = await issueCode(c, {
    clientId: checked.client.client_id,
    userId: session.user.id,
    sessionId: session.session.id,
    redirectUri: checked.redirectUri,
    scopes: checked.scopes,
    nonce: params.nonce || null,
    challenge: checked.challenge,
    state: params.state,
    amr: parseAmr(session.session.amr),
    authTime: session.session.created_at,
  });
  return c.redirect(location, 302);
});

oauth.post("/oauth/authorize", async (c) => {
  const form = await c.req.parseBody();
  const params = Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
  ) as Record<string, string>;
  if (params.decision !== "allow") {
    const redirectUri = params.redirect_uri;
    if (redirectUri) return c.redirect(oauthErrorRedirect(redirectUri, "access_denied", "Access was denied.", params.state), 302);
    return c.redirect("/", 302);
  }
  const checked = await validateAuthorize(c, params);
  if ("response" in checked) return checked.response;
  const session = await readSession(c);
  if (!session || (session.source !== "clerk" && session.session.aal < 2)) {
    return c.redirect(`/?next=${encodeURIComponent(safeNext(undefined, "/"))}`, 302);
  }
  const store = c.get("store");
  await store.putConsent({
    user_id: session.user.id,
    client_id: checked.client.client_id,
    scope: checked.scopes.join(" "),
    created_at: nowIso(),
  });
  const location = await issueCode(c, {
    clientId: checked.client.client_id,
    userId: session.user.id,
    sessionId: session.session.id,
    redirectUri: checked.redirectUri,
    scopes: checked.scopes,
    nonce: params.nonce || null,
    challenge: checked.challenge,
    state: params.state,
    amr: parseAmr(session.session.amr),
    authTime: session.session.created_at,
  });
  return c.redirect(location, 302);
});

oauth.post("/oauth/token", async (c) => {
  const form = await readForm(c);
  if (!form) return c.json({ error: "invalid_request" }, 400);
  const grant = form.grant_type;
  const identified = await identifyClient(c, form);
  if (!identified.ok) return c.json({ error: identified.error }, 401);

  if (grant === "authorization_code") return handleAuthorizationCode(c, form, identified);
  if (grant === "refresh_token") return handleRefresh(c, form, identified);
  if (grant === "client_credentials") return handleClientCredentials(c, form, identified);
  return c.json({ error: "unsupported_grant_type" }, 400);
});

oauth.get("/oauth/userinfo", (c) => userinfo(c));
oauth.post("/oauth/userinfo", (c) => userinfo(c));
oauth.get("/userinfo", (c) => userinfo(c));

oauth.post("/oauth/revoke", async (c) => {
  const form = await readForm(c);
  if (!form?.token) return c.json({ error: "invalid_request" }, 400);
  const identified = await identifyClient(c, form);
  if (!identified.ok) return c.json({ error: identified.error }, 401);
  const store = c.get("store");
  const hash = await sha256Hex(form.token);
  const row = await store.getTokenByHash(hash);
  if (row && row.client_id === identified.client.client_id) {
    const now = nowIso();
    await store.revokeToken(hash, now);
    if (row.family_id) await store.revokeFamily(row.family_id, now);
  }
  return c.body(null, 200);
});

oauth.post("/oauth/introspect", async (c) => {
  const form = await readForm(c);
  if (!form?.token) return c.json({ error: "invalid_request" }, 400);
  const identified = await identifyClient(c, form);
  if (!identified.ok) return c.json({ error: identified.error }, 401);
  if (identified.client.type !== "confidential") return c.json({ error: "invalid_client" }, 401);
  const store = c.get("store");
  const hash = await sha256Hex(form.token);
  const row = await store.getTokenByHash(hash);
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || row.client_id !== identified.client.client_id) {
    return c.json({ active: false });
  }
  return c.json({
    active: true,
    scope: row.scope,
    client_id: row.client_id,
    token_type: row.type === "refresh" ? "refresh_token" : "Bearer",
    exp: Math.floor(Date.parse(row.expires_at) / 1000),
    iat: Math.floor(Date.parse(row.created_at) / 1000),
    sub: row.user_id || undefined,
  });
});

oauth.post("/oauth/register", async (c) => {
  if (c.env.ALLOW_DCR !== "true") return c.json({ error: "invalid_request", error_description: "Registration is closed." }, 403);
  const limited = c.get("limit");
  const allowed = await limited.take(`dcr:${c.req.header("CF-Connecting-IP") || "x"}`, 5, 3600);
  if (!allowed.ok) return c.json({ error: "slow_down" }, 429);
  const body = await readLimitedJson(c.req.raw);
  if (!body || typeof body !== "object") return c.json({ error: "invalid_client_metadata" }, 400);
  const raw = body as Record<string, unknown>;
  const name = typeof raw.client_name === "string" ? raw.client_name.trim() : "";
  const redirects = Array.isArray(raw.redirect_uris) ? raw.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!name || !redirects.length) return c.json({ error: "invalid_client_metadata" }, 400);
  const now = nowIso();
  const secret = randomToken(32);
  const client = await c.get("store").createClient({
    id: randomId(),
    client_id: randomId(),
    client_secret_hash: await sha256Hex(secret),
    name,
    type: "confidential",
    redirect_uris: JSON.stringify(redirects),
    grant_types: JSON.stringify(["authorization_code", "refresh_token"]),
    scopes: JSON.stringify(["openid", "profile", "email", "offline_access"]),
    first_party: 0,
    token_endpoint_auth_method: "client_secret_basic",
    created_at: now,
    updated_at: now,
  });
  return c.json(
    {
      client_id: client.client_id,
      client_secret: secret,
      client_name: client.name,
      redirect_uris: redirects,
      grant_types: parseList(client.grant_types),
      token_endpoint_auth_method: client.token_endpoint_auth_method,
    },
    201,
  );
});

async function validateAuthorize(c: Context<AppEnv>, params: Record<string, string | undefined>) {
  const clientId = params.client_id || "";
  const redirectUri = params.redirect_uri || "";
  const store = c.get("store");
  const client = await store.getClientByClientId(clientId);
  if (!client || !redirectUri || !redirectAllowed(client, redirectUri)) {
    return { response: c.json({ error: "invalid_request", error_description: "Unknown client or redirect." }, 400) };
  }
  if (params.response_type !== "code") {
    return { response: c.redirect(oauthErrorRedirect(redirectUri, "unsupported_response_type", "Only code is supported.", params.state), 302) };
  }
  const scopes = parseScopes(params.scope);
  if (!scopes.includes("openid") || !scopeAllowed(client, scopes)) {
    return { response: c.redirect(oauthErrorRedirect(redirectUri, "invalid_scope", "That scope is not allowed.", params.state), 302) };
  }
  if (params.code_challenge_method !== "S256" || !params.code_challenge) {
    return { response: c.redirect(oauthErrorRedirect(redirectUri, "invalid_request", "PKCE S256 is required.", params.state), 302) };
  }
  return { client, redirectUri, scopes, challenge: params.code_challenge };
}

async function issueCode(
  c: Context<AppEnv>,
  input: {
    clientId: string;
    userId: string;
    sessionId: string;
    redirectUri: string;
    scopes: string[];
    nonce: string | null;
    challenge: string;
    state?: string;
    amr: string[];
    authTime: string;
  },
) {
  const code = randomToken(32);
  await c.get("store").createCode({
    id: randomId(),
    code_hash: await sha256Hex(code),
    client_id: input.clientId,
    user_id: input.userId,
    session_id: input.sessionId,
    redirect_uri: input.redirectUri,
    scope: input.scopes.join(" "),
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    auth_time: input.authTime,
    amr: JSON.stringify(input.amr),
    expires_at: laterIso(60_000),
    consumed_at: null,
  });
  logJson("info", { event: "oauth.code", client_id: input.clientId, user_id: input.userId });
  return oauthCodeRedirect(input.redirectUri, code, input.state);
}

async function handleAuthorizationCode(
  c: Context<AppEnv>,
  form: Record<string, string>,
  identified: Extract<Awaited<ReturnType<typeof identifyClient>>, { ok: true }>,
) {
  if (!form.code || !form.redirect_uri || !form.code_verifier) return c.json({ error: "invalid_request" }, 400);
  const store = c.get("store");
  const row = await store.consumeCode(await sha256Hex(form.code), nowIso());
  if (!row || row.client_id !== identified.client.client_id || row.redirect_uri !== form.redirect_uri) {
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (!(await verifyS256(form.code_verifier, row.code_challenge))) return c.json({ error: "invalid_grant" }, 400);
  const user = await store.getUserById(row.user_id);
  if (!user || user.status !== "active") return c.json({ error: "invalid_grant" }, 400);
  return issueTokens(c, {
    client: identified.client,
    user,
    scope: row.scope,
    nonce: row.nonce,
    amr: parseAmr(row.amr),
    authTime: row.auth_time,
    includeRefresh: row.scope.includes("offline_access"),
  });
}

async function handleRefresh(
  c: Context<AppEnv>,
  form: Record<string, string>,
  identified: Extract<Awaited<ReturnType<typeof identifyClient>>, { ok: true }>,
) {
  if (!form.refresh_token) return c.json({ error: "invalid_request" }, 400);
  const store = c.get("store");
  const hash = await sha256Hex(form.refresh_token);
  const row = await store.getTokenByHash(hash);
  if (
    !row ||
    row.type !== "refresh" ||
    row.revoked_at ||
    Date.parse(row.expires_at) <= Date.now() ||
    row.client_id !== identified.client.client_id ||
    !row.user_id
  ) {
    if (row?.family_id) await store.revokeFamily(row.family_id, nowIso());
    return c.json({ error: "invalid_grant" }, 400);
  }
  await store.revokeToken(hash, nowIso());
  const user = await store.getUserById(row.user_id);
  if (!user || user.status !== "active") return c.json({ error: "invalid_grant" }, 400);
  let scope = row.scope;
  if (form.scope) {
    const requested = parseScopes(form.scope);
    if (!requested.every((s) => row.scope.split(/\s+/).includes(s))) return c.json({ error: "invalid_scope" }, 400);
    scope = requested.join(" ");
  }
  return issueTokens(c, {
    client: identified.client,
    user,
    scope,
    nonce: null,
    amr: ["mfa"],
    authTime: row.created_at,
    includeRefresh: true,
    familyId: row.family_id || randomId(),
  });
}

async function handleClientCredentials(
  c: Context<AppEnv>,
  form: Record<string, string>,
  identified: Extract<Awaited<ReturnType<typeof identifyClient>>, { ok: true }>,
) {
  if (identified.client.type !== "confidential" || !grantAllowed(identified.client, "client_credentials")) {
    return c.json({ error: "unauthorized_client" }, 400);
  }
  const scopes = parseScopes(form.scope).filter((s) => s !== "openid" && s !== "offline_access");
  if (!scopeAllowed(identified.client, scopes.length ? scopes : parseList(identified.client.scopes))) {
    return c.json({ error: "invalid_scope" }, 400);
  }
  const scope = (scopes.length ? scopes : parseList(identified.client.scopes).filter((s) => s !== "openid")).join(" ");
  const issuer = issuerOf(c.env, c.req.url);
  const access = await signJwt(
    c.get("signing"),
    { scope, client_id: identified.client.client_id },
    { issuer, audience: identified.client.client_id, expiresIn: "1h", subject: identified.client.client_id },
  );
  await c.get("store").createToken({
    id: randomId(),
    token_hash: await sha256Hex(access),
    type: "access",
    client_id: identified.client.client_id,
    user_id: null,
    scope,
    expires_at: laterIso(3600_000),
    revoked_at: null,
    family_id: null,
    created_at: nowIso(),
  });
  return c.json({ access_token: access, token_type: "Bearer", expires_in: 3600, scope });
}

async function issueTokens(
  c: Context<AppEnv>,
  input: {
    client: import("../store/types").OAuthClient;
    user: import("../store/types").User;
    scope: string;
    nonce: string | null;
    amr: string[];
    authTime: string;
    includeRefresh: boolean;
    familyId?: string;
  },
) {
  const issuer = issuerOf(c.env, c.req.url);
  const familyId = input.familyId || randomId();
  const now = nowIso();
  const access = await signJwt(
    c.get("signing"),
    {
      scope: input.scope,
      client_id: input.client.client_id,
      email: input.user.email,
      email_verified: Boolean(input.user.email_verified_at),
    },
    { issuer, audience: input.client.client_id, expiresIn: "1h", subject: input.user.id },
  );
  const idToken = await signJwt(
    c.get("signing"),
    {
      email: input.user.email,
      email_verified: Boolean(input.user.email_verified_at),
      name: input.user.name || input.user.email,
      amr: input.amr,
      auth_time: Math.floor(Date.parse(input.authTime) / 1000),
      nonce: input.nonce || undefined,
    },
    { issuer, audience: input.client.client_id, expiresIn: "1h", subject: input.user.id },
  );
  await c.get("store").createToken({
    id: randomId(),
    token_hash: await sha256Hex(access),
    type: "access",
    client_id: input.client.client_id,
    user_id: input.user.id,
    scope: input.scope,
    expires_at: laterIso(3600_000),
    revoked_at: null,
    family_id: familyId,
    created_at: now,
  });
  const body: Record<string, unknown> = {
    access_token: access,
    id_token: idToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: input.scope,
  };
  if (input.includeRefresh) {
    const refresh = randomToken(32);
    await c.get("store").createToken({
      id: randomId(),
      token_hash: await sha256Hex(refresh),
      type: "refresh",
      client_id: input.client.client_id,
      user_id: input.user.id,
      scope: input.scope,
      expires_at: laterIso(30 * 24 * 3600_000),
      revoked_at: null,
      family_id: familyId,
      created_at: now,
    });
    body.refresh_token = refresh;
  }
  return c.json(body);
}

async function userinfo(c: Context<AppEnv>) {
  const token = bearer(c.req.header("Authorization")) || c.req.query("access_token");
  if (!token) return c.json({ error: "invalid_token" }, 401);
  const store = c.get("store");
  const row = await store.getTokenByHash(await sha256Hex(token));
  if (!row || row.type !== "access" || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || !row.user_id) {
    return c.json({ error: "invalid_token" }, 401);
  }
  const user = await store.getUserById(row.user_id);
  if (!user || user.status !== "active") return c.json({ error: "invalid_token" }, 401);
  const scopes = new Set(row.scope.split(/\s+/));
  const body: Record<string, unknown> = { sub: user.id };
  if (scopes.has("email")) {
    body.email = user.email;
    body.email_verified = Boolean(user.email_verified_at);
  }
  if (scopes.has("profile")) body.name = user.name || user.email;
  return c.json(body);
}

async function identifyClient(
  c: Context<AppEnv>,
  form: Record<string, string>,
): Promise<{ ok: true; client: import("../store/types").OAuthClient } | { ok: false; error: string }> {
  const basic = parseBasicAuth(c.req.header("Authorization"));
  const clientId = basic?.id || form.client_id || "";
  const secret = basic?.secret || form.client_secret || "";
  const client = await c.get("store").getClientByClientId(clientId);
  if (!client) return { ok: false, error: "invalid_client" };
  if (client.type === "confidential") {
    if (!client.client_secret_hash || !secret) return { ok: false, error: "invalid_client" };
    if (!(await timingSafeEqual(await sha256Hex(secret), client.client_secret_hash))) {
      return { ok: false, error: "invalid_client" };
    }
  } else if (secret) {
    return { ok: false, error: "invalid_client" };
  }
  return { ok: true, client };
}

async function readForm(c: Context<AppEnv>): Promise<Record<string, string> | null> {
  const type = c.req.header("content-type") || "";
  if (type.includes("application/json")) {
    const json = await readLimitedJson(c.req.raw);
    if (!json || typeof json !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    return out;
  }
  try {
    const body = await c.req.parseBody();
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return null;
  }
}

function bearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}
