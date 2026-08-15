# Passwordless identity — design

Date: 2026-08-15

Status: approved

Replace Clerk everywhere with first-party passwordless login on `auth.thenormal.space`, shop as an OIDC client of that issuer, Medusa verifying our JWTs, JumpCloud on the admin console, and Flagship on user-facing surfaces. Local `wrangler dev` uses the remote auth D1, KV, email, and Flagship so a person created on a laptop is the same person in production.

## Goal

A customer types an email, proves it with a passkey or a one-time code, and is in. The same account works from localhost and from `auth.thenormal.space`. An admin deploys `admin2.thenormal.space`, signs in with JumpCloud (behind Access), and manages people. No `@clerk/*` packages, no `CLERK_*` secrets, no `clerk.thenormal.space` in our apps.

## Decisions

| Decision | Choice |
| --- | --- |
| Factors | Passwordless only. Passkey first when the browser can; otherwise email 6-digit code + magic link (same challenge). No passwords. TOTP stays in the schema, not on the sign-in screen |
| Sign-in vs sign-up | One screen. `/` and `/register` are the same flow |
| Session | HttpOnly cookie `ns_session` on the auth origin; shop gets its own session via first-party OIDC (consent skipped) |
| Shared parent-domain cookie | No. Different localhost ports cannot share it. OIDC is the shop path in local and prod |
| Identity store | Existing `thenormal-auth` D1 + KV. Local wrangler sets `remote: true` on D1, KV, Email, Flagship |
| Passkeys | `rpID` is the ISSUER hostname (`auth.thenormal.space`). They do not work on `localhost`. Email codes do. Local passkey tests use `wrangler dev --remote` or a hosts mapping |
| Clerk | Deleted. No dual-run flag |
| Admin | Cloudflare Access on the hostname, then JumpCloud OIDC (already implemented). Polish + deploy, do not replace JC |
| Workflows | Not in v1. Login is a Worker. Invite can stay a single email send |
| Durable Objects | Not in v1. Serialize counters in D1; rate-limit in KV |
| Flagship | One existing app `a7890609-0ce2-4894-a9cd-e0adc0712dd9`. Binding name `FLAGS` on site, shop, and auth. Evaluate with the Worker binding |

## Out of scope

- Social login, SMS, TOTP on the public sign-in
- Replacing JumpCloud or Access
- Auth Workflows / user Durable Objects
- Marketing waitlist identity (that stays `api/`)
- Migrating historical Clerk user rows beyond: keep `clerk_user_id` nullable, stop writing it, match people by email
- Building a Flagship flag catalog beyond the three keys below

## Architecture

```
browser
  │
  ├─ auth.thenormal.space          thenormal-auth
  │    passkey / email code
  │    D1 users+passkeys+sessions  (remote in local dev)
  │    KV challenges + rate limit  (remote)
  │    EMAIL send                  (remote)
  │    FLAGS                       (remote)
  │    OIDC authorize / token / jwks
  │
  ├─ shop.thenormal.space          thenormal-shop
  │    /account → OIDC (first party, no consent)
  │    shop session cookie
  │    Medusa "normal" provider (our JWT)
  │    FLAGS
  │
  ├─ thenormal.space               thenormal-space
  │    FLAGS for user-facing bits (e.g. notify)
  │
  └─ admin2.thenormal.space        thenormal-auth-admin
       Access JWT, then JumpCloud
       same remote D1 as auth
```

### Login (auth Worker)

1. `GET /` — email field. Start WebAuthn **conditional mediation** so a saved passkey can fill immediately.
2. If no passkey: `POST /api/email/start` creates an `EmailChallenge` (`purpose: login`), stores the hash, emails a 6-digit code and a link `https://auth.thenormal.space/verify?token=…`.
3. `POST /api/email/verify` or `GET /verify?token=` consumes the challenge, upserts the user by email (`status: active`, `email_verified_at` set), creates a local session, sets `ns_session`.
4. If the user has zero passkeys, `/account` shows one enroll card. Skip writes a KV key `wa:skip:{userId}` (30 days). Enroll uses existing `/api/passkey/register/*`.
5. Sign-out: `POST /sign-out` revokes the session and clears the cookie.

Error copy is short and literal. Invalid/expired code: “That code is not valid.” Rate limit: “Wait a minute, then try again.” No “account not found” vs “wrong code” split.

Turnstile stays available if `TURNSTILE_SITE_KEY` is set; required on email start when configured.

### Email challenge

Reuse `EmailChallenge`. Add `code_hash` (SHA-256 of the six-digit code). The existing `token_hash` is the magic-link secret. One row, two proofs. TTL 10 minutes. One-time consume. Max 5 verify attempts then burn. Resend after 30 seconds replaces that row (new code + new token).

### Shop

