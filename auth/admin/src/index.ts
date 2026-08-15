import { Hono } from "hono";
import { applySecurityHeaders, logJson } from "../../src/lib/security";
import { laterIso, nowIso, randomId, randomToken, sha256Hex, isEmail, normalizeEmail } from "../../src/lib/crypto";
import { adminLayout } from "../../src/lib/html";
import { inviteMail, sendMail } from "../../src/lib/mail";
import { escapeHtml } from "../../src/lib/security";
import { createD1Store } from "../../src/store/d1";
import { createMemoryStore } from "../../src/store/memory";
import type { AuthStore, OAuthClient } from "../../src/store/types";
import { accessTokenFrom, verifyAccess } from "./access";
import {
  destroyJumpCloudSession,
  finishJumpCloudLogin,
  isJumpCloudPublicPath,
  jumpcloudEnabled,
  readJumpCloudSession,
  startJumpCloudLogin,
} from "./jumpcloud";
import { layout } from "../../src/lib/html";

type AdminEnv = {
  Bindings: Cloudflare.Env;
  Variables: { store: AuthStore; email: string };
};

export const app = new Hono<AdminEnv>();

app.onError((error, c) => {
  logJson("error", { message: error.message, app: "admin" });
  return c.json({ error: "Something went wrong." }, 500);
});

app.use("*", async (c, next) => {
  applySecurityHeaders(c);
  c.set("store", resolveStore(c.env));
  const path = new URL(c.req.url).pathname;
  if (path === "/health" && c.env.ALLOW_DEV_ACCESS === "true") {
    c.set("email", c.env.DEV_ACCESS_EMAIL || "dev@thenormal.space");
    await next();
    return;
  }
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
    logJson("security", { event: "access.denied", path });
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
  const next = c.req.query("next") || "/";
  if (!jumpcloudEnabled(c.env)) return c.text("JumpCloud is not configured.", 503);
  return c.html(
    layout({
      title: "Sign in",
      kicker: "Admin",
      body: `
        <h1>JumpCloud</h1>
        <p>This console uses JumpCloud. Access still sits on the hostname.</p>
        <div class="card">
          <a class="btn primary" href="/login/jumpcloud?next=${encodeURIComponent(next)}">Continue with JumpCloud</a>
        </div>
      `,
    }),
  );
});

app.get("/login/jumpcloud", (c) => startJumpCloudLogin(c));
app.get("/oidc/callback", (c) => finishJumpCloudLogin(c));
app.post("/logout", async (c) => {
  await destroyJumpCloudSession(c);
  return c.redirect("/login", 302);
});

app.get("/", async (c) => {
  const store = c.get("store");
  const [people, clients] = await Promise.all([store.countUsers(), store.listClients()]);
  return c.html(
    adminLayout({
      title: "Auth",
      email: c.get("email"),
      body: `
        <div class="card">
          <p>${people} people. ${clients.length} clients.</p>
          <div class="row">
            <a class="btn primary" href="/users">People</a>
            <a class="btn ghost" href="/clients/new">New client</a>
          </div>
        </div>
      `,
    }),
  );
});

app.get("/users", async (c) => {
  const q = c.req.query("q") || "";
  const page = Math.max(0, Number(c.req.query("page") || "0") || 0);
  const store = c.get("store");
  const users = await store.listUsers({ q, limit: 50, offset: page * 50 });
  return c.html(
    adminLayout({
      title: "People",
      email: c.get("email"),
      body: `
        <form method="get" action="/users" class="card" style="margin-bottom:1rem">
          <label for="q">Search</label>
          <input id="q" name="q" value="${escapeHtml(q)}" />
          <button class="ghost" type="submit">Search</button>
        </form>
        <form method="post" action="/users/invite" class="card" style="margin-bottom:1rem">
          <label for="email">Invite</label>
          <input id="email" name="email" type="email" required />
          <button class="primary" type="submit">Send a link</button>
        </form>
        <table>
          <tr><th>Email</th><th>Status</th><th>Created</th></tr>
          ${users
            .map(
              (user) =>
                `<tr><td><a href="/users/${user.id}">${escapeHtml(user.email)}</a></td><td>${escapeHtml(user.status)}</td><td class="mono">${escapeHtml(user.created_at.slice(0, 10))}</td></tr>`,
            )
            .join("")}
        </table>
      `,
    }),
  );
});

