#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WITH_FRONTEND=0

for arg in "$@"; do
  case "$arg" in
    --with-frontend|--frontend|--web) WITH_FRONTEND=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: scripts/dev-live.sh [options]

Starts local Cloudflare backend worker:
  - Laundry ERP API (port 8787)

Options:
  --with-frontend, --web    Also launch the Vite dev server.
  -h, --help                Show this help message.
EOF
      exit 0
      ;;
  esac
done

if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
fi

node - <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");

const path = ".dev.vars";
let text = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const placeholders = new Set([
  "",
  "replace-me",
  "replace-with-at-least-32-characters",
]);

for (const key of ["INTERNAL_CONTEXT_SECRET", "SERVICE_TOKEN"]) {
  const pattern = new RegExp(`^${key}=(.*)$`, "m");
  const match = text.match(pattern);
  const value = match ? match[1].trim() : "";

  if (!match || placeholders.has(value) || value.length < 32) {
    const replacement = `${key}=${crypto.randomBytes(32).toString("hex")}`;

    if (match) {
      text = text.replace(pattern, replacement);
    } else {
      text = `${text.replace(/\n+$/, "")}\n${replacement}\n`;
    }
  }
}

fs.writeFileSync(path, text);
NODE

linked_vars=()

for worker in api; do
  target="workers/$worker/.dev.vars"

  if [ -L "$target" ]; then
    continue
  fi

  if [ -e "$target" ]; then
    if [ .dev.vars -nt "$target" ]; then
      tr -d '\r' < .dev.vars > "$target"
      linked_vars+=("$target")
    else
      echo "Note: using existing $target instead of linking root .dev.vars." >&2
    fi
    continue
  fi

  if ln -s ../../.dev.vars "$target" 2>/dev/null; then
    linked_vars+=("$target")
  else
    tr -d '\r' < .dev.vars > "$target"
    linked_vars+=("$target")
  fi
done

log_dir="${TMPDIR:-/tmp}"
mkdir -p "$log_dir"

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  for link in "${linked_vars[@]:-}"; do
    rm -f "$link"
  done

  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# Run database migrations
pnpm db:migrate:local >"$log_dir/laundry-api-migrate.log" 2>&1 || true

# Start Clean Architecture API Worker
pnpm dev:api >"$log_dir/laundry-api.log" 2>&1 &
pids+=("$!")

# Wait for API health check
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
  echo "The local backend did not become ready." >&2

  echo "API log:" >&2
  tail -n 40 "$log_dir/laundry-api.log" >&2 || true

  exit 1
fi

echo "" >&2
echo "==========================================================" >&2
echo " FreshFold Local Cloudflare Backend API Worker is Ready" >&2
echo "==========================================================" >&2
echo "  - API Server:       http://127.0.0.1:8787" >&2
echo "    Health Check:     http://127.0.0.1:8787/health" >&2
echo "    Session Check:    http://127.0.0.1:8787/api/me" >&2
echo "==========================================================" >&2
echo "To run frontend locally, run 'pnpm dev:web' in another terminal" >&2
echo "with VITE_API_URL=http://127.0.0.1:8787 in frontend/.env.local." >&2
echo "Press Ctrl+C to stop all backend workers." >&2
echo "" >&2

# Stream API logs
tail -n 0 -f \
  "$log_dir/laundry-api.log" \
  2>/dev/null &
pids+=("$!")

if [ "$WITH_FRONTEND" -eq 1 ]; then
  echo "Starting frontend dev server..." >&2
  VITE_API_MODE=live pnpm dev:web
else
  wait
fi