# Security Policy

## Supported versions

Only `master` is supported. It tracks the live site.

## Reporting a vulnerability

Email **hello@thenormal.space**.

Do **not** open a public issue for anything that could expose customer data, payments, authentication, or infrastructure credentials.

Include:

- What is affected (site, API, auth, shop, links)
- Steps to reproduce
- Impact
- A fix or mitigation if you have one

We will acknowledge the report and follow up when we have a plan.

## Secrets in this repo

Local credentials belong in ignored files:

| File | Copy from |
| --- | --- |
| `.env` | `.env.example` |
| `api/.dev.vars` | `api/.dev.vars.example` |
| `auth/.dev.vars` | `auth/.dev.vars.example` |
| `store/.dev.vars` | `store/.dev.vars.example` |
| `store/backend/.env` | `store/backend/.env.example` |
| `links/.env` | `links/.env.example` |

Never commit `.env`, `.dev.vars`, private keys, or live secret tokens.

`wrangler.jsonc` files may contain Cloudflare resource IDs and public frontend keys (Clerk / Stripe / Medusa publishable keys). Those are not private API secrets. Forks must replace them before deploying.

Production Worker secrets go in the Cloudflare dashboard (`wrangler secret put`), not in git.
