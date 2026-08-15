# First-party analytics

Private console at `https://admin3.thenormal.space`. Events land on the existing API:

```
https://api.thenormal.space/v1/sink/e
https://api.thenormal.space/v1/sink/track
https://api.thenormal.space/v1/sink/batch
https://api.thenormal.space/v1/sink/script.js
```

The marketing site and shop load `script.js` with `data-site-id="tns"` / `"shop"`. The script is Rybbit-shaped: `window.rybbit.event()`, `pageview()`, outbound clicks, `data-rybbit-event`.

## Cloudflare products

| Product | Role |
| --- | --- |
| Workers | Sink on `thenormal-space-api`, console on `thenormal-analytics` |
| Custom domains | `api.thenormal.space`, `admin3.thenormal.space` |
| Analytics Engine | Event store `thenormal_sink` |
| D1 | Sites, hosts, goals |
| KV | Rate limits, query cache, JumpCloud sessions |
| Queues | Async archive after ingest |
| R2 | Raw JSONL (`thenormal-analytics-events`) |
| Durable Objects | Live visitors (5 minute window) |
| Zero Trust Access | Hostname gate; IdP is JumpCloud via Access |
| Observability | Worker logs |

## Access and JumpCloud

Terraform creates the Access application for `admin3.thenormal.space` using the same JumpCloud Access identity provider as admin1/admin2.

Access already uses the JumpCloud identity provider. The Worker also has the same JumpCloud OIDC client as `admin2`. Add this redirect URI on that JumpCloud OIDC app (The Normal Auth Admin):

```
https://admin3.thenormal.space/oidc/callback
```

## Deploy

D1 `thenormal-analytics`, KV `thenormal-analytics`, R2 `thenormal-analytics-events`, and queue `thenormal-analytics-events` already exist. The next Terraform apply should import them instead of creating duplicates:

```bash
terraform -chdir=infra import 'cloudflare_d1_database.this["analytics"]' 0c967cf3-e293-44be-b28b-be0668bc7cf2
terraform -chdir=infra import 'cloudflare_workers_kv_namespace.this["analytics"]' 16c5d68a19ab426da6bbd09a9249a297
terraform -chdir=infra import 'cloudflare_r2_bucket.analytics' thenormal-analytics-events
terraform -chdir=infra import 'cloudflare_queue.analytics_events' thenormal-analytics-events
terraform -chdir=infra import 'cloudflare_zero_trust_access_application.analytics[0]' 9f4573ac-87cb-46f3-9fec-7d49613d7a3e
terraform -chdir=infra apply
terraform -chdir=infra output -json wrangler_bindings | node scripts/apply-terraform-bindings.mjs
```

Then:

```bash
./scripts/deploy-all.sh --only api,analytics
scripts/put-worker-secrets.sh
```

Secrets: `CF_API_TOKEN` (Account Analytics Read) on the analytics Worker; optional `JUMPCLOUD_*` and `SINK_INTERNAL_SECRET` (same value on API and analytics).

Local: `bun run dev:all` then http://localhost:8791 (`ALLOW_DEV_ACCESS=true`).
