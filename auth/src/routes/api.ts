import { Hono } from "hono";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { AppEnv } from "../app-env";
import { nowIso, randomId, sha256Hex } from "../lib/crypto";
import { decodeTotpSecret, encodeTotpSecret, generateTotpSecret, totpOtpauth, verifyTotp } from "../lib/totp";
import { layout } from "../lib/html";
import { escapeHtml, logJson, readLimitedJson } from "../lib/security";
import { issuerOf, safeNext } from "../oauth";
import { createSession, readSession } from "../session";
import {
  authenticationOptions,
  encodePublicKey,
  registrationOptions,
  rpFromIssuer,
  verifyAuthentication,
  verifyRegistration,
} from "../webauthn";

export const api = new Hono<AppEnv>();

api.post("/api/passkey/register/options", async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Sign in first." }, 401);
  const { rpID } = rpFromIssuer(issuerOf(c.env, c.req.url));
  const existing = await c.get("store").listPasskeys(session.user.id);
  const options = await registrationOptions({
    rpName: c.env.RP_NAME || "The Normal Space",
    rpID,
    userId: session.user.id,
    email: session.user.email,
    existing,
  });
  await c.env.KV.put(`wa:reg:${session.user.id}`, options.challenge, { expirationTtl: 300 });
  return c.json(options);
});

api.post("/api/passkey/register/verify", async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Sign in first." }, 401);
  const body = (await readLimitedJson(c.req.raw, 32_768)) as RegistrationResponseJSON | null;
  const challenge = await c.env.KV.get(`wa:reg:${session.user.id}`);
  if (!body || !challenge) return c.json({ error: "Start again." }, 400);
  const { rpID, origin } = rpFromIssuer(issuerOf(c.env, c.req.url));
  let verified;
  try {
    verified = await verifyRegistration({ response: body, challenge, origin, rpID });
  } catch (error) {
    logJson("error", { event: "passkey.register.fail", message: error instanceof Error ? error.message : "verify" });
    return c.json({ error: "Could not verify this passkey." }, 400);
  }
  if (!verified.verified || !verified.registrationInfo) return c.json({ error: "Could not verify this passkey." }, 400);
  const info = verified.registrationInfo;
  const now = nowIso();
  await c.get("store").createPasskey({
    id: randomId(),
    user_id: session.user.id,
    credential_id: info.credential.id,
    public_key: encodePublicKey(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ? JSON.stringify(info.credential.transports) : null,
    aaguid: info.aaguid || null,
    name: "Passkey",
    created_at: now,
    last_used_at: now,
  });
  await c.env.KV.delete(`wa:reg:${session.user.id}`);
  await c.get("store").updateSession(session.session.id, { aal: 2, amr: JSON.stringify(["pop"]) });
  await c.get("store").addAudit({
    id: randomId(),
    actor_type: "user",
    actor_id: session.user.id,
    action: "passkey.added",
    target_type: "passkey",
    target_id: info.credential.id,
    meta: null,
    ip: c.req.header("CF-Connecting-IP") || null,
    created_at: now,
  });
  return c.json({ ok: true, next: "/account" });
});

api.post("/api/passkey/login/options", async (c) => {
  const { rpID } = rpFromIssuer(issuerOf(c.env, c.req.url));
  const options = await authenticationOptions({ rpID });
  const key = `wa:auth:${c.req.header("CF-Connecting-IP") || "local"}:${randomId()}`;
  await c.env.KV.put(key, options.challenge, { expirationTtl: 300 });
  await c.env.KV.put(`wa:auth:last:${c.req.header("CF-Connecting-IP") || "local"}`, key, { expirationTtl: 300 });
  return c.json({ ...options, challengeKey: key });
});

