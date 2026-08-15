#!/usr/bin/env bash
# Push secrets from the repo-root .env into Workers. Never prints values.
# Usage: scripts/put-worker-secrets.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [[ ! -f .env ]]; then
	echo "put-worker-secrets: missing .env" >&2
	exit 2
fi

NODE_BIN=${NODE:-node}
if ! "$NODE_BIN" -p 'process.versions.node' >/dev/null 2>&1 || readlink -f "$(command -v "$NODE_BIN")" | grep -q bun; then
	if command -v nix >/dev/null 2>&1; then
		exec nix develop --command bash "$0" "$@"
	fi
	echo "Need real Node.js (not bun)." >&2
	exit 1
fi

W=${ROOT}/node_modules/wrangler/bin/wrangler.js
[[ -f $W ]] || {
	echo "put-worker-secrets: wrangler not installed" >&2
	exit 1
}

env_get() {
	"$NODE_BIN" -e '
const fs = require("fs");
const want = process.argv[1];
for (const line of fs.readFileSync(".env","utf8").split(/\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#") || !s.includes("=")) continue;
  const i = s.indexOf("=");
  const k = s.slice(0, i);
  let v = s.slice(i + 1).trim();
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'\''") && v.endsWith("'\''"))) v = v.slice(1, -1);
  if (k === want) { process.stdout.write(v); process.exit(0); }
}
process.exit(3);
' "$1"
}

put() {
	local worker=$1 config=$2 name=$3 envname=${4:-$3}
	local value
	if ! value=$(env_get "$envname"); then
		echo "    skip $worker $name (no $envname in .env)"
		return 0
	fi
	if [[ -z $value ]]; then
		echo "    skip $worker $name (empty)"
		return 0
	fi
	echo "    $worker $name"
	printf '%s' "$value" | "$NODE_BIN" "$W" secret put "$name" --config "$config" >/dev/null
}

echo "==> thenormal-space-api"
put thenormal-space-api api/wrangler.jsonc TURNSTILE_SECRET
put thenormal-space-api api/wrangler.jsonc TURNSTILE_SITE_KEY

echo "==> thenormal-auth"
put thenormal-auth auth/wrangler.jsonc AUTH_SIGNING_JWK

echo "==> thenormal-auth-admin"
put thenormal-auth-admin auth/admin/wrangler.jsonc AUTH_SIGNING_JWK
put thenormal-auth-admin auth/admin/wrangler.jsonc JUMPCLOUD_CLIENT_ID
put thenormal-auth-admin auth/admin/wrangler.jsonc JUMPCLOUD_CLIENT_SECRET

echo "==> thenormal-stats"
put thenormal-stats stats/app/wrangler.jsonc CF_API_TOKEN CLOUDFLARE_API_TOKEN

echo "==> thenormal-analytics"
put thenormal-analytics analytics/wrangler.jsonc CF_API_TOKEN CLOUDFLARE_API_TOKEN
put thenormal-analytics analytics/wrangler.jsonc JUMPCLOUD_CLIENT_ID
put thenormal-analytics analytics/wrangler.jsonc JUMPCLOUD_CLIENT_SECRET
put thenormal-analytics analytics/wrangler.jsonc SINK_INTERNAL_SECRET
put thenormal-space-api api/wrangler.jsonc SINK_SALT
put thenormal-space-api api/wrangler.jsonc SINK_INTERNAL_SECRET

echo "==> thenormal-shop-backend"
if env_get DATABASE_URL >/dev/null; then
	put thenormal-shop-backend store/backend/wrangler.jsonc DATABASE_URL
else
	put thenormal-shop-backend store/backend/wrangler.jsonc DATABASE_URL DB_CONNECTION_STRING
fi
put thenormal-shop-backend store/backend/wrangler.jsonc CLERK_SECRET_KEY
put thenormal-shop-backend store/backend/wrangler.jsonc JUMPCLOUD_CLIENT_ID
put thenormal-shop-backend store/backend/wrangler.jsonc JUMPCLOUD_CLIENT_SECRET
put thenormal-shop-backend store/backend/wrangler.jsonc JWT_SECRET
put thenormal-shop-backend store/backend/wrangler.jsonc COOKIE_SECRET
put thenormal-shop-backend store/backend/wrangler.jsonc STRIPE_API_KEY STRIPE_SECRET_KEY
put thenormal-shop-backend store/backend/wrangler.jsonc STRIPE_WEBHOOK_SECRET
put thenormal-shop-backend store/backend/wrangler.jsonc PRINTFUL_API_TOKEN
put thenormal-shop-backend store/backend/wrangler.jsonc PRINTFUL_STORE_ID
put thenormal-shop-backend store/backend/wrangler.jsonc PRINTFUL_WEBHOOK_SECRET
put thenormal-shop-backend store/backend/wrangler.jsonc SHOP_MEDIA_SECRET
put thenormal-shop-backend store/backend/wrangler.jsonc S3_ACCESS_KEY_ID CLOUDFLARE_ACCESS_KEY_ID
put thenormal-shop-backend store/backend/wrangler.jsonc S3_SECRET_ACCESS_KEY CLOUDFLARE_SECRET_ACCESS_KEY

echo "put-worker-secrets: done"
