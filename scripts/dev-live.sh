#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
fi

python3 - <<'PY'
from pathlib import Path
import re
import secrets

path = Path(".dev.vars")
text = path.read_text()

for key in ("INTERNAL_CONTEXT_SECRET", "SERVICE_TOKEN"):
    pattern = re.compile(rf"^{key}=(.*)$", re.MULTILINE)
    match = pattern.search(text)
    value = match.group(1).strip() if match else ""
    if not match or value in {"", "replace-me", "replace-with-at-least-32-characters"} or len(value) < 32:
        replacement = f"{key}={secrets.token_hex(32)}"
        if match:
            text = pattern.sub(replacement, text)
        else:
            text = text.rstrip("\n") + "\n" + replacement + "\n"

path.write_text(text)
PY

google_ready=1
if ! grep -Eq '^GOOGLE_SERVICE_ACCOUNT_EMAIL=[^[:space:]]+@[^[:space:]]+\.iam\.gserviceaccount\.com$' .dev.vars; then
  google_ready=0
fi
if ! grep -q 'BEGIN .*PRIVATE KEY' .dev.vars; then
  google_ready=0
fi
if ! grep -Eq '^GOOGLE_CALENDAR_ID=[^[:space:]]+@group\.calendar\.google\.com$' .dev.vars; then
  google_ready=0
fi

if [ "$google_ready" -eq 0 ]; then
  echo "Google Calendar sync is inactive." >&2
  echo "Set GOOGLE_SERVICE_ACCOUNT_EMAIL to the service account address," >&2
  echo "set GOOGLE_PRIVATE_KEY to the full PEM private key (including BEGIN/END lines)," >&2
  echo "share the calendar with that service account as a writer, then rerun pnpm dev:live." >&2
fi

linked_vars=()
for worker in gateway auth laundry calendar notifications scheduler; do
  target="workers/$worker/.dev.vars"
  if [ -L "$target" ]; then
    continue
  fi
  if [ -e "$target" ]; then
    echo "Note: using existing $target instead of linking root .dev.vars." >&2
    continue
  fi
  ln -s ../../.dev.vars "$target"
  linked_vars+=("$target")
done

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

pnpm db:auth:migrate:local >/tmp/laundry-auth-migrate.log 2>&1
pnpm db:laundry:migrate:local >/tmp/laundry-laundry-migrate.log 2>&1

pnpm dev:auth >/tmp/laundry-auth.log 2>&1 &
pids+=("$!")

pnpm dev:laundry >/tmp/laundry-laundry.log 2>&1 &
pids+=("$!")

pnpm dev:gateway >/tmp/laundry-gateway.log 2>&1 &
pids+=("$!")

pnpm dev:notifications >/tmp/laundry-notifications.log 2>&1 &
pids+=("$!")

pnpm dev:scheduler >/tmp/laundry-scheduler.log 2>&1 &
pids+=("$!")

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
  echo "The local backend did not become ready." >&2
  echo "Auth log:" >&2
  tail -n 40 /tmp/laundry-auth.log >&2 || true
  echo "Laundry log:" >&2
  tail -n 40 /tmp/laundry-laundry.log >&2 || true
  echo "Gateway log:" >&2
  tail -n 40 /tmp/laundry-gateway.log >&2 || true
  exit 1
fi

if [ "$google_ready" -eq 1 ]; then
  pnpm dev:calendar >/tmp/laundry-calendar.log 2>&1 &
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

echo "Open http://localhost:5173 for the live app." >&2
echo "Orders created at http://localhost:8787 use the built app, which defaults to mock mode." >&2

VITE_API_MODE=live pnpm dev:web
