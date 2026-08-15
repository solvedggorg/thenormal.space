# Passwordless Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete Clerk everywhere and ship passwordless login (passkey or email code/link) on `auth.thenormal.space`, shop as a first-party OIDC client, Medusa verifying our JWTs, JumpCloud admin, and Flagship on site/shop/auth — with local wrangler using remote D1/KV/email so the same person works here and there.

**Architecture:** Auth Worker owns identity (D1 users/passkeys/sessions, KV challenges/rate limits, Email). Email proof creates an `ns_session`. Shop starts OIDC against that session, exchanges the code, then `medusa.auth.login("customer", "normal", { token })`. Admin stays Access + JumpCloud on the same remote D1. Flagship `FLAGS` binding gates user-facing surfaces. No Workflows or Durable Objects in this cut.

**Tech Stack:** Hono, D1, KV, Cloudflare Email, WebAuthn (`@simplewebauthn/server`), existing EdDSA OIDC, Medusa auth module, Flagship Worker binding, bun:test.

**Spec:** `docs/superpowers/specs/2026-08-15-passwordless-auth-design.md`

## Global Constraints

- Passwordless only. No passwords. TOTP schema stays; do not show TOTP on sign-in.
- `/` and `/register` are the same screen.
- Error copy, verbatim: invalid/expired code → `That code is not valid.`; rate limit → `Wait a minute, then try again.`; disabled user → `This account is disabled.`; mail fail → `Could not send mail.`; no account-enumeration split.
- Email challenge TTL 10 minutes. One-time consume. 5 verify attempts then burn. Resend after 30 seconds replaces the row.
- Session cookie name `ns_session`, HttpOnly, Lax, 14 days (`SESSION_TTL_MS` already in `auth/src/session.ts`).
- Shop session is the Medusa token after `normal` login, not a second cookie.
- `rpID` = hostname of `ISSUER` (`auth.thenormal.space`). Passkeys do not work on localhost.
- Clerk is deleted. No dual-run flag. No new `CLERK_*` keys.
- Flagship app `a7890609-0ce2-4894-a9cd-e0adc0712dd9`, binding name `FLAGS`. Defaults: `auth.passwordless` true, `shop.account` true, `site.notify` true. Eval error → default.
- Voice: literal, short. Tokens: `--bg #070707`, `--ink #f2f0ea`, Sora / Figtree / IBM Plex Mono. 44px targets. Honor `prefers-reduced-motion`.
- Tests: `bun test` in `auth/`, `store/`, `store/backend` unit, plus root `bun test`. Wrangler/Vite need real Node (`nix develop`).
- Do not add Workflows or Durable Objects.

## File map

| File | Responsibility |
| --- | --- |
| `auth/migrations/0003_email_code.sql` | `code_hash`, `attempts` on `email_challenges` |
| `auth/migrations/0004_shop_oidc_client.sql` | Seed first-party public client `thenormal-shop` |
| `auth/src/store/types.ts` | `EmailChallenge` fields + store methods |
| `auth/src/store/memory.ts` | In-memory impl |
| `auth/src/store/d1.ts` | D1 impl |
| `auth/src/lib/email-code.ts` | Generate/hash 6-digit code; start/verify helpers |
| `auth/src/lib/mail.ts` | Code + link mail copy |
| `auth/src/routes/email.ts` | `POST /api/email/start`, `POST /api/email/verify` |
| `auth/src/routes/pages.ts` | Passwordless HTML; `/verify`; `/account` enroll |
| `auth/src/routes/api.ts` | Existing passkey routes (mount them) |
| `auth/src/index.ts` | Mount `email` + `api` |
| `auth/src/session.ts` | Drop Clerk; local sessions only |
| `auth/src/clerk.ts` | Delete |
| `auth/src/routes/oauth.ts` | Email-verified AAL1 is enough; drop `source === "clerk"` |
| `auth/wrangler.jsonc` | `remote: true` on D1/KV; `FLAGS` |
| `auth/admin/wrangler.jsonc` | `remote: true` on D1/KV |
| `auth/admin/src/index.ts` | People columns + layout polish |
| `store/backend/src/modules/normal/*` | Medusa provider (replaces clerk) |
| `store/backend/medusa-config.ts` | Wire `normal`, drop clerk |
| `store/src/lib/customer-auth.ts` | `NORMAL_PROVIDER`, our token |
| `store/src/components/AccountApp.tsx` | OIDC PKCE, no Clerk |
| `store/src/pages/account.astro` | Copy + AccountApp props |
| `store/src/pages/account/callback.astro` | OIDC callback |
| `store/wrangler.jsonc` | Drop Clerk vars; `PUBLIC_AUTH_*`; `FLAGS` |
| `src/cloudflare-worker.ts` | Evaluate `site.notify`, then ASSETS |
| `wrangler.jsonc` | Binding name `FLAGS` |
| `scripts/dev-all.ts` | Drop Clerk env; `PUBLIC_AUTH_URL` |
| `auth/README.md` | Passwordless + remote D1 |