app.get("/users/:id", async (c) => {
  const user = await c.get("store").getUserById(c.req.param("id"));
  if (!user) return c.text("Not found.", 404);
  const keys = await c.get("store").listPasskeys(user.id);
  const totp = await c.get("store").getTotp(user.id);
  return c.html(
    adminLayout({
      title: user.email,
      email: c.get("email"),
      body: `
        <div class="card">
          <p>Status: ${escapeHtml(user.status)}. Passkeys: ${keys.length}. Authenticator: ${totp?.verified_at ? "on" : "off"}.</p>
          <form method="post" action="/users/${user.id}/status" class="row">
            <input type="hidden" name="status" value="${user.status === "disabled" ? "active" : "disabled"}" />
            <button class="ghost" type="submit">${user.status === "disabled" ? "Enable" : "Disable"}</button>
          </form>
          <form method="post" action="/users/${user.id}/revoke" style="margin-top:.8rem">
            <button class="ghost" type="submit">Revoke sessions and tokens</button>
          </form>
        </div>
      `,
    }),
  );
});

app.post("/users/invite", async (c) => {
  const form = await c.req.parseBody();
  const email = typeof form.email === "string" ? normalizeEmail(form.email) : "";
  if (!isEmail(email)) return c.redirect("/users", 302);
  const store = c.get("store");
  let user = await store.getUserByEmail(email);
  const now = nowIso();
  if (!user) {
    user = await store.createUser({
      id: randomId(),
      email,
      name: null,
      status: "pending",
      email_verified_at: null,
      clerk_user_id: null,
      created_at: now,
      updated_at: now,
      last_login_at: null,
    });
  }
  const token = randomToken(32);
  await store.createEmailChallenge({
    id: randomId(),
    email,
    purpose: "verify",
    token_hash: await sha256Hex(token),
    expires_at: laterIso(24 * 3600_000),
    consumed_at: null,
    created_at: now,
  });
  const issuer = (c.env.ISSUER || "https://auth.thenormal.space").replace(/\/$/, "");
  try {
    await sendMail(c.env, inviteMail(email, `${issuer}/verify?token=${token}`));
  } catch (error) {
    logJson("error", { event: "invite.mail", message: error instanceof Error ? error.message : "send" });
  }
  await audit(c, "user.invite", "user", user.id, { email });
  return c.redirect(`/users/${user.id}`, 302);
});

app.post("/users/:id/status", async (c) => {
  const form = await c.req.parseBody();
  const status = form.status === "disabled" ? "disabled" : "active";
  const user = await c.get("store").updateUser(c.req.param("id"), { status, updated_at: nowIso() });
  if (user && status === "disabled") {
    await c.get("store").revokeUserSessions(user.id, nowIso());
    await c.get("store").revokeUserTokens(user.id, nowIso());
  }
  if (user) await audit(c, "user.status", "user", user.id, { status });
  return c.redirect(`/users/${c.req.param("id")}`, 302);
});

app.post("/users/:id/revoke", async (c) => {
  const id = c.req.param("id");
  const now = nowIso();
  await c.get("store").revokeUserSessions(id, now);
  await c.get("store").revokeUserTokens(id, now);
  await audit(c, "user.revoke", "user", id, {});
  return c.redirect(`/users/${id}`, 302);
});

