# thenormal.space Cloudflare evaluation

Date: 2026-08-14  
Account: iResolved, LLC (`97b0dab10c55d2e8a6c952eb4e4914ac`)  
Zone: `thenormal.space` (`311f1a68293f44452ef3147ec6f4ea8b`) — Business plan, active, NS `kaiser`/`tiffany`  
Workers subdomain: `solvedgg.workers.dev`  
Git remote: `solvedggorg/thenormal.space` (the old `iresolvedllc/thenormal.space` repo is gone)

This is a snapshot of what was live **before teardown**. Compute and storage listed under “in scope” were then deleted so they can be recreated from Terraform + GitHub Actions.

## Scope

**In scope (thenormal* / thenormalspace*):** eight Workers, three D1 databases, three KV namespaces, one R2 bucket + custom domain, one Queue, one Hyperdrive config, one Containers application, two Access apps.

**Out of scope (left alone):** zone itself, Clerk hostname, Neon Postgres, `sink` / Foundation / other account Workers, Access apps that are not thenormal, the `awfixernews-ghost` container.

## Intended map

| Worker name (repo) | Path | Hostname | Role |
| --- | --- | --- | --- |
| `thenormal-space` | `/wrangler.jsonc` | `thenormal.space` | Public Astro site |
| `thenormal-space-api` | `api/` | `api.thenormal.space` | Waitlist, contact, shop events |
| `thenormal-auth` | `auth/` | `auth.thenormal.space` | OIDC / WebAuthn issuer |
| `thenormal-auth-admin` | `auth/admin/` | `admin2.thenormal.space` | Auth admin (Access-gated) |
| `thenormal-stats` | `stats/app/` | `stats.thenormal.space` | Public stats UI + minute cron |
| `thenormal-stats-tail` | `stats/tail/` | (no route) | Tail consumer → Analytics Engine |
| `thenormalspace-shop` | `store/` | `shop.thenormal.space` | Storefront |
| `thenormalspace-shop-backend` | `store/backend/` | `admin1.thenormal.space` | Medusa in a Container |

`links/` (`sink`) is a separate product and was not evaluated as part of this stack.

## What was working

| Piece | Evidence |
| --- | --- |
| Zone | Active, full setup, Business plan |
| All eight Workers exist | Created 2026-08-14/15, settings and bindings match wrangler |
| Custom domains attached | Apex, api, auth, admin1, admin2, shop, stats |
| `thenormal-space` script | `https://thenormal-space.solvedgg.workers.dev/` returned **200** |
| `auth.thenormal.space` | **200** sign-in page; `/.well-known/openid-configuration` **200** |
| `clerk.thenormal.space` | **200** (Clerk, not our Worker) |
| D1 `thenormal-auth` | 12 tables, 176 KB, WNAM |
| D1 `thenormal-list` | 3 tables, 61 KB |
| D1 `thenormal-shop` | 2 tables, 37 KB |
| KV | `thenormal-auth`, `thenormal-shop-cache`, `thenormal-stats` all present and bound |
| R2 `thenormal-shop-media` | WNAM, custom domain `media.thenormal.space` SSL+ownership active, managed `r2.dev` on |
| Queue `thenormal-shop-events` | Producer + consumer both `thenormal-space-api` |
| Hyperdrive `thenormal-shop` | Reaches Neon `neondb` at `ep-spring-poetry-ayi2y76j.c-5.us-east-2.aws.neon.tech` |
| Container `thenormalspace-shop-backend-medusaserver` | Image published; **2/2 instances healthy** (standard-2, 1 vCPU / 6 GiB / 12 GB) |
| Access | `thenormal-auth-admin` → `admin2.thenormal.space`; `thenormal-shop-admin` → `admin1.thenormal.space/app`; both allow Cloudflare account members via IdP `31c4d1bc-…` |
| Observability | Enabled on every Worker |
| Site/shop tail | Both send tails to `thenormal-stats-tail` |
| Auth / admin / shop-backend secrets | Present (JWK, JumpCloud, Clerk, Stripe, Printful, DB URL, etc.) |
| GitHub repo | Public `solvedggorg/thenormal.space`, default branch `master` |

## What was broken or incomplete

### Public hostnames mostly 403

`thenormal.space`, `/contact`, `api.*`, `shop.*`, `stats.*`, `admin1.*`, `admin2.*`, `media.*` all returned Cloudflare **403 Attention Required** (WAF / bot fight / Under Attack — not an application 403).

The same site Worker answered **200** on `*.solvedgg.workers.dev`. The script is fine; the **zone security policy is blocking normal clients**, including this machine.

This token cannot read zone settings or DNS (`#zone_settings` / `#dns_records` return 403). We could not flip the WAF from here.

`www.thenormal.space` does not resolve.

### Root Worker has no route in repo

`wrangler.jsonc` for `thenormal-space` has **no `routes`**. The apex custom domain was attached out of band. A clean wrangler deploy from this file would not claim `thenormal.space`.

### workers.dev disabled on everything except the site

`thenormal-space-api`, `thenormal-auth`, `thenormal-auth-admin`, `thenormalspace-shop`, `thenormalspace-shop-backend`, `thenormal-stats` return **404** on `*.solvedgg.workers.dev`. That hides Workers from smoke tests and makes the 403 zone issue harder to work around.

`thenormal-stats-tail.solvedgg.workers.dev` returns **500** on GET — expected for a tail consumer, not a bug.

### Shop Worker names are inconsistent

Everyone else is `thenormal-*`. Shop is `thenormalspace-shop` and `thenormalspace-shop-backend` (no hyphen after `thenormal`). Package names and the container app follow that. After teardown they should be `thenormal-shop` and `thenormal-shop-backend`.

