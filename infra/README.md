# thenormal.space infrastructure

Terraform owns durable Cloudflare account resources. Wrangler owns Worker
script and container deploys. Do not create the same Worker from both.

| Terraform | Wrangler / GitHub Actions |
| --- | --- |
| D1, KV, R2, Queue, Hyperdrive, Access | Worker scripts, Container image, D1 migrations, secrets |
| Optional `media.thenormal.space` | Custom domains listed in each `wrangler.jsonc` |

## Workers

| Name | Path | Hostname |
| --- | --- | --- |
| `thenormal-space` | `/` | `thenormal.space` |
| `thenormal-space-api` | `api/` | `api.thenormal.space` |
| `thenormal-auth` | `auth/` | `auth.thenormal.space` |
| `thenormal-auth-admin` | `auth/admin/` | `admin2.thenormal.space` |
| `thenormal-stats` | `stats/app/` | `stats.thenormal.space` |
| `thenormal-stats-tail` | `stats/tail/` | (tail consumer only) |
| `thenormal-shop` | `store/` | `shop.thenormal.space` |
| `thenormal-shop-backend` | `store/backend/` | `admin1.thenormal.space` |

`thenormal-shop-backend` builds `store/backend/Dockerfile` into a Cloudflare
Container (`MedusaServer`, instance type `standard-2`).

## Apply

Token needs Account: Workers, D1, KV, R2, Queues, Hyperdrive, Access, Containers.
Zone DNS / custom hostname for `media.thenormal.space` also needs Zone edit.
The current account-owned `cfat_` token cannot change zone settings.

```bash
nix develop   # node + terraform
export CLOUDFLARE_API_TOKEN=…
export TF_VAR_hyperdrive_origin_password=…   # Neon role password
cd infra
terraform init
terraform plan
terraform apply
cd ..
terraform -chdir=infra output -json wrangler_bindings | node scripts/apply-terraform-bindings.mjs
```

Skip Hyperdrive or the R2 custom domain if the token or password is missing:

```bash
terraform apply -var='manage_hyperdrive=false' -var='manage_r2_custom_domain=false'
```

Then deploy code:

```bash
bun run deploy
# after first Worker create:
scripts/put-worker-secrets.sh
```

D1 schema is applied by `scripts/deploy-all.sh` (`wrangler d1 migrations apply`).

## GitHub

`.github/workflows/deploy.yml` on `master`:

1. `terraform apply` in `infra/`
2. rewrite wrangler binding IDs
3. `scripts/deploy-all.sh` (builds the Medusa image, deploys every first-party Worker)

Required Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`TF_VAR_hyperdrive_origin_password`. Worker secrets listed in
`scripts/put-worker-secrets.sh` also need to exist in the environment or be
pushed once with that script.

## State

State is in R2 bucket `thenormal-tfstate` (created once, not by this stack).
Terraform uses the S3 backend against the account R2 endpoint. Set
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` to the R2 access key pair
(`CLOUDFLARE_ACCESS_KEY_ID` / `CLOUDFLARE_SECRET_ACCESS_KEY`).
