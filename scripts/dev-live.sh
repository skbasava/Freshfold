#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
fi

pnpm db:auth:migrate:local >/tmp/laundry-auth-migrate.log 2>&1
pnpm db:laundry:migrate:local >/tmp/laundry-laundry-migrate.log 2>&1

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

pnpm dev:auth >/tmp/laundry-auth.log 2>&1 &
pids+=("$!")

pnpm dev:laundry >/tmp/laundry-laundry.log 2>&1 &
pids+=("$!")

pnpm dev:gateway >/tmp/laundry-gateway.log 2>&1 &
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

VITE_API_MODE=live pnpm dev:web
