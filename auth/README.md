# thenormal-auth

Identity and product app for The Normal People Society.

| App | Origin | Worker | Login |
| --- | --- | --- | --- |
| Public IdP + future product surfaces | `https://auth.thenormal.space` | `thenormal-auth` | **Clerk** |
| Admin | `https://admin2.thenormal.space` | `thenormal-auth-admin` | Cloudflare Access on the host, **JumpCloud** in the app |

The app stays. Orders and similar product work land here later. Clerk is the customer identity provider. Local D1 rows are a product record keyed to `clerk_user_id`.

## Public login (Clerk)

Sign-in and sign-up on `auth.thenormal.space` are Clerk. Passkeys and TOTP live in Clerk. First-party products can:

1. Use Clerk directly (same Clerk instance), or
2. Use this Worker as an OIDC broker: `/oauth/authorize` after a Clerk session, tokens from `/oauth/token`

Secrets:

```
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_JWT_KEY
```

`CLERK_JWT_KEY` is the PEM from the Clerk Dashboard (networkless JWT verify on Workers). Optional: `CLERK_FRONTEND_API` if the publishable key does not decode to the Frontend API host.

## Admin (JumpCloud)

`admin2.thenormal.space` stays behind Cloudflare One Access (`thenormal-auth-admin`, same Cloudflare-account policy as `admin1.thenormal.space`). That policy is unchanged.

The admin app’s own login is JumpCloud OIDC (after Access):

- Redirect URI: `https://admin2.thenormal.space/oidc/callback`
- Login URL: `https://admin2.thenormal.space/login/jumpcloud`
- Grant: Authorization Code
- Client authentication: Client Secret POST
- Scopes: Email, Profile

```
npx wrangler secret put JUMPCLOUD_CLIENT_ID --config admin/wrangler.jsonc
npx wrangler secret put JUMPCLOUD_CLIENT_SECRET --config admin/wrangler.jsonc
```

## OIDC broker (still on this Worker)

Discovery: `https://auth.thenormal.space/.well-known/openid-configuration`

- Authorization code + PKCE S256
- Refresh-token rotation, revocation, introspection
- Client credentials for confidential clients
- Tokens signed EdDSA (`/oauth/jwks`)

Create clients in admin. People sign in with Clerk first.

## Local

```
cd auth
bun install
bun test
bun run dev          # :8788
bun run dev:admin    # :8789
```

```
npx wrangler d1 migrations apply thenormal-auth --local
npx wrangler d1 migrations apply thenormal-auth --local --config admin/wrangler.jsonc
npx wrangler d1 migrations apply thenormal-auth --remote
```

Also keep `AUTH_SIGNING_JWK` for the OIDC signing key.
