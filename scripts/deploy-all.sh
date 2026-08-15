#!/usr/bin/env bash
# Build and deploy every first-party Worker.
#
# Add a Worker: one `worker` line in register_workers. List order is
# build+deploy order. Put dependents after the services they bind to
# (stats-tail before site/shop; stats after those producers).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
ORIGINAL_ARGS=("$@")

# ── registry ──────────────────────────────────────────────────────────
# worker ID DIR [--config FILE] [--build "cmd"] [--pre "cmd"] [--deploy "cmd"]
#   --config   wrangler file relative to DIR (default: wrangler.jsonc)
#   --build    run from DIR before deploy (skip with --no-build)
#   --pre      extra command from DIR before deploy (e.g. a one-off migrate)
#   --deploy   replace `wrangler deploy` (odd packages like links/)

register_workers() {
	worker stats-tail stats/tail
	worker api api
	worker auth auth
	worker auth-admin auth --config admin/wrangler.jsonc
	worker shop-backend store/backend --build "npm run build"
	worker site . --build "./scripts/with-node.sh build"
	worker shop store --build "bun run build" --deploy "npx wrangler deploy --config dist/server/wrangler.json"
	worker stats stats/app
	worker analytics analytics
	# Optional AGPL fork — different pipeline (pnpm + generated wrangler.deploy.jsonc):
	# worker links links --build "pnpm build" --deploy "pnpm deploy:worker"
}

# ── options ───────────────────────────────────────────────────────────

usage() {
	cat <<'EOF'
Usage: scripts/deploy-all.sh [options]

  --list              print worker ids and paths, then exit
  --only ID           deploy only this id (repeatable, or comma-separated)
  --skip ID           skip this id (repeatable, or comma-separated)
  --dry-run           wrangler deploy --dry-run; skip remote D1 apply
  --no-build          skip each worker's --build command
  --no-migrate        skip remote D1 migrations
  --keep-going        do not stop on the first failure
  --help              this message

Add a Worker by appending a `worker` line in register_workers().
EOF
}

ONLY=()
SKIP=()
DRY_RUN=0
NO_BUILD=0
NO_MIGRATE=0
KEEP_GOING=0
LIST_ONLY=0

add_ids() {
	local -n dest=$1
	shift
	local raw=$1
	IFS=',' read -ra parts <<<"$raw"
	for part in "${parts[@]}"; do
		[[ -n $part ]] && dest+=("$part")
	done
}

while [[ $# -gt 0 ]]; do
	case $1 in
	--list)
		LIST_ONLY=1
		shift
		;;
	--only)
		[[ $# -ge 2 ]] || {
			echo "deploy-all: --only needs an id" >&2
			exit 2
		}
		add_ids ONLY "$2"
		shift 2
		;;
	--only=*)
		add_ids ONLY "${1#--only=}"
		shift
		;;
	--skip)
		[[ $# -ge 2 ]] || {
			echo "deploy-all: --skip needs an id" >&2
			exit 2
		}
		add_ids SKIP "$2"
		shift 2
		;;
	--skip=*)
		add_ids SKIP "${1#--skip=}"
		shift
		;;
	--dry-run)
		DRY_RUN=1
		shift
		;;
	--no-build)
		NO_BUILD=1
		shift
		;;
	--no-migrate)
		NO_MIGRATE=1
		shift
		;;
	--keep-going)
		KEEP_GOING=1
		shift
		;;
	--help | -h)
		usage
		exit 0
		;;
	*)
		echo "deploy-all: unknown option: $1" >&2
		usage >&2
		exit 2
		;;
	esac
done

# ── registry storage ──────────────────────────────────────────────────

WORKER_IDS=()
declare -A WORKER_DIR WORKER_CONFIG WORKER_BUILD WORKER_PRE WORKER_DEPLOY