app.get("/clients", async (c) => {
  const clients = await c.get("store").listClients();
  return c.html(
    adminLayout({
      title: "Clients",
      email: c.get("email"),
      body: `
        <div class="row" style="margin-bottom:1rem"><a class="btn primary" href="/clients/new">New client</a></div>
        <table>
          <tr><th>Name</th><th>Client ID</th><th>Type</th></tr>
          ${clients
            .map(
              (client) =>
                `<tr><td><a href="/clients/${client.id}">${escapeHtml(client.name)}</a></td><td class="mono">${escapeHtml(client.client_id)}</td><td>${escapeHtml(client.type)}</td></tr>`,
            )
            .join("")}
        </table>
      `,
    }),
  );
});

app.get("/clients/new", (c) =>
  c.html(
    adminLayout({
      title: "New client",
      email: c.get("email"),
      body: clientForm(),
    }),
  ),
);

app.post("/clients", async (c) => {
  const parsed = await parseClientForm(c);
  if (!parsed) return c.redirect("/clients/new", 302);
  const now = nowIso();
  const secret = parsed.type === "confidential" ? randomToken(32) : null;
  const client = await c.get("store").createClient({
    id: randomId(),
    client_id: randomId(),
    client_secret_hash: secret ? await sha256Hex(secret) : null,
    name: parsed.name,
    type: parsed.type,
    redirect_uris: JSON.stringify(parsed.redirects),
    grant_types: JSON.stringify(parsed.grants),
    scopes: JSON.stringify(parsed.scopes),
    first_party: parsed.firstParty ? 1 : 0,
    token_endpoint_auth_method: parsed.type === "confidential" ? "client_secret_basic" : "none",
    created_at: now,
    updated_at: now,
  });
  await audit(c, "client.create", "client", client.id, { client_id: client.client_id });
  return c.html(
    adminLayout({
      title: "Client created",
      email: c.get("email"),
      body: `
        <div class="card">
          <p>Client ID</p>
          <p class="mono">${escapeHtml(client.client_id)}</p>
          ${secret ? `<p>Client secret — copy it now.</p><p class="mono">${escapeHtml(secret)}</p>` : "<p>Public client. PKCE only.</p>"}
          <a class="btn primary" href="/clients/${client.id}">Continue</a>
        </div>
      `,
    }),
  );
});

app.get("/clients/:id", async (c) => {
  const client = await c.get("store").getClient(c.req.param("id"));
  if (!client) return c.text("Not found.", 404);
  return c.html(
    adminLayout({
      title: client.name,
      email: c.get("email"),
      body: `
        ${clientForm(client)}
        <form method="post" action="/clients/${client.id}/rotate" class="card" style="margin-top:1rem">
          <button class="ghost" type="submit">Rotate secret</button>
        </form>
        <form method="post" action="/clients/${client.id}/delete" class="card" style="margin-top:1rem">
          <button class="ghost" type="submit">Delete</button>
        </form>
      `,
    }),
  );
});

app.post("/clients/:id", async (c) => {
  const parsed = await parseClientForm(c);
  if (!parsed) return c.redirect(`/clients/${c.req.param("id")}`, 302);
  await c.get("store").updateClient(c.req.param("id"), {
    name: parsed.name,
    redirect_uris: JSON.stringify(parsed.redirects),
    grant_types: JSON.stringify(parsed.grants),
    scopes: JSON.stringify(parsed.scopes),
    first_party: parsed.firstParty ? 1 : 0,
    updated_at: nowIso(),
  });
  await audit(c, "client.update", "client", c.req.param("id"), {});
  return c.redirect(`/clients/${c.req.param("id")}`, 302);
});

app.post("/clients/:id/rotate", async (c) => {
  const client = await c.get("store").getClient(c.req.param("id"));
  if (!client || client.type !== "confidential") return c.redirect("/clients", 302);
  const secret = randomToken(32);
  await c.get("store").updateClient(client.id, { client_secret_hash: await sha256Hex(secret), updated_at: nowIso() });
  await audit(c, "client.rotate", "client", client.id, {});
  return c.html(
    adminLayout({
      title: "New secret",
      email: c.get("email"),
      body: `<div class="card"><p class="mono">${escapeHtml(secret)}</p><a class="btn primary" href="/clients/${client.id}">Back</a></div>`,
    }),
  );
});

