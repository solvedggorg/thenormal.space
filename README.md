# The Normal Space

Public site and supporting services for [thenormal.space](https://thenormal.space).

We make normal things. No app, no wifi, no location sharing.

| | |
| --- | --- |
| Site | [thenormal.space](https://thenormal.space) |
| X | [@thenormalcorp](https://x.com/thenormalcorp) |
| Email | hello@thenormal.space |
| License | MIT, except `links/` (AGPL-3.0). See [LICENSING.md](LICENSING.md). |

## Repository layout

| Path | What it is |
| --- | --- |
| `src/` | Marketing site (Astro 7 + React, Cloudflare) |
| `api/` | Waitlist, contact, shop events, and first-party analytics sink (`api.thenormal.space`) |
| `auth/` | Clerk public IdP and JumpCloud admin (`auth.thenormal.space`, `admin2.thenormal.space`) |
| `analytics/` | First-party analytics console (`admin3.thenormal.space`) |
| `store/` | Shop storefront (`shop.thenormal.space`) |
| `store/backend/` | Medusa v2 backend (`admin1.thenormal.space`) |
| `links/` | URL shortener. Fork of [Sink](https://github.com/ccbikai/Sink), AGPL-3.0 |
| `shared/` | Catalog types shared by the site and API |
| `docs/` | Design notes |

## Prerequisites

- [Nix](https://nixos.org) with flakes, **or** Node.js 22+ that is actually Node (not bun-as-`node`)
- [Bun](https://bun.sh) for installs and tests
- [direnv](https://direnv.net) optional: `direnv allow` loads the flake

This machine's `node` is often bun. Wrangler and Vite need real Node.js. Use the project flake so Node wins:

```bash
nix develop
# or: direnv allow
```

## Quick start

```bash
nix develop          # or: direnv allow — real Node must win over bun-as-node
bun install
bun run dev:all
```

That starts the first-party stack on fixed localhost ports and writes the URL map into each package's `.dev.vars` / `.env` so they can reach each other:

| Service | URL |
| --- | --- |
| Marketing site | http://localhost:4321 |
| Shop | http://localhost:4322 |
| API | http://localhost:8787 |
| Auth | http://localhost:8788 |
| Auth admin | http://localhost:8789 |
| Medusa | http://localhost:9000 |
| Stats | http://localhost:8790 |
| Analytics | http://localhost:8791 |

Medusa is skipped until `store/backend/.env` has a real `DATABASE_URL`. Links is opt-in: `bun run dev:all -- --with links`. Filter with `--only api,site` or `--skip shop-backend`. `--list` prints the map without starting anything.

Site-only:

```bash
bun run dev --background
```

Equivalent: `astro dev --background` once `nix develop` / direnv is active.

Manage that server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

```bash
bun test
bun run build
```

## Other packages

Copy the matching example file. Do not commit the copy.

```bash
# API  — http://localhost:8787
cp api/.dev.vars.example api/.dev.vars
(cd api && bun install && bun run dev)

# Auth — http://localhost:8788  /  admin http://localhost:8789
cp auth/.dev.vars.example auth/.dev.vars
(cd auth && bun install && bun run dev)

# Shop storefront — http://localhost:4322
cp store/.dev.vars.example store/.dev.vars
(cd store && bun install && bun run dev)

# Medusa — http://localhost:9000
cp store/backend/.env.example store/backend/.env
# set DATABASE_URL, then:
#   cd store/backend && npm install && npx medusa db:migrate && npm run dev

# Short links (Sink). See links/README.md
cp links/.env.example links/.env
```

Root `.env` is optional local overlay. Copy `.env.example`. Git ignores `.env` and `.dev.vars`.

## Tests

```bash
bun test                         # site, api, shop storefront, auth
(cd api && bun test)
(cd auth && bun test)
(cd store && bun test)
(cd store/backend && npm run test:unit)
(cd links && pnpm test)
```

## Deploy

Build and deploy every first-party Worker (order is in `scripts/deploy-all.sh`):

```bash
bun run deploy
# or one Worker:  ./scripts/deploy-all.sh --only api
# or dry-run:     bun run deploy:dry
```

Add another Worker with one `worker` line in `register_workers()` in that script. Put dependents after the services they bind to.

Wrangler also works from each package (`wrangler.jsonc`). Put private values in Cloudflare secrets, not in git:

```bash
npx wrangler secret put CLERK_SECRET_KEY
```

See `auth/README.md` and `store/backend/README.md` for the full secret lists. Docker must be running to deploy `shop-backend` (container image). Skip it with `--skip shop-backend` if you are not shipping Medusa.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md).

Report security issues privately. See [SECURITY.md](SECURITY.md).