- Register a first-party public OIDC client (PKCE, `offline_access` optional, consent skipped). Redirects: `https://shop.thenormal.space/account/callback` and `http://localhost:4322/account/callback`.
- `/account` signed-out: button that starts OIDC (`/oauth/authorize`).
- `/account/callback`: exchange the code at `/oauth/token`, then `medusa.auth.login("customer", "normal", { token: access_token })`. The shop session is the Medusa token, same as today, not a second cookie.
- Replace `store/backend/src/modules/clerk` with `store/backend/src/modules/normal`: verify that access token against auth JWKS (`ISSUER` = `https://auth.thenormal.space`). Map email + `sub` to a Medusa customer.
- Delete `@clerk/clerk-react`, `@clerk/backend`, every `CLERK_*` / `PUBLIC_CLERK_*` key, and copy that mentions Clerk.

### Admin

Keep Access → JumpCloud. After deploy:

- Prod JumpCloud redirect remains `https://admin2.thenormal.space/oidc/callback`.
- Add `http://localhost:8789/oidc/callback` on the JumpCloud app so `bun run dev:all` can JC-login.
- Local UI work without JC still uses `ALLOW_DEV_ACCESS`.
- People list: email, status, last login, passkey count. Detail: disable, revoke sessions/tokens/passkeys, invite (existing email).
- Widen `adminLayout` so tables are usable (already uses `.top`; drop leftover “centered login” feel on list pages).

### Local + remote

In `auth/wrangler.jsonc` and `auth/admin/wrangler.jsonc`:

```jsonc
"d1_databases": [{ "binding": "DB", "database_id": "…", "remote": true, "migrations_dir": "migrations" }]
"kv_namespaces": [{ "binding": "KV", "id": "…", "remote": true }]
```

Email and Flagship stay remote (they already are / have no local store).

`scripts/dev-all.ts` starts auth on `:8788` and admin on `:8789` with that config. Drop `CLERK_*` and `CLERK_AUTHORIZED_PARTIES` from the shared env. Point shop `PUBLIC_*` at local auth/shop URLs; OIDC still hits the same remote user table.

### Flagship

Reuse app `a7890609-0ce2-4894-a9cd-e0adc0712dd9`. Binding:

```jsonc
"flagship": [{ "binding": "FLAGS", "app_id": "a7890609-0ce2-4894-a9cd-e0adc0712dd9", "remote": true }]
```

on `thenormal-space`, `thenormal-shop`, `thenormal-auth`. Evaluate `env.FLAGS.getBooleanValue(key, default, { userId, email, surface })`. Site Worker is no longer a no-op passthrough when a flag is needed: it evaluates, then `ASSETS.fetch`.

| Key | Default after cutover | Surfaces | Meaning |
| --- | --- | --- | --- |
| `auth.passwordless` | `true` | auth | Serve passwordless login (off = “sign-in is down”) |
| `shop.account` | `true` | shop | Account / sign-in entry |
| `site.notify` | `true` | site | Notify / waitlist form |

Missing binding or eval error → use the default. Do not use flags to keep Clerk around.

### Errors and abuse

- KV rate limit per IP + per email on start/verify (existing limiter).
- Disabled user: “This account is disabled.” after a successful proof, no session.
- Email send failure: “Could not send mail.” Do not create a session.
- OIDC errors: redirect to shop `/account?error=denied` with a one-line notice.

### Tests

- Auth: start/verify code, magic link, consume-once, expiry, lockout, passkey register/assert (issuer origin), session cookie, sign-out.
- OIDC: shop client authorize → token → JWKS verify; first-party skips consent.
- Admin: Access 403 without JWT; JC required when configured; invite/disable/revoke against the store.
- Shop: no `@clerk` import; account signed-out/in; Medusa `normal` provider accepts our JWT, rejects garbage.
- Flagship: missing binding uses default; `auth.passwordless=false` shows down state.
- Grep gate: no `CLERK_` in first-party wrangler/env/examples except a one-line “removed” note in README if needed.

### UX bar

Auth screens stay on the existing dark type (Sora / Figtree / Plex Mono). One field, one primary action, 44px targets, no spinner that lies. Prefers-reduced-motion honored. Success is the next page, not a toast essay.

## Cutover

1. Passwordless APIs + pages on auth; flip tests off Clerk.
2. Remote D1/KV on auth + admin; deploy both; JC login on `admin2`.
3. Shop OIDC client + Medusa `normal` provider; delete Clerk module and deps.
4. Flagship bindings + three flags.
5. `dev-all` and env examples lose Clerk.

## Files (expected)

| Area | Touch |
| --- | --- |
| `auth/src/routes/pages.ts` | Replace Clerk mount with passwordless UI |
| `auth/src/routes/api.ts` | Email start/verify; keep passkey routes |
| `auth/src/clerk.ts` | Delete |
| `auth/src/session.ts` | Local sessions only |
| `auth/wrangler.jsonc` | `remote: true`, `FLAGS` |
| `auth/admin/src/index.ts` | Layout/people polish |
| `auth/admin/wrangler.jsonc` | `remote: true` |
| `store/src/components/AccountApp.tsx` | OIDC account, no Clerk |
| `store/src/lib/customer-auth.ts` | Our token |
| `store/backend/src/modules/clerk` | Replace with `normal` |
| `store/wrangler.jsonc` | Drop Clerk vars; add `FLAGS` |
| root `wrangler.jsonc` | Rename binding to `FLAGS` if needed; evaluate in worker |
| `scripts/dev-all.ts` | Drop Clerk env |