app.post("/clients/:id/delete", async (c) => {
  await c.get("store").deleteClient(c.req.param("id"));
  await audit(c, "client.delete", "client", c.req.param("id"), {});
  return c.redirect("/clients", 302);
});

app.get("/audit", async (c) => {
  const events = await c.get("store").listAudit(100, 0);
  return c.html(
    adminLayout({
      title: "Log",
      email: c.get("email"),
      body: `
        <table>
          <tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th></tr>
          ${events
            .map(
              (event) =>
                `<tr><td class="mono">${escapeHtml(event.created_at)}</td><td>${escapeHtml(event.action)}</td><td class="mono">${escapeHtml(event.actor_id || event.actor_type)}</td><td class="mono">${escapeHtml(event.target_id || "")}</td></tr>`,
            )
            .join("")}
        </table>
      `,
    }),
  );
});

function clientForm(client?: OAuthClient): string {
  const redirects = client ? JSON.parse(client.redirect_uris).join("\n") : "";
  return `
    <form method="post" action="${client ? `/clients/${client.id}` : "/clients"}" class="card">
      <label for="name">Name</label>
      <input id="name" name="name" value="${escapeHtml(client?.name || "")}" required />
      <label for="type">Type</label>
      <select id="type" name="type" ${client ? "disabled" : ""}>
        <option value="public" ${client?.type === "public" ? "selected" : ""}>Public (PKCE)</option>
        <option value="confidential" ${!client || client.type === "confidential" ? "selected" : ""}>Confidential</option>
      </select>
      <label for="redirects">Redirect URIs, one per line</label>
      <textarea id="redirects" name="redirects" rows="5" required>${escapeHtml(redirects)}</textarea>
      <label><input type="checkbox" name="first_party" ${client?.first_party ? "checked" : ""} /> First party — skip consent</label>
      <label><input type="checkbox" name="offline" ${!client || client.scopes.includes("offline_access") ? "checked" : ""} /> Refresh tokens</label>
      <div class="row"><button class="primary" type="submit">Save</button></div>
    </form>
  `;
}

async function parseClientForm(c: { req: { parseBody: () => Promise<Record<string, unknown>> } }) {
  const form = await c.req.parseBody();
  const name = typeof form.name === "string" ? form.name.trim() : "";
  const type = form.type === "public" ? "public" : "confidential";
  const redirects = typeof form.redirects === "string" ? form.redirects.split(/\s+/).filter(Boolean) : [];
  if (!name || !redirects.length) return null;
  const scopes = ["openid", "profile", "email"];
  if (form.offline) scopes.push("offline_access");
  return {
    name,
    type: type as "public" | "confidential",
    redirects,
    grants: ["authorization_code", "refresh_token", ...(type === "confidential" ? ["client_credentials"] : [])],
    scopes,
    firstParty: Boolean(form.first_party),
  };
}

async function audit(
  c: { get: (k: "store" | "email") => AuthStore | string; req: { header: (n: string) => string | undefined } },
  action: string,
  targetType: string,
  targetId: string,
  meta: Record<string, unknown>,
) {
  const store = c.get("store") as AuthStore;
  await store.addAudit({
    id: randomId(),
    actor_type: "admin",
    actor_id: c.get("email") as string,
    action,
    target_type: targetType,
    target_id: targetId,
    meta: JSON.stringify(meta),
    ip: c.req.header("CF-Connecting-IP") || null,
    created_at: nowIso(),
  });
}

const memoryStores = new WeakMap<object, AuthStore>();

function resolveStore(env: Cloudflare.Env & { TEST_STORE?: AuthStore }): AuthStore {
  if (env.TEST_STORE) return env.TEST_STORE;
  if (env.DB && typeof env.DB.prepare === "function") return createD1Store(env.DB);
  const existing = memoryStores.get(env);
  if (existing) return existing;
  const created = createMemoryStore();
  memoryStores.set(env, created);
  return created;
}

export default {
  fetch: app.fetch,
} satisfies { fetch: typeof app.fetch };


