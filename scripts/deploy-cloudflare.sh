#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENVIRONMENT="staging"
DRY_RUN=0
SKIP_CHECKS=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy-cloudflare.sh [staging|production] [options]

Options:
  --dry-run        Validate builds and Wrangler deploys without publishing.
  --skip-checks    Skip pnpm check and web build before deployment.
  -h, --help       Show this help.

Production deployments additionally require:
  CONFIRM_PRODUCTION=DEPLOY_PRODUCTION

Environment-specific Wrangler configs are used when present:
  workers/<worker>/wrangler.<environment>.jsonc
Otherwise workers/<worker>/wrangler.jsonc is used.
EOF
}

for arg in "$@"; do
  case "$arg" in
    staging|production) ENVIRONMENT="$arg" ;;
    --dry-run) DRY_RUN=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$ENVIRONMENT" == "production" && "${CONFIRM_PRODUCTION:-}" != "DEPLOY_PRODUCTION" ]]; then
  echo "Refusing to deploy to production." >&2
  echo "Set CONFIRM_PRODUCTION=DEPLOY_PRODUCTION only after the production approval gate." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required." >&2
  exit 1
fi

if ! pnpm exec wrangler whoami >/dev/null 2>&1; then
  echo "Wrangler is not authenticated. Run: pnpm exec wrangler login" >&2
  exit 1
fi

config_for() {
  local worker="$1"
  local env_config="workers/$worker/wrangler.$ENVIRONMENT.jsonc"
  if [[ -f "$env_config" ]]; then
    echo "$env_config"
  else
    echo "workers/$worker/wrangler.jsonc"
  fi
}

for worker in laundry; do
  config="$(config_for "$worker")"
  if rg -q '00000000-0000-0000-0000-000000000000' "$config"; then
    echo "D1 database_id is still a placeholder in $config." >&2
    echo "Create the $ENVIRONMENT D1 database and set its database_id before deploying." >&2
    exit 1
  fi
done

if [[ "$SKIP_CHECKS" -eq 0 ]]; then
  pnpm check
  pnpm build:web
fi

run_wrangler() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    pnpm exec wrangler "$@" --dry-run
  else
    pnpm exec wrangler "$@"
  fi
}

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "Applying laundry migrations for $ENVIRONMENT"
  pnpm exec wrangler d1 migrations apply laundry-core --remote --config "$(config_for laundry)"
fi

for worker in laundry calendar notifications scheduler gateway; do
  config="$(config_for "$worker")"
  echo "Deploying $worker for $ENVIRONMENT using $config"
  run_wrangler deploy --config "$config" --var "ENVIRONMENT:$ENVIRONMENT"
done

if [[ -n "${GATEWAY_HEALTH_URL:-}" && "$DRY_RUN" -eq 0 ]]; then
  echo "Checking $GATEWAY_HEALTH_URL"
  curl -fsS "$GATEWAY_HEALTH_URL" >/dev/null
fi

echo "Deployment complete for $ENVIRONMENT"