Do not add a new UI framework. Do not keep a Clerk compatibility shim.

---

### Task 1: Email challenge can hold a code and be consumed once

**Files:**
- Create: `auth/migrations/0003_email_code.sql`
- Modify: `auth/src/store/types.ts` — `EmailChallenge` and `AuthStore`
- Modify: `auth/src/store/memory.ts`
- Modify: `auth/src/store/d1.ts`
- Test: `auth/test/email-challenge.test.ts`

**Interfaces:**
- Consumes: existing `createEmailChallenge` / `consumeEmailChallenge`
- Produces:
  - `EmailChallenge` adds `code_hash: string` and `attempts: number`
  - `AuthStore.consumeEmailChallengeByCode(codeHash: string, email: string, now: string): Promise<EmailChallenge | null>`
  - `AuthStore.bumpEmailChallengeAttempt(id: string): Promise<number>` — returns new attempt count
  - `AuthStore.deleteOpenEmailChallenges(email: string, purpose: EmailChallenge["purpose"]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { laterIso, nowIso, randomId, sha256Hex } from "../src/lib/crypto";
import { createMemoryStore } from "../src/store/memory";

test("consumes a challenge by code hash once", async () => {
  const store = createMemoryStore();
  const now = nowIso();
  const codeHash = await sha256Hex("123456");
  await store.createEmailChallenge({
    id: randomId(),
    email: "ada@lab.org",
    purpose: "login",
    token_hash: await sha256Hex("link-token"),
    code_hash: codeHash,
    attempts: 0,
    expires_at: laterIso(600_000),
    consumed_at: null,
    created_at: now,
  });
  const first = await store.consumeEmailChallengeByCode(codeHash, "ada@lab.org", now);
  expect(first?.email).toBe("ada@lab.org");
  const second = await store.consumeEmailChallengeByCode(codeHash, "ada@lab.org", now);
  expect(second).toBeNull();
});

test("bumpEmailChallengeAttempt counts", async () => {
  const store = createMemoryStore();
  const id = randomId();
  await store.createEmailChallenge({
    id,
    email: "ada@lab.org",
    purpose: "login",
    token_hash: "t",
    code_hash: "c",
    attempts: 0,
    expires_at: laterIso(600_000),
    consumed_at: null,
    created_at: nowIso(),
  });
  expect(await store.bumpEmailChallengeAttempt(id)).toBe(1);
  expect(await store.bumpEmailChallengeAttempt(id)).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auth && bun test test/email-challenge.test.ts`

Expected: FAIL — `code_hash` / `consumeEmailChallengeByCode` missing.

- [ ] **Step 3: Write minimal implementation**

`auth/migrations/0003_email_code.sql`:

```sql
ALTER TABLE email_challenges ADD COLUMN code_hash TEXT;
ALTER TABLE email_challenges ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_email_challenges_code ON email_challenges(code_hash);
```

Update `EmailChallenge` and both stores. `createEmailChallenge` INSERT must include `code_hash` and `attempts`. `consumeEmailChallengeByCode` matches `code_hash` + `email` COLLATE NOCASE + `consumed_at IS NULL` + not expired, then sets `consumed_at`. `deleteOpenEmailChallenges` deletes unconsumed rows for that email+purpose. Memory store mirrors that.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd auth && bun test test/email-challenge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth/migrations/0003_email_code.sql auth/src/store/types.ts auth/src/store/memory.ts auth/src/store/d1.ts auth/test/email-challenge.test.ts
git commit -m "feat(auth): store hashed email login codes on challenges"
```

---

### Task 2: Start and verify an email login

**Files:**
- Create: `auth/src/lib/email-code.ts`
- Modify: `auth/src/lib/mail.ts`
- Create: `auth/src/routes/email.ts`
- Modify: `auth/src/index.ts` — `app.route("/", email)`
- Modify: `auth/src/session.ts` — drop Clerk; `createSession` after email is `aal: 1`, `amr: ["email"]`
- Leave `auth/src/clerk.ts` in place until Task 3 deletes it.
- Test: `auth/test/email-login.test.ts`
- Modify: `auth/test/env.ts` if `createEmailChallenge` calls need `code_hash`

**Interfaces:**
- Consumes: store methods from Task 1; `sendMail`; `createSession`; `kvRateLimit`
- Produces:
  - `export function randomDigits(length: number): string` — `length` cryptographically random digits
  - `export async function startEmailLogin(env, store, limit, input: { email: string; ip: string; issuer: string }): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 429 | 500 }>`
  - `export async function finishEmailLogin(store, input: { email?: string; code?: string; token?: string; now?: string }): Promise<EmailChallenge | { error: string; status: 400 }>`
  - Routes: `POST /api/email/start` body `{ email }`; `POST /api/email/verify` body `{ email, code }` or `{ token }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { createTestEnv } from "./env";

