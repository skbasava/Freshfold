# Local Development

## Prerequisites

- Node.js 22 or newer
- pnpm 10.32.1
- Wrangler 4.160.0 via the workspace dev dependency

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

`.dev.vars` is ignored by git. It must contain placeholders or local-only values; never put production credentials in it.

## Run a Worker

```bash
pnpm dev:gateway
pnpm dev:auth
pnpm dev:laundry
pnpm dev:calendar
pnpm dev:notifications
pnpm dev:scheduler
```

Each Worker listens on its own local port. Health checks are available at `GET /health` and return `{ "status": "ok", "service": "<name>" }`.

## Auth Worker

The Auth Worker owns `AUTH_DB`. Apply its migration before starting it locally:

```bash
pnpm db:auth:migrate:local
pnpm dev:auth
```

Public clients use the Gateway routes `POST /auth/login`, `GET /auth/session`, and `POST /auth/logout`. The Auth Worker is internal-only (`workers_dev: false`); the Gateway reaches `GET /internal/session` through its `AUTH` service binding. See `docs/runbooks/auth.md`.

## Laundry Worker

The Laundry Worker owns `LAUNDRY_DB`. Apply its migrations before starting it locally:

```bash
pnpm db:laundry:migrate:local
pnpm dev:laundry
```

Migrations under `migrations/laundry` are staging candidates until the schema and write path are reviewed. They are not production-final.

## Local Bindings

- D1 databases are simulated under `.wrangler/state`.
- Queues are simulated locally by Wrangler.
- Service bindings connect to other local Wrangler sessions when those sessions are running; otherwise Wrangler reports `[not connected]`.
- Gateway rate limiting uses the `LOGIN_RATE_LIMITER` and `MUTATION_RATE_LIMITER` bindings. In local development, missing limiters are allowed; production fails closed.
- Gateway state-changing `/api/*` requests require the `x-csrf-token` header and `laundry_csrf` cookie. See `docs/runbooks/gateway.md`.
- Scheduled handlers do not fire automatically in local development. Trigger them manually with `wrangler dev --test-scheduled` or the local scheduled endpoint.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc
```

## Guardrails

- Do not use staging or production D1 databases, queues, calendars, or messaging credentials locally.
- Do not commit `.dev.vars`, private keys, access tokens, or customer data.
- Use the fake Google and notification providers in automated tests.