### API missing Turnstile secrets

`api/` verifies Turnstile for list/contact. Deployed `thenormal-space-api` had **zero secrets**. Subscribe/contact would reject every real submission.

### Shop backend missing R2 S3 secrets

`store/backend/worker/env.ts` expects `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in the container. They were **not** in the Worker secret list. Media uploads from Medusa would fail even though the R2 binding exists.

Hyperdrive is bound but **cannot be used from the container** (comment in `worker/index.ts`). `DATABASE_URL` is the real path. Caching on Hyperdrive was disabled.

### No GitHub deploy

- Remote is already `solvedggorg/thenormal.space`
- `package.json` still points at `iresolvedllc/thenormal.space`
- Only workflow is test/secret-scan CI
- **No Actions secrets or variables**
- Workers Builds is not connected (builds API 401 / invalid token)
- No Pages project for this site

### Token cannot manage the zone

Account-owned `cfat_` token works for Workers, D1, KV, R2, Queues, Hyperdrive, Access, Containers. It does **not** work for DNS, zone settings, Email Routing, or zone Worker routes. Terraform that touches the zone needs a token with Zone DNS/Settings/WAF edit on `thenormal.space`.

### Other gaps

| Item | Detail |
| --- | --- |
| `api/wrangler.jsonc` | No `$schema`, no `account_id` |
| First-party wranglers | No `account_id` (stats hard-codes it only as a runtime var) |
| `links/` | Still named `sink`, leftover preview KV IDs — leave it |
| Publishable keys in shop wrangler | Live Clerk/Stripe publishable keys in `vars` (expected, not secret) |
| Email Routing | Could not read (403). `send_email` bindings exist on api/auth |
| Workers Builds | Not configured for the new org |

## Bindings that were live

### thenormal-space
`ASSETS`; tail → `thenormal-stats-tail`; flags `global_fetch_strictly_public`. No secrets.

### thenormal-space-api
D1 `DB`/`SHOP_DB`, KV `SHOP_CACHE`, R2 `MEDIA`, queue `SHOP_EVENTS`, `send_email EMAIL`. Secrets: none (missing Turnstile).

### thenormal-auth
D1 + KV + `EMAIL`. Secret: `AUTH_SIGNING_JWK`.

### thenormal-auth-admin
Same D1/KV/`EMAIL`. Secrets: `AUTH_SIGNING_JWK`, `JUMPCLOUD_CLIENT_ID`, `JUMPCLOUD_CLIENT_SECRET`. Access AUD and `iresolved-llc.cloudflareaccess.com` in vars.

### thenormal-stats
KV `STATS`, cron `* * * * *`. Secret: `CF_API_TOKEN`.

### thenormal-stats-tail
Analytics Engine dataset `thenormal_pageviews`.

### thenormalspace-shop
`ASSETS`, R2 `MEDIA`, KV `SHOP_CACHE`, tail → stats-tail. No secrets.

### thenormalspace-shop-backend
Hyperdrive, R2 `MEDIA`, DO `MEDUSA`/`MedusaServer`. Secrets: Clerk, cookie, `DATABASE_URL`, JumpCloud, JWT, Printful, `SHOP_MEDIA_SECRET`, Stripe. Missing S3 key pair.

## Teardown plan (executed next)

Deleted, in this order:

1. Worker custom domains
2. Workers (producers first, then tail, then container Worker)
3. Leftover container application
4. Queue
5. D1 databases
6. KV namespaces
7. R2 custom domain, then bucket
8. Hyperdrive
9. Access apps `thenormal-auth-admin` and `thenormal-shop-admin`

**Kept:** zone, Clerk, Neon, unrelated account resources.

D1 exports, if wrangler can reach them, go under `docs/ops/backups/`.

## Rebuild plan

1. Standardize Worker names and wrangler features (routes, `workers_dev`, `account_id`, `$schema`).
2. Terraform owns durable account resources (D1, KV, R2, queue, Hyperdrive, Access). Wrangler owns script/container deploys so the two do not fight.
3. GitHub Actions on `solvedggorg/thenormal.space`: test, `terraform apply`, build the Medusa image via wrangler, deploy all first-party Workers.
4. Zone WAF / DNS stay a human + token-permissions problem until the API token can edit the zone.

## After teardown + Terraform apply (same day)

Durable resources were recreated. **No Workers are deployed yet** — that is the GitHub `Deploy` workflow / `bun run deploy`.

| Resource | New ID / note |
| --- | --- |
| D1 `thenormal-auth` | `db1e8933-c9e7-472a-aab8-d04e16a37d5c` |
| D1 `thenormal-list` | `98408476-4eb9-42af-bed6-dce7095041fb` |
| D1 `thenormal-shop` | `7bde82eb-6eb7-4737-a56b-f22a517fcc50` |
| KV `thenormal-auth` | `138a985967e14d52aeaafd053c0cb131` |
| KV `thenormal-shop-cache` | `1a0d477971274b47b1a4b44c48d269cd` |
| KV `thenormal-stats` | `f139d0c8bb514e9b89457f072efc07f1` |
| R2 `thenormal-shop-media` | custom domain `media.thenormal.space` attached |
| Queue `thenormal-shop-events` | `a3d213b5b80c4075af4770ae8b7fe9a7` |
| Hyperdrive `thenormal-shop` | `a343d6a97eac4e378b42ae3535a72a52` |
| Access `thenormal-auth-admin` | `71b1c19b-dbcc-48a6-8f09-1adee2134a41` |
| Access `thenormal-shop-admin` | `adf27470-be29-4721-8ec6-ceb3cb03191f` |
| State | R2 bucket `thenormal-tfstate` |

`terraform plan` against that state is clean.