api.post("/api/passkey/login/verify", async (c) => {
  const body = (await readLimitedJson(c.req.raw, 32_768)) as (AuthenticationResponseJSON & { challengeKey?: string }) | null;
  if (!body) return c.json({ error: "Start again." }, 400);
  const ip = c.req.header("CF-Connecting-IP") || "local";
  const key = body.challengeKey || (await c.env.KV.get(`wa:auth:last:${ip}`));
  const challenge = key ? await c.env.KV.get(key) : null;
  if (!challenge) return c.json({ error: "Start again." }, 400);
  const passkey = await c.get("store").getPasskeyByCredentialId(body.id);
  if (!passkey) return c.json({ error: "Unknown passkey." }, 400);
  const { rpID, origin } = rpFromIssuer(issuerOf(c.env, c.req.url));
  let verified;
  try {
    verified = await verifyAuthentication({ response: body, challenge, origin, rpID, passkey });
  } catch (error) {
    logJson("error", { event: "passkey.login.fail", message: error instanceof Error ? error.message : "verify" });
    return c.json({ error: "Could not verify this passkey." }, 400);
  }
  if (!verified.verified) return c.json({ error: "Could not verify this passkey." }, 400);
  const user = await c.get("store").getUserById(passkey.user_id);
  if (!user || user.status === "disabled") return c.json({ error: "This account is disabled." }, 403);
  const now = nowIso();
  await c.get("store").updatePasskey(passkey.id, {
    counter: verified.authenticationInfo.newCounter,
    last_used_at: now,
  });
  await c.get("store").updateUser(user.id, { last_login_at: now, updated_at: now, status: "active", email_verified_at: user.email_verified_at || now });
  if (key) await c.env.KV.delete(key);
  await createSession(c, user.id, 2, ["pop"]);
  await c.get("store").addAudit({
    id: randomId(),
    actor_type: "user",
    actor_id: user.id,
    action: "user.passkey_login",
    target_type: "user",
    target_id: user.id,
    meta: null,
    ip: c.req.header("CF-Connecting-IP") || null,
    created_at: now,
  });
  return c.json({ ok: true, next: safeNext(c.req.query("next")) });
});

api.post("/mfa/totp", async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect("/", 302);
  const form = await c.req.parseBody();
  const next = safeNext(typeof form.next === "string" ? form.next : undefined);
  const code = typeof form.code === "string" ? form.code : "";
  const factor = await c.get("store").getTotp(session.user.id);
  if (!factor?.verified_at) return c.redirect(`/mfa?error=totp&next=${encodeURIComponent(next)}`, 302);
  const ok = await verifyTotp(decodeTotpSecret(factor.secret), code);
  if (!ok) {
    const used = await c.get("store").consumeRecoveryCode(session.user.id, await sha256Hex(code.trim().toLowerCase()));
    if (!used) return c.redirect(`/mfa?error=totp&next=${encodeURIComponent(next)}`, 302);
  }
  await c.get("store").updateSession(session.session.id, { aal: 2, amr: JSON.stringify(["otp"]) });
  return c.redirect(next, 302);
});

api.post("/account/totp/start", async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect("/", 302);
  const secret = generateTotpSecret();
  await c.get("store").upsertTotp({
    user_id: session.user.id,
    secret: encodeTotpSecret(secret),
    verified_at: null,
    created_at: nowIso(),
  });
  const uri = totpOtpauth(session.user.email, secret, c.env.RP_NAME || "The Normal Space");
  return c.html(
    layout({
      title: "Authenticator",
      kicker: "Scan",
      body: `
        <h1>Scan this</h1>
        <p>Add it in your authenticator, then type the six digits.</p>
        <div class="card">
          <p class="mono">${escapeHtml(secret)}</p>
          <p class="muted">${escapeHtml(uri)}</p>
          <form method="post" action="/account/totp/confirm">
            <label for="code">Code</label>
            <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required />
            <button class="primary" type="submit">Confirm</button>
          </form>
        </div>
      `,
    }),
  );
});

api.post("/account/totp/confirm", async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect("/", 302);
  const form = await c.req.parseBody();
  const factor = await c.get("store").getTotp(session.user.id);
  if (!factor) return c.redirect("/account/totp", 302);
  const secret = decodeTotpSecret(factor.secret);
  if (!(await verifyTotp(secret, typeof form.code === "string" ? form.code : ""))) {
    return c.redirect("/account/totp?error=totp", 302);
  }
  const now = nowIso();
  await c.get("store").upsertTotp({ ...factor, verified_at: now });
  const codes = Array.from({ length: 10 }, () => randomRecovery());
  await c.get("store").replaceRecoveryCodes(
    session.user.id,
    await Promise.all(codes.map(async (code) => ({ id: randomId(), code_hash: await sha256Hex(code) }))),
  );
  await c.get("store").updateSession(session.session.id, { aal: 2, amr: JSON.stringify(["otp"]) });
  return c.html(
    layout({
      title: "Recovery codes",
      kicker: "Save these",
      body: `
        <h1>Save these codes</h1>
        <p>Each works once if you lose the authenticator.</p>
        <div class="card">
          <p class="mono">${codes.map(escapeHtml).join("<br>")}</p>
          <a class="btn primary" href="/account">Done</a>
        </div>
      `,
    }),
  );
});

api.post("/account/totp/disable", async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect("/", 302);
  const keys = await c.get("store").listPasskeys(session.user.id);
  if (!keys.length) return c.redirect("/account?error=mfa", 302);
  await c.get("store").deleteTotp(session.user.id);
  return c.redirect("/account", 302);
});

function randomRecovery(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}


