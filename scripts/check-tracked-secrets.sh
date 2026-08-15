#!/usr/bin/env bash
# Fail if secret-bearing filenames or private-key material are tracked.
# Only inspects git-tracked paths. Does not read ignored .env files.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail=0

is_example() {
	case "$1" in
	*.example) return 0 ;;
	*) return 1 ;;
	esac
}

is_secret_name() {
	case "$1" in
	.env | .dev.vars | */.env | */.dev.vars) return 0 ;;
	.env.* | .dev.vars.* | */.env.* | */.dev.vars.*) return 0 ;;
	*) return 1 ;;
	esac
}

while IFS= read -r path; do
	if is_secret_name "$path" && ! is_example "$path"; then
		printf 'tracked secret file (contents not printed): %s\n' "$path" >&2
		fail=1
	fi
done < <(git ls-files)

if [[ "$fail" -ne 0 ]]; then
	printf 'Remove those paths from git. Keep using the *.example files.\n' >&2
	exit 1
fi

if git grep -nI -E -e '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----' -- . >/dev/null; then
	printf 'private key material in tracked files:\n' >&2
	git grep -nI -E -e '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----' -- . >&2 || true
	fail=1
fi

# Live Stripe / Clerk secret keys. Publishable pk_ keys are public by design.
if git grep -nI -E -e '(sk_live|sk_test|rk_live|rk_test)_[A-Za-z0-9]{16,}' -- . ':!*.md' ':!*.example' >/dev/null; then
	printf 'live/test secret API key material in tracked files:\n' >&2
	git grep -nI -E -e '(sk_live|sk_test|rk_live|rk_test)_[A-Za-z0-9]{16,}' -- . ':!*.md' ':!*.example' >&2 || true
	fail=1
fi

if [[ "$fail" -ne 0 ]]; then
	exit 1
fi

printf 'ok: no tracked .env/.dev.vars files, no private keys, no sk_/rk_ secret tokens\n'
