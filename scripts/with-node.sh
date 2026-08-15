#!/usr/bin/env bash
# Run Astro/Wrangler on a real Node.js. This machine's `node` is often bun,
# and bun does not implement the `ws` server events wrangler/vite need.
set -euo pipefail
cd "$(dirname "$0")/.."

is_real_node() {
	local bin=$1
	[[ -n ${bin:-} && -x $bin ]] || return 1
	local real
	real=$(readlink -f "$bin" 2>/dev/null || echo "$bin")
	[[ $real != *bun* ]] || return 1
	"$bin" -p 'process.versions.node' >/dev/null 2>&1
}

ASTRO=./node_modules/astro/bin/astro.mjs
if [[ ! -f $ASTRO ]]; then
	echo "missing $ASTRO — run bun install first" >&2
	exit 1
fi

if is_real_node "${NODE:-}"; then
	exec "$NODE" "$ASTRO" "$@"
fi

if command -v node >/dev/null 2>&1 && is_real_node "$(command -v node)"; then
	exec node "$ASTRO" "$@"
fi

if command -v nix >/dev/null 2>&1; then
	exec nix develop --command node "$ASTRO" "$@"
fi

echo "Need Node.js. The node on PATH is bun, which cannot run wrangler/vite websockets." >&2
echo "Enter the project flake: nix develop   (or: direnv allow)" >&2
exit 1