const origin = "https://auth.thenormal.space";

describe("email login", () => {
  test("start sends a 6-digit code and a link", async () => {
    const { env, sent } = await createTestEnv();
    const res = await app.request(`${origin}/api/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org" }),
    }, env);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].text || "").toMatch(/\b\d{6}\b/);
    expect(sent[0].text || "").toContain("/verify?token=");
  });

  test("verify with the code sets ns_session", async () => {
    const { env, sent } = await createTestEnv();
    await app.request(`${origin}/api/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org" }),
    }, env);
    const code = (sent[0].text || "").match(/\b(\d{6})\b/)?.[1];
    const res = await app.request(`${origin}/api/email/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org", code }),
    }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") || "").toContain("ns_session=");
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("wrong code says That code is not valid.", async () => {
    const { env } = await createTestEnv();
    await app.request(`${origin}/api/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org" }),
    }, env);
    const res = await app.request(`${origin}/api/email/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org", code: "000000" }),
    }, env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That code is not valid." });
  });

  test("sixth wrong attempt burns the challenge", async () => {
    const { env } = await createTestEnv();
    await app.request(`${origin}/api/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org" }),
    }, env);
    for (let i = 0; i < 6; i++) {
      await app.request(`${origin}/api/email/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ada@lab.org", code: "000000" }),
      }, env);
    }
    const res = await app.request(`${origin}/api/email/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@lab.org", code: "000000" }),
    }, env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That code is not valid." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auth && bun test test/email-login.test.ts`

Expected: FAIL — `/api/email/start` is 404.

- [ ] **Step 3: Write minimal implementation**

`randomDigits(6)`: draw from `crypto.getRandomValues` modulo 10 (rejection sampling so it is uniform).

`startEmailLogin`:
1. `normalizeEmail` + `isEmail` else `{ error: "That address is not valid.", status: 400 }` (start may use this; do not reveal whether the user exists).
2. `limit.take(\`email:start:${ip}\`, 5, 60)` and `limit.take(\`email:start:${email}\`, 3, 60)` else `{ error: "Wait a minute, then try again.", status: 429 }`.
3. `deleteOpenEmailChallenges(email, "login")`.
4. `code = randomDigits(6)`, `token = randomToken(32)`.
5. Insert challenge: `purpose: "login"`, hashes, `expires_at: laterIso(10 * 60_000)`, `attempts: 0`.
6. `sendMail` with subject `Your sign-in code`, text containing the code and `${issuer}/verify?token=${token}`. On throw: `{ error: "Could not send mail.", status: 500 }`.

`finishEmailLogin`:
- If `token`: `consumeEmailChallenge(sha256Hex(token), now)`.
- If `email`+`code`: look up open challenge for email (add `getOpenEmailChallenge(email, purpose)` if needed), `bumpEmailChallengeAttempt`; if attempts > 5, consume/burn and return invalid; else `consumeEmailChallengeByCode`.
- Missing/expired/mismatch → `{ error: "That code is not valid.", status: 400 }`.

Route handlers call those helpers, then upsert user by email (`status: "active"`, `email_verified_at` now, **do not write `clerk_user_id`**), reject `disabled` with `This account is disabled.`, `createSession(..., 1, ["email"])`.

Mount: `app.route("/", email)` in `index.ts`.

Update `session.ts` `readIdentity` to **only** read `ns_session` (remove `readClerkIdentity`). Keep `auth/src/clerk.ts` on disk until Task 3 so `pages.ts` still compiles.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd auth && bun test test/email-login.test.ts test/email-challenge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth/src/lib/email-code.ts auth/src/lib/mail.ts auth/src/routes/email.ts auth/src/index.ts auth/src/session.ts auth/test/email-login.test.ts auth/test/env.ts
git commit -m "feat(auth): email code and magic-link login"
```

---

### Task 3: Passwordless pages replace Clerk UI

**Files:**
- Modify: `auth/src/routes/pages.ts`
- Delete: `auth/src/clerk.ts`
- Modify: `auth/test/totp-email.test.ts` — stop expecting Clerk copy
- Modify: `auth/test/discovery.test.ts` — `idp` is `passwordless`

**Interfaces:**
- Consumes: `/api/email/start`, `/api/email/verify`, `/api/passkey/login/*` (may 404 until Task 4 — page JS must tolerate)
- Produces: `GET /` and `GET /register` same HTML; `GET /verify?token=`; `GET /account` enroll card; `GET /health` `{ ok: true, idp: "passwordless" }`

- [ ] **Step 1: Write the failing test**

In `auth/test/totp-email.test.ts` replace Clerk assertions:

```ts
test("sign-in is passwordless", async () => {
  const { env } = await createTestEnv();
  const res = await app.request("https://auth.thenormal.space/", {}, env);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('name="email"');
  expect(html).not.toContain("Clerk");
  expect(html).toContain("/api/email/start");
});

test("register is the same screen", async () => {
  const { env } = await createTestEnv();
  const a = await (await app.request("https://auth.thenormal.space/", {}, env)).text();
  const b = await (await app.request("https://auth.thenormal.space/register", {}, env)).text();
  expect(a).toContain('name="email"');
  expect(b).toContain('name="email"');
});

test("GET /verify?token= signs in", async () => {
  const { env, sent } = await createTestEnv();
  await app.request("https://auth.thenormal.space/api/email/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ada@lab.org" }),
  }, env);
  const token = (sent[0].text || "").match(/token=([A-Za-z0-9_-]+)/)?.[1];
  const res = await app.request(`https://auth.thenormal.space/verify?token=${token}`, {}, env);
  expect(res.status).toBe(302);
  expect(res.headers.get("set-cookie") || "").toContain("ns_session=");
});
```

`discovery.test.ts`: expect `{ ok: true, idp: "passwordless" }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auth && bun test test/totp-email.test.ts test/discovery.test.ts`

Expected: FAIL — pages still say Clerk.

- [ ] **Step 3: Write minimal implementation**

Replace `clerkPage` with one card:

- `<input id="email" name="email" type="email" autocomplete="username webauthn" />`
- Primary button “Email me a code”
- Hidden `#code` step (six inputs or one `inputmode="numeric"` maxlength 6)
- Inline script: `POST /api/email/start` then show code field; `POST /api/email/verify`; on ok `location = next || "/account"`
- Conditional WebAuthn: if `PublicKeyCredential.isConditionalMediationAvailable`, `GET`/`POST` passkey login endpoints (no-op if 404)
- `GET /verify`: call `finishEmailLogin` with token, set cookie, redirect `safeNext(next)` or `/account`
- `GET /account`: if no session → `/`. If no passkeys and no `wa:skip:{id}` → enroll card (POST skip sets KV 30 days). Else “Signed in as {email}” + sign out
- If `FLAGS` exists and `await env.FLAGS.getBooleanValue("auth.passwordless", true, { surface: "auth" }) === false`, render “Sign-in is down.” (binding may be missing in tests — treat as on)
- Delete `auth/src/clerk.ts`. Remove every import of it.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd auth && bun test`

Expected: PASS (update any leftover Clerk tests in this step)

- [ ] **Step 5: Commit**

```bash
git add auth/src/routes/pages.ts auth/src/clerk.ts auth/test
git commit -m "feat(auth): passwordless sign-in pages, remove Clerk UI"
```

---

### Task 4: Passkeys work and OIDC accepts email login

**Files:**
- Modify: `auth/src/index.ts` — `import { api } from "./routes/api"; app.route("/", api);`
- Modify: `auth/src/routes/oauth.ts` — remove `session.source !== "clerk"` MFA gate; require `email_verified_at` only
- Modify: `auth/src/session.ts` — `Identity.source` is `"local"` only (or delete `source`)
- Test: `auth/test/oauth.test.ts` (extend)

**Interfaces:**
- Consumes: email session from Task 2 (`aal: 1`, `amr: ["email"]`)
- Produces: first-party shop client can finish `/oauth/authorize` after email login without a passkey

- [ ] **Step 1: Write the failing test**

```ts
test("first-party authorize succeeds after email login without a passkey", async () => {
  const { env, store, sent } = await createTestEnv();
  await seedClient(store, "public");
  await app.request("https://auth.thenormal.space/api/email/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ada@lab.org" }),
  }, env);
  const code = (sent[0].text || "").match(/\b(\d{6})\b/)?.[1];
  const login = await app.request("https://auth.thenormal.space/api/email/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ada@lab.org", code }),
  }, env);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const res = await app.request(
    "https://auth.thenormal.space/oauth/authorize?client_id=shop&redirect_uri=https://shop.thenormal.space/cb&response_type=code&scope=openid%20email&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=S256",
    { headers: { cookie } },
    env,
  );
  expect(res.status).toBe(302);
  expect(res.headers.get("location") || "").toContain("code=");
  expect(res.headers.get("location") || "").not.toContain("interaction_required");
});
```

Reuse `pkce()` already in `auth/test/oauth.test.ts` (`verifier = "a".repeat(64)`, `challenge = toBase64Url(await sha256Bytes(verifier))`). Set `code_challenge` to that `challenge` and `code_challenge_method` to `S256`. `seedClient` uses `client_id: "shop"` and redirect `https://shop.thenormal.space/cb`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auth && bun test test/oauth.test.ts`

Expected: FAIL — redirect to `/?next=` or `interaction_required` because AAL < 2.

- [ ] **Step 3: Write minimal implementation**

In `oauth.ts` GET `/oauth/authorize`, replace the block that special-cases Clerk and requires `aal < 2 || !userHasMfa` with:

```ts
if (!session.user.email_verified_at) {
  return c.redirect(`/?next=${encodeURIComponent(next)}`, 302);
}
```

Mount passkey `api` in `index.ts`. Keep `userHasMfa` for enroll UI only.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd auth && bun test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth/src/index.ts auth/src/routes/oauth.ts auth/src/session.ts auth/test/oauth.test.ts
git commit -m "feat(auth): accept email-verified sessions for first-party OIDC"
```

---

### Task 5: Seed the shop OIDC client and point wrangler at remote D1/KV

**Files:**
- Create: `auth/migrations/0004_shop_oidc_client.sql`
- Modify: `auth/wrangler.jsonc`
- Modify: `auth/admin/wrangler.jsonc`
- Modify: `auth/README.md`

**Interfaces:**
- Consumes: `oauth_clients` table
- Produces: client_id `thenormal-shop`, `first_party = 1`, public PKCE, redirects `https://shop.thenormal.space/account/callback` and `http://localhost:4322/account/callback`

- [ ] **Step 1: Write the migration**

```sql
INSERT INTO oauth_clients (
  id, client_id, client_secret_hash, name, type, redirect_uris, grant_types, scopes,
  first_party, token_endpoint_auth_method, created_at, updated_at
) VALUES (
  'client-thenormal-shop',
  'thenormal-shop',
  NULL,
  'Shop',
  'public',
  '["https://shop.thenormal.space/account/callback","http://localhost:4322/account/callback"]',
  '["authorization_code","refresh_token"]',
  '["openid","profile","email"]',
  1,
  'none',
  datetime('now'),
  datetime('now')
);
```

If a unique conflict on `client_id` is possible on re-apply, use `INSERT OR IGNORE`.

- [ ] **Step 2: Set remote bindings**

In both auth wrangler files, on the existing D1 and KV entries, add `"remote": true`. Do not change IDs.

Add to `auth/wrangler.jsonc`:

```jsonc
"flagship": [
  {
    "binding": "FLAGS",
    "app_id": "a7890609-0ce2-4894-a9cd-e0adc0712dd9",
    "remote": true
  }
]
```

- [ ] **Step 3: Document local remote**

README: passwordless; `wrangler d1 migrations apply thenormal-auth --remote`; local dev uses remote D1/KV; passkeys only on `auth.thenormal.space`; email codes work on localhost.

- [ ] **Step 4: Apply remote migration** (needs Cloudflare auth)

Run: `cd auth && npx wrangler d1 migrations apply thenormal-auth --remote`

Expected: 0003 and 0004 applied (or already applied). If the operator is offline, leave the files committed and note it.

- [ ] **Step 5: Commit**

```bash
git add auth/migrations/0004_shop_oidc_client.sql auth/wrangler.jsonc auth/admin/wrangler.jsonc auth/README.md
git commit -m "feat(auth): remote D1/KV and seed shop OIDC client"
```

---

### Task 6: Admin people list is usable; JumpCloud path stays

**Files:**
- Modify: `auth/admin/src/index.ts` — `/users` table columns
- Modify: `auth/src/lib/html.ts` — `adminLayout` if list pages are still centered too tight
- Test: `auth/test/admin-access.test.ts` — existing tests must still pass; add people-list assertion

**Interfaces:**
- Consumes: `listUsers`, `listPasskeys`
- Produces: same routes; people table shows email, status, last login, passkey count

- [ ] **Step 1: Write the failing test**

```ts
test("people list shows last login column", async () => {
  const { env, store } = await createTestEnv({ allowDevAccess: true });
  await seedUser(store);
  const res = await app.request("https://admin2.thenormal.space/users", {}, env);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("Last login");
  expect(html).toContain("ada@lab.org");
});
```

Import `app` from `../admin/src/index`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auth && bun test test/admin-access.test.ts`

Expected: FAIL — “Last login” missing.

- [ ] **Step 3: Write minimal implementation**

On `/users`, for each user load passkey count (batch if easy, else N+1 is fine for 50). Columns: Email, Status, Passkeys, Last login (date or “—”). Keep invite / disable / revoke. Do not change Access or JumpCloud logic. JumpCloud local redirect is an operator step: add `http://localhost:8789/oidc/callback` in the JumpCloud app (document in README, do not encode a secret).

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd auth && bun test test/admin-access.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth/admin/src/index.ts auth/src/lib/html.ts auth/test/admin-access.test.ts auth/README.md
git commit -m "feat(auth-admin): people list last login and passkeys"
```

---

### Task 7: Medusa `normal` provider verifies our access token

**Files:**
- Create: `store/backend/src/modules/normal/index.ts`
- Create: `store/backend/src/modules/normal/service.ts`
- Create: `store/backend/src/modules/normal/session.ts`
- Create: `store/backend/src/modules/normal/__tests__/session.unit.spec.ts`
- Modify: `store/backend/medusa-config.ts`
- Modify: `store/backend/worker/env.ts` — replace Clerk keys with `AUTH_ISSUER`
- Modify: `store/backend/.env.example`
- Modify: `store/backend/wrangler.jsonc` vars — `AUTH_ISSUER=https://auth.thenormal.space`; delete `CLERK_*`

**Interfaces:**
- Consumes: auth JWKS at `${AUTH_ISSUER}/oauth/jwks` (also `/.well-known` discovery jwks_uri)
- Produces:
  - `export function tokenFromInput(data: AuthenticationInput): string`
  - `export async function verifyNormalAccessToken(token: string, options: { issuer: string; audience?: string }): Promise<JWTPayload>`
  - Provider id `"normal"`
  - `profileFromClaims(claims)` → `{ entityId: sub, email, name }`

- [ ] **Step 1: Write the failing test**

Copy the structure of `store/backend/src/modules/clerk/__tests__/session.unit.spec.ts`. Sign an EdDSA JWT with a generated key, mock JWKS fetch or pass a local key. Assert `verifyNormalAccessToken` returns `sub` and `email`. Assert garbage token throws. Assert `tokenFromInput` reads `body.token`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd store/backend && npm run test:unit -- src/modules/normal/__tests__/session.unit.spec.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

`verifyNormalAccessToken`: `createRemoteJWKSet(new URL(issuer + "/oauth/jwks"))`, `jwtVerify` with `issuer`. Audience optional (`thenormal-shop` if present).

`NormalAuthService` same shape as Clerk service: `authenticate` / `register` / `validateCallback` all verify the token and `upsertAuthIdentity` with `entity_id = sub`.

`medusa-config.ts`: `normalReady` when `AUTH_ISSUER` or default `https://auth.thenormal.space`. Customer methods `["normal"]` when ready, else `["emailpass"]`. Remove the clerk provider block.

Delete the clerk module files in Task 9 (keep them until shop uses `normal` so the shop can land in Task 8).

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd store/backend && npm run test:unit -- src/modules/normal/__tests__/session.unit.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add store/backend/src/modules/normal store/backend/medusa-config.ts store/backend/worker/env.ts store/backend/.env.example store/backend/wrangler.jsonc
git commit -m "feat(shop-backend): Medusa normal provider for auth JWTs"
```

---

### Task 8: Shop account uses OIDC, not Clerk

**Files:**
- Modify: `store/src/lib/customer-auth.ts`
- Create: `store/src/lib/oidc.ts` — PKCE helpers
- Modify: `store/src/components/AccountApp.tsx`
- Modify: `store/src/pages/account.astro`
- Create: `store/src/pages/account/callback.astro`
- Modify: `store/wrangler.jsonc` — `PUBLIC_AUTH_URL`, `PUBLIC_AUTH_CLIENT_ID=thenormal-shop`; delete `PUBLIC_CLERK_*`
- Modify: `store/.dev.vars.example`
- Modify: `store/src/styles/global.css` — rename `.clerk-box` to `.account-box`
- Test: `store/src/lib/customer-auth.ts` tests in `store/src/lib/customer-auth.test.ts`

**Interfaces:**
- Consumes: `NORMAL_PROVIDER = "normal"`; `syncMedusaCustomer(accessToken)`
- Produces:
  - `export const NORMAL_PROVIDER = "normal"`
  - `export function authAuthorizeUrl(input: { authUrl: string; clientId: string; redirectUri: string; challenge: string; state: string }): string`
  - Account signed-out: “Sign in” → authorize URL
  - Callback: exchange code + verifier at `${authUrl}/oauth/token`, then `syncMedusaCustomer(access_token)`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { NORMAL_PROVIDER, authAuthorizeUrl } from "./oidc";

test("authorize URL is our IdP", () => {
  const url = authAuthorizeUrl({
    authUrl: "https://auth.thenormal.space",
    clientId: "thenormal-shop",
    redirectUri: "https://shop.thenormal.space/account/callback",
    challenge: "abc",
    state: "st",
  });
  expect(url).toContain("https://auth.thenormal.space/oauth/authorize");
  expect(url).toContain("client_id=thenormal-shop");
  expect(url).toContain("code_challenge=abc");
  expect(NORMAL_PROVIDER).toBe("normal");
});
```

Put `authAuthorizeUrl` and `NORMAL_PROVIDER` in `store/src/lib/oidc.ts`. `customer-auth.ts` imports `NORMAL_PROVIDER` and uses it in `medusa.auth.login`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd store && bun test src/lib/oidc.test.ts`

Expected: FAIL — file missing.

- [ ] **Step 3: Write minimal implementation**

PKCE: `crypto.subtle` SHA-256 of verifier, base64url. Store `verifier` + `state` in `sessionStorage` before redirect.

`account.astro`: `prerender = false`. Copy: “Your shop login.” / “Sign in with The Normal Space.” No Clerk. Pass `authUrl` and `clientId` from `PUBLIC_AUTH_URL` (default `https://auth.thenormal.space`) and `PUBLIC_AUTH_CLIENT_ID` (default `thenormal-shop`). If `FLAGS` / `shop.account` is false, show “Account is down.”

`AccountApp`: if no Medusa session, primary button starts OIDC. If signed in, show email + sign out (`clearMedusaSession` + GET auth `/sign-out` is optional; shop sign-out is enough for v1).

`callback.astro`: client script reads `code` and `state`, POSTs to `${authUrl}/oauth/token` (`grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`). Then `syncMedusaCustomer(access_token)`. Errors: `?error=` → “Access was denied.”

`syncMedusaCustomer` errors: “Sign-in did not return a shop session.” / “This account has no email.”

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd store && bun test src`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add store/src store/wrangler.jsonc store/.dev.vars.example
git commit -m "feat(shop): OIDC account flow, drop Clerk components"
```

---

### Task 9: Delete Clerk from the repo

**Files:**
- Delete: `store/backend/src/modules/clerk/**`
- Modify: `store/package.json` — remove `@clerk/clerk-react` (and any other `@clerk/*`)
- Modify: `auth/package.json` — remove `@clerk/backend` if unused
- Modify: `scripts/dev-all.ts` — drop `CLERK_*`
- Modify: `.env.example`, `auth/.dev.vars.example`, `store/backend/.env.example`
- Modify: `auth/README.md`, `README.md` — no Clerk
- Test: `scripts/check-no-clerk.test.ts` or extend `scripts` tests

**Interfaces:**
- Consumes: Tasks 3, 7, 8
- Produces: `rg` over first-party code finds no Clerk runtime deps

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("first-party package.json files do not depend on Clerk", () => {
  for (const path of ["package.json", "auth/package.json", "store/package.json", "store/backend/package.json"]) {
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
    expect(names.filter((n) => n.startsWith("@clerk/"))).toEqual([]);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/check-no-clerk.test.ts`

Expected: FAIL if Clerk deps still listed.

- [ ] **Step 3: Write minimal implementation**

Delete clerk module. Remove deps (`bun remove` / `npm uninstall` in the right package). Grep `CLERK_` and `clerk.thenormal.space` in `*.ts`, `*.tsx`, `*.astro`, `*.jsonc`, `*.example`, `*.md` under first-party trees (`auth`, `store`, `src`, `scripts`, root). Replace copy. Leave `links/` alone. Keep `clerk_user_id` column; stop writing it (already Task 2).

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun test scripts/check-no-clerk.test.ts && cd auth && bun test && cd ../store && bun test src`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Clerk from first-party packages"
```

---

### Task 10: Flagship on site, shop, and auth

**Files:**
- Modify: `wrangler.jsonc` — binding name `FLAGS` (same `app_id`)
- Modify: `src/cloudflare-worker.ts`
- Modify: `store/wrangler.jsonc` — `FLAGS`
- Modify: `auth/wrangler.jsonc` — already in Task 5
- Create: `src/flags.ts` — `export async function flagOn(env: { FLAGS?: Flagship }, key: string, fallback: boolean, ctx?: Record<string, string>): Promise<boolean>`
- Test: `src/flags.test.ts` with a fake FLAGS object
- Modify: site notify/contact islands or pages to read a boolean passed from the worker or `import.meta.env` — **site is static**; the Worker must inject or the Astro pages read `FLAGS` only if SSR. Spec: Worker evaluates `site.notify`. For the static notify form, pass a cookie or header the island checks, **or** evaluate in the Worker and rewrite. Simplest: `cloudflare-worker.ts` if path is `/` or `/contact` and flag is false, serve a 200 HTML stub “Notify is down.” That is too blunt. Better: set `document.cookie` no — spec says evaluate then `ASSETS.fetch`. Pass `x-flag-site-notify: 0|1` header to HTML and a tiny inline script in `NotifyForm` already using `PUBLIC_*`. **Locked choice:** Worker sets response header on HTML; NotifyForm already fails closed if `PUBLIC_API_URL` is empty. For `site.notify=false`, Worker strips nothing — instead set `env` via HTMLRewriter on `meta name="site-notify"`. Even simpler: **NotifyForm checks `import.meta.env.PUBLIC_NOTIFY`**, and `dev-all` / wrangler `vars` default true; Flagship is evaluated in the Worker and if false, HTMLRewriter sets `<html data-notify="off">` and the form hides.

Locked: `src/cloudflare-worker.ts` fetches ASSETS, if `content-type` is HTML, HTMLRewriter sets `data-notify` from Flagship. `NotifyForm` hides when `document.documentElement.dataset.notify === "off"`.

**Interfaces:**
- Consumes: `env.FLAGS.getBooleanValue`
- Produces: `flagOn`; three keys live in the Flagship app (create via `wrangler flagship flags create` if missing)

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { flagOn } from "./flags";

test("missing FLAGS uses the default", async () => {
  expect(await flagOn({}, "site.notify", true)).toBe(true);
  expect(await flagOn({}, "site.notify", false)).toBe(false);
});

test("binding value wins", async () => {
  const FLAGS = {
    async getBooleanValue(key: string, fallback: boolean) {
      return key === "site.notify" ? false : fallback;
    },
  };
  expect(await flagOn({ FLAGS }, "site.notify", true)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/flags.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

`flagOn`: if `!env.FLAGS?.getBooleanValue` return fallback; try/catch return fallback.

Worker:

```ts
import { flagOn } from "./flags";

export default {
  async fetch(request: Request, env: { ASSETS: Fetcher; FLAGS?: { getBooleanValue: Function } }) {
    const notify = await flagOn(env, "site.notify", true, { surface: "site" });
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return res;
    return new HTMLRewriter()
      .on("html", { element(el) { el.setAttribute("data-notify", notify ? "on" : "off"); } })
      .transform(res);
  },
};
```

NotifyForm: if `document.documentElement.dataset.notify === "off"`, show “The list is not live yet…” and do not POST.

Create flags (operator):

```bash
npx wrangler flagship flags create a7890609-0ce2-4894-a9cd-e0adc0712dd9 auth.passwordless
npx wrangler flagship flags create a7890609-0ce2-4894-a9cd-e0adc0712dd9 shop.account
npx wrangler flagship flags create a7890609-0ce2-4894-a9cd-e0adc0712dd9 site.notify
```

Then enable / set default on. If CLI is unavailable, create them in the dashboard.

Shop: in `account.astro` if you can access `env.FLAGS` via Astro locals, hide account; else default on.

Auth pages already check `auth.passwordless` in Task 3.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun test src/flags.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/flags.ts src/flags.test.ts src/cloudflare-worker.ts wrangler.jsonc store/wrangler.jsonc src/components/react/NotifyForm.tsx
git commit -m "feat: Flagship FLAGS on site, shop, and auth"
```

---

### Task 11: dev-all talks to the new auth map

**Files:**
- Modify: `scripts/dev-all.ts`
- Modify: `scripts/dev-all.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `PUBLIC_AUTH_URL`, `PUBLIC_AUTH_CLIENT_ID`
- Produces: shared env without `CLERK_*`; shop `.dev.vars` gets `PUBLIC_AUTH_URL=http://localhost:8788` and `PUBLIC_AUTH_CLIENT_ID=thenormal-shop`

- [ ] **Step 1: Write the failing test**

In `scripts/dev-all.test.ts`:

```ts
test("shared env has auth URL and no Clerk keys", () => {
  const env = sharedEnv();
  expect(env.PUBLIC_AUTH_URL).toBe("http://localhost:8788");
  expect(env.PUBLIC_AUTH_CLIENT_ID).toBe("thenormal-shop");
  expect(env.CLERK_AUTHORIZED_PARTIES).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/dev-all.test.ts`

Expected: FAIL — `PUBLIC_AUTH_URL` missing.

- [ ] **Step 3: Write minimal implementation**

Add those keys to `sharedEnv`. Remove `CLERK_AUTHORIZED_PARTIES`. Upsert them on `store/.dev.vars`. README: `bun run dev:all` uses remote auth D1; JumpCloud local redirect must be registered; passkeys on localhost will not match prod.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun test scripts/dev-all.test.ts && bun test scripts/check-no-clerk.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-all.ts scripts/dev-all.test.ts README.md
git commit -m "feat: point dev-all at passwordless auth URLs"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Email code + magic link + consume-once + 5 attempts | 1, 2 |
| One sign-in screen | 3 |
| Passkey conditional + enroll | 3, 4 |
| Local sessions only, no Clerk | 2, 3, 9 |
| OIDC shop, email AAL enough | 4, 5, 8 |
| Medusa `normal` | 7 |
| Remote D1/KV | 5 |
| Admin people + JC unchanged | 6 |
| Flagship three keys | 3, 8, 10 |
| Clerk deleted | 9 |
| dev-all | 11 |
| No Workflows / DOs | (none added) |

## Operator steps not in git

1. JumpCloud app: add `http://localhost:8789/oidc/callback`.
2. `wrangler d1 migrations apply thenormal-auth --remote` from `auth/`.
3. Create/enable the three Flagship flags if CLI/dashboard was skipped.
4. Deploy `thenormal-auth` then `thenormal-auth-admin` then shop/site.
5. Remove Clerk instance and `clerk.thenormal.space` DNS when traffic is gone (not blocking code).
