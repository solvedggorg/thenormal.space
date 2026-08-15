# thenormalspace-shop-backend

Medusa v2.19 for `admin1.thenormal.space`. The Worker in `worker/` proxies to a Cloudflare Container that runs this app.

Local Medusa (needs Postgres):

```
cp .env.example .env
# set DATABASE_URL
npm install
npx medusa db:migrate
npx medusa user -e you@thenormal.space -p 'a-password'
npm run dev
```

Admin: `http://localhost:9000/app`. Health: `/health`.

## Auth

Admin users sign in with JumpCloud OIDC (`POST /auth/user/jumpcloud`). Customers sign in with a Clerk session JWT (`POST /auth/customer/clerk`).

Create a JumpCloud Custom OIDC app:

- Redirect URI: `https://admin1.thenormal.space/app/login` (local: `http://localhost:9000/app/login`)
- Grant: Authorization Code
- Client authentication: Client Secret POST
- Scopes: `openid email profile`
- PKCE: S256

Then put `JUMPCLOUD_CLIENT_ID` and `JUMPCLOUD_CLIENT_SECRET` in `.env` locally, and as Worker secrets in production. Optional: `JUMPCLOUD_ALLOWED_EMAIL_DOMAINS=thenormal.space`. Local email/password stays available when `JUMPCLOUD_ALLOW_EMAILPASS=true` or JumpCloud is unset.

The storefront sends the Clerk session token to Medusa. Set `CLERK_SECRET_KEY` (and optionally `CLERK_ISSUER=https://clerk.thenormal.space`) so the backend can verify the JWT and read the shopper email. A custom Clerk JWT template with `email` is enough if you do not want the backend to call Clerk's user API.

Production `admin1.thenormal.space/app` and `/admin` sit behind Cloudflare One Access. Login is the account Cloudflare IdP, restricted to members of this Cloudflare account (same setup as foundation-studio and sink-dashboard). After Access, Medusa admin login is JumpCloud. `/store` and `/health` stay public.

Deploy later with `wrangler deploy` from this directory. Put secrets with `wrangler secret put`:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `JUMPCLOUD_CLIENT_ID`
- `JUMPCLOUD_CLIENT_SECRET`
- `CLERK_SECRET_KEY`
- `STRIPE_API_KEY` (restricted key preferred; `rk_live_…` or `rk_test_…`)
- `STRIPE_WEBHOOK_SECRET`

Stripe webhook URL (after the backend is up):

```
https://admin1.thenormal.space/hooks/payment/stripe_stripe
```

Events: `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.partially_funded`.

Then enable Stripe on the Europe region (`npx medusa exec ./src/scripts/enable-stripe.ts`) or in Admin → Settings → Regions. The provider id is `pp_stripe_stripe`.

Printful (via [`@legenki/print2medusa`](https://github.com/legenki/print2medusa)):

- `PRINTFUL_API_TOKEN` (private token with `orders` + `sync_products`)
- `PRINTFUL_STORE_ID` (required for account-level tokens)
- `PRINTFUL_WEBHOOK_SECRET`

Webhook URL after deploy:

```
https://admin1.thenormal.space/hooks/printful/<PRINTFUL_WEBHOOK_SECRET>
```

Register it from Admin → Printful, or:

```
curl -X POST https://admin1.thenormal.space/admin/printful/webhook \
  -H 'content-type: application/json' \
  -d '{"base_url":"https://admin1.thenormal.space"}'
```

Then Sync Now in Admin → Printful, and run `npx medusa exec ./src/scripts/enable-printful.ts` so the location has a Printful shipping option.

R2 bucket `thenormal-shop-media` is public at `https://media.thenormal.space`. Medusa uploads through the Hono API (`SHOP_API_URL` + `SHOP_MEDIA_SECRET`), which writes with the Worker R2 binding. Optional S3 keys still work if you add an R2 API token later.

Hyperdrive `thenormal-shop` (`08f9a55fee074c01ae2df56c39bb8741`) is bound on the Worker but cannot be used inside the container. Hyperdrive connection strings only work from Workers. Put the Neon URL on the Worker as the `DATABASE_URL` secret and migrate from this directory before or after deploy:

```
npx medusa db:migrate
```
