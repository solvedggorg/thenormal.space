#!/usr/bin/env bash
set -euo pipefail
ZONE=311f1a68293f44452ef3147ec6f4ea8b
# Requires CLOUDFLARE_API_TOKEN in the environment. Does not print the token.
BODY='{"sbfm_likely_automated":"block","ai_bots_protection":"block"}'
if [[ "${1:-}" != "--apply" ]]; then
  echo "dry-run PUT /zones/${ZONE}/bot_management"
  echo "$BODY"
  echo "re-run with --apply to send"
  exit 0
fi
curl -sS -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE}/bot_management" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$BODY"
echo
