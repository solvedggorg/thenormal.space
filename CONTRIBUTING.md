# Contributing

Thanks for wanting to help. Keep changes small and literal. Match the voice and layout already on the site.

## Before you start

1. Read [README.md](README.md) for setup.
2. Open an issue for anything larger than a typo or an obvious bug.
3. Do not commit secrets. Ever.

## Local setup

```bash
nix develop          # or: direnv allow
bun install
bun run dev:all      # or: bun run dev --background for the marketing site only
bun test
```

Copy example env files. Git already ignores `.env` and `.dev.vars`.

```bash
cp .env.example .env
cp api/.dev.vars.example api/.dev.vars
cp auth/.dev.vars.example auth/.dev.vars
cp store/.dev.vars.example store/.dev.vars
cp store/backend/.env.example store/backend/.env
cp analytics/.dev.vars.example analytics/.dev.vars
```

Fill in your own keys. Leave production values off your machine if you do not need them.

## What to change

| Area | Start here |
| --- | --- |
| Marketing copy, routes, layout | `src/` |
| Shared product / contact lists | `shared/` |
| Waitlist, contact, and analytics sink | `api/` |
| Sign-in, OIDC, admin auth | `auth/` |
| First-party analytics console | `analytics/` |
| Shop UI | `store/src/` |
| Orders, Stripe, Printful | `store/backend/` |
| Short links | `links/` (AGPL-3.0 — keep that license) |

## Rules

- Do not add `.env`, `.dev.vars`, `*.pem`, or live secret tokens to git.
- Do not rewrite Wrangler resource IDs unless you are changing this project's Cloudflare bindings.
- Wrangler/Vite need real Node.js. Use `bun run dev` (it calls `scripts/with-node.sh`) or `nix develop`.
- Prefer tests next to the code you change (`*.test.ts` or the package `test/` directory).
- Do not reformat unrelated files.
- `links/` is Sink. Keep upstream attribution and the AGPL license.

## Checks

```bash
bun test
bash scripts/check-tracked-secrets.sh
```

CI runs both on pull requests.

## Pull requests

Use the PR template. Say what changed and how you tested it. One concern per PR when you can.

## Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
