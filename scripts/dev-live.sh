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

Starts all local Cloudflare backend workers:
  - Gateway (port 8787)
  - Laundry Core (port 8789)
  - Notifications (port 8791)
  - Scheduler (port 8792)
  - Calendar Sync (port 8790, when Google credentials are set)

Options:
  --with-frontend, --web    Also launch the Vite dev server for the frontend.
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

google_ready=1
if ! tr -d '\r' < .dev.vars | grep -Eq '^GOOGLE_SERVICE_ACCOUNT_EMAIL=[^[:space:]]+@[^[:space:]]+\.iam\.gserviceaccount\.com$'; then
  google_ready=0
fi
if ! tr -d '\r' < .dev.vars | grep -q 'BEGIN .*PRIVATE KEY'; then
  google_ready=0
fi
if ! tr -d '\r' < .dev.vars | grep -Eq '^GOOGLE_CALENDAR_ID=[^[:space:]]+@group\.calendar\.google\.com$'; then
  google_ready=0
fi

if [ "$google_ready" -eq 0 ]; then
  echo "Google Calendar sync is inactive." >&2
  echo "Set GOOGLE_SERVICE_ACCOUNT_EMAIL to the service account address," >&2
  echo "set GOOGLE_PRIVATE_KEY to the full PEM private key (including BEGIN/END lines)," >&2
  echo "share the calendar with that service account as a writer, then rerun pnpm dev:live." >&2
fi

linked_vars=()
for worker in gateway laundry calendar notifications scheduler; do
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
gateway_live_config="workers/gateway/.wrangler-live.json"

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
  rm -f "$gateway_live_config"
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

node - <<'NODE'
const fs = require("node:fs");

const raw = fs.readFileSync("workers/gateway/wrangler.jsonc", "utf8");
const stripped = raw
  .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, str) => str ?? "")
  .replace(/,\s*([}\]])/g, "$1");
const config = JSON.parse(stripped);
delete config.$schema;
delete config.assets;
config.vars = {
  ...(config.vars ?? {}),
  DEV_FRONTEND_URL: process.env.DEV_FRONTEND_URL || "http://localhost:5173",
};
fs.writeFileSync("workers/gateway/.wrangler-live.json", `${JSON.stringify(config, null, 2)}\n`);
NODE

pnpm db:laundry:migrate:local >"$log_dir/laundry-laundry-migrate.log" 2>&1

pnpm dev:laundry >"$log_dir/laundry-laundry.log" 2>&1 &
pids+=("$!")

pnpm exec wrangler dev --config "$gateway_live_config" --port 8787 --inspector-port 9230 --local >"$log_dir/laundry-gateway.log" 2>&1 &
pids+=("$!")

pnpm dev:notifications >"$log_dir/laundry-notifications.log" 2>&1 &
pids+=("$!")

pnpm dev:scheduler >"$log_dir/laundry-scheduler.log" 2>&1 &
pids+=("$!")

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
  echo "The local backend did not become ready." >&2
  echo "Laundry log:" >&2
  tail -n 40 "$log_dir/laundry-laundry.log" >&2 || true
  echo "Gateway log:" >&2
  tail -n 40 "$log_dir/laundry-gateway.log" >&2 || true
  exit 1
fi

if [ "$google_ready" -eq 1 ]; then
  pnpm dev:calendar >"$log_dir/laundry-calendar.log" 2>&1 &
  pids+=("$!")

  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8790/health >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8792/health >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  curl -fsS "http://127.0.0.1:8792/__scheduled?cron=*+*+*+*+*" >/dev/null 2>&1 || true
  curl -fsS "http://127.0.0.1:8790/__scheduled?cron=0+18+*+*+*" >/dev/null 2>&1 || true

  (
    while true; do
      curl -fsS "http://127.0.0.1:8792/__scheduled?cron=*+*+*+*+*" >/dev/null 2>&1 || true
      sleep 5
    done
  ) &
  pids+=("$!")
fi

echo "" >&2
echo "==========================================================" >&2
echo " FreshFold Local Cloudflare Backend Workers are Ready" >&2
echo "==========================================================" >&2
echo "  - Gateway API:      http://127.0.0.1:8787" >&2
echo "    Health Check:     http://127.0.0.1:8787/health" >&2
echo "  - Laundry Service:  http://127.0.0.1:8789" >&2
echo "  - Notifications:    http://127.0.0.1:8791" >&2
echo "  - Scheduler:        http://127.0.0.1:8792" >&2
if [ "$google_ready" -eq 1 ]; then
  echo "  - Calendar:         http://127.0.0.1:8790" >&2
else
  echo "  - Calendar:         Inactive (Google credentials not set)" >&2
fi
echo "==========================================================" >&2
echo "Frontend is deployed separately on Vercel." >&2
echo "To run frontend locally, run 'pnpm dev:web' in another terminal" >&2
echo "with VITE_API_URL=http://127.0.0.1:8787 in frontend/.env.local." >&2
echo "Press Ctrl+C to stop all backend workers." >&2
echo "" >&2

if [ "$WITH_FRONTEND" -eq 1 ]; then
  echo "Starting frontend dev server..." >&2
  VITE_API_MODE=live pnpm dev:web
else
  wait
fi