worker() {
	local id=$1 dir=$2
	shift 2
	local config=wrangler.jsonc build= pre= deploy=
	while [[ $# -gt 0 ]]; do
		case $1 in
		--config)
			config=$2
			shift 2
			;;
		--build)
			build=$2
			shift 2
			;;
		--pre)
			pre=$2
			shift 2
			;;
		--deploy)
			deploy=$2
			shift 2
			;;
		*)
			echo "deploy-all: unknown worker flag for $id: $1" >&2
			exit 2
			;;
		esac
	done
	if [[ -v WORKER_DIR[$id] ]]; then
		echo "deploy-all: duplicate worker id: $id" >&2
		exit 2
	fi
	WORKER_IDS+=("$id")
	WORKER_DIR[$id]=$dir
	WORKER_CONFIG[$id]=$config
	WORKER_BUILD[$id]=$build
	WORKER_PRE[$id]=$pre
	WORKER_DEPLOY[$id]=$deploy
}

register_workers

in_list() {
	local needle=$1
	shift
	local item
	for item in "$@"; do
		[[ $item == "$needle" ]] && return 0
	done
	return 1
}

selected=()
for id in "${WORKER_IDS[@]}"; do
	if ((${#ONLY[@]})) && ! in_list "$id" "${ONLY[@]}"; then
		continue
	fi
	if ((${#SKIP[@]})) && in_list "$id" "${SKIP[@]}"; then
		continue
	fi
	selected+=("$id")
done

if ((${#ONLY[@]})); then
	for id in "${ONLY[@]}"; do
		if [[ ! -v WORKER_DIR[$id] ]]; then
			echo "deploy-all: unknown worker id: $id" >&2
			echo "known:" "${WORKER_IDS[*]}" >&2
			exit 2
		fi
	done
fi

if ((${#SKIP[@]})); then
	for id in "${SKIP[@]}"; do
		if [[ ! -v WORKER_DIR[$id] ]]; then
			echo "deploy-all: unknown worker id: $id" >&2
			echo "known:" "${WORKER_IDS[*]}" >&2
			exit 2
		fi
	done
fi

if ((${#selected[@]} == 0)); then
	echo "deploy-all: nothing to deploy" >&2
	exit 2
fi

if ((LIST_ONLY)); then
	for id in "${selected[@]}"; do
		if [[ ${WORKER_DIR[$id]} == . ]]; then
			printf '%-16s %s\n' "$id" "${WORKER_CONFIG[$id]}"
		else
			printf '%-16s %s/%s\n' "$id" "${WORKER_DIR[$id]}" "${WORKER_CONFIG[$id]}"
		fi
	done
	exit 0
fi

# ── node / wrangler ───────────────────────────────────────────────────

is_real_node() {
	local bin=$1
	[[ -n ${bin:-} && -x $bin ]] || return 1
	local real
	real=$(readlink -f "$bin" 2>/dev/null || echo "$bin")
	[[ $real != *bun* ]] || return 1
	"$bin" -p 'process.versions.node' >/dev/null 2>&1
}

resolve_node() {
	if is_real_node "${NODE:-}"; then
		echo "$NODE"
		return 0
	fi
	if command -v node >/dev/null 2>&1 && is_real_node "$(command -v node)"; then
		command -v node
		return 0
	fi
	return 1
}

if ! NODE_BIN=$(resolve_node); then
	if command -v nix >/dev/null 2>&1; then
		exec nix develop --command bash "$0" "${ORIGINAL_ARGS[@]}"
	fi
	echo "Need Node.js. The node on PATH is bun, which cannot run wrangler." >&2
	echo "Enter the project flake: nix develop   (or: direnv allow)" >&2
	exit 1
fi

find_wrangler() {
	local dir=$1
	local p=$dir
	while true; do
		if [[ -f $p/node_modules/wrangler/bin/wrangler.js ]]; then
			echo "$p/node_modules/wrangler/bin/wrangler.js"
			return 0
		fi
		[[ $p == "$ROOT" || $p == / ]] && break
		p=$(dirname "$p")
	done
	if [[ -f $ROOT/node_modules/wrangler/bin/wrangler.js ]]; then
		echo "$ROOT/node_modules/wrangler/bin/wrangler.js"
		return 0
	fi
	return 1
}

jsonc_query() {
	local file=$1 want=$2
	"$NODE_BIN" -e '
const fs = require("fs");
const file = process.argv[1];
const want = process.argv[2];
let text = fs.readFileSync(file, "utf8");
text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cfg = JSON.parse(text);
if (want === "name") {
  process.stdout.write(cfg.name || "");
} else if (want === "d1") {
  for (const db of cfg.d1_databases || []) {
    if (!db.migrations_dir) continue;
    const id = db.database_name || db.binding;
    if (id) process.stdout.write(id + "\n");
  }
} else if (want === "assets") {
  process.stdout.write((cfg.assets && cfg.assets.directory) || "");
}
' "$file" "$want"
}

run_wrangler() {
	local cwd=$1
	shift
	local wrangler
	if ! wrangler=$(find_wrangler "$cwd"); then
		echo "deploy-all: wrangler not installed under $cwd (or repo root). Run bun install." >&2
		return 1
	fi
	"$NODE_BIN" "$wrangler" --cwd "$cwd" "$@"
}

# ── deploy one worker ─────────────────────────────────────────────────

run_one() {
	local id=$1
	local dir=${WORKER_DIR[$id]}
	local config=${WORKER_CONFIG[$id]}
	local build=${WORKER_BUILD[$id]}
	local pre=${WORKER_PRE[$id]}
	local custom=${WORKER_DEPLOY[$id]}
	local abs_dir abs_config name

	if [[ $dir == . ]]; then
		abs_dir=$ROOT
	else
		abs_dir=$ROOT/$dir
	fi
	abs_config=$abs_dir/$config

	if [[ ! -d $abs_dir ]]; then
		echo "deploy-all: missing directory: $abs_dir" >&2
		return 1
	fi
	if [[ ! -f $abs_config ]]; then
		echo "deploy-all: missing config: $abs_config" >&2
		return 1
	fi

	name=$(jsonc_query "$abs_config" name || true)
	echo "==> $id${name:+ ($name)}"

	if [[ -n $build && $NO_BUILD -eq 0 ]]; then
		echo "    build: $build"
		(cd "$abs_dir" && bash -c "$build")
	fi

	if [[ -n $pre ]]; then
		echo "    pre: $pre"
		(cd "$abs_dir" && bash -c "$pre")
	fi

	if [[ $NO_MIGRATE -eq 0 && $DRY_RUN -eq 0 && -z $custom ]]; then
		local db
		while IFS= read -r db; do
			[[ -z $db ]] && continue
			echo "    d1 migrate --remote $db"
			CI=1 run_wrangler "$abs_dir" d1 migrations apply "$db" --remote --config "$abs_config"
		done < <(jsonc_query "$abs_config" d1)
	fi

	local assets
	assets=$(jsonc_query "$abs_config" assets || true)
	if [[ -n $assets && $assets != /* ]]; then
		if [[ ! -e $abs_dir/$assets ]]; then
			echo "deploy-all: assets directory missing after build: $abs_dir/$assets" >&2
			return 1
		fi
	fi

	if [[ -n $custom ]]; then
		if ((DRY_RUN)); then
			custom="$custom --dry-run"
		fi
		echo "    deploy: $custom"
		(cd "$abs_dir" && bash -c "$custom")
		return 0
	fi

	local extra=()
	if ((DRY_RUN)); then
		extra+=(--dry-run)
		echo "    wrangler deploy --dry-run --config $config"
	else
		echo "    wrangler deploy --config $config"
	fi
	run_wrangler "$abs_dir" deploy --config "$abs_config" "${extra[@]}"
}

# ── run ───────────────────────────────────────────────────────────────

failed=()
n=${#selected[@]}
i=0
for id in "${selected[@]}"; do
	i=$((i + 1))
	echo "[$i/$n] $id"
	if ! run_one "$id"; then
		echo "deploy-all: $id failed" >&2
		failed+=("$id")
		if ((KEEP_GOING == 0)); then
			exit 1
		fi
	fi
done

if ((${#failed[@]})); then
	echo "deploy-all: failed:" "${failed[*]}" >&2
	exit 1
fi

echo "deploy-all: ok (${n} worker(s))"
