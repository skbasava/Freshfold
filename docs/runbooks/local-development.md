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

## Run the frontend

The React application lives in `apps/web` and uses the `@freshfold/ui` workspace package. Start the Vite development server:

```bash
pnpm dev:web
```

Vite serves the app at `http://localhost:5173`. The web app defaults to the typed mock adapter in `apps/web/src/mocks/` and does not require the Workers to be running.

### Live stack

Start the local backend and the live Vite app with one command:

```bash
pnpm dev:live
```

The script creates `.dev.vars` if needed, applies the local Auth and Laundry D1 migrations, starts Auth on `8788`, Laundry on `8789`, Gateway on `8787`, Notifications on `8791`, and Scheduler on `8792`, waits for Gateway health, then starts Vite in live mode at `http://localhost:5173`. Calendar on `8790` starts only when the Google service-account email and a valid PEM private key are configured. When Google is ready, the script also triggers an outbox sweep and calendar reconciliation, then repeats the sweep every few seconds. Create orders at `http://localhost:5173`; the built Gateway app at `http://localhost:8787` defaults to mock mode. Press Ctrl-C to stop the stack.

To use a built SPA served by the Gateway instead, run `pnpm build:web` and then `pnpm dev:gateway`.

Manual live startup is also supported; the dev scripts have fixed ports:

```bash
pnpm dev:auth
pnpm dev:laundry
pnpm dev:gateway
VITE_API_MODE=live pnpm dev:web
```

Vite proxies `/auth` and `/api` to the Gateway on port 8787. Set `VITE_API_BASE_URL` when the Gateway is on a different same-site origin. Live mode uses `GET /auth/session` for bootstrap, `POST /auth/login` and `POST /auth/logout` with the CSRF cookie, and shows the login screen when the session is missing. `VITE_REQUIRE_AUTH=true` enables the sample login screen in mock mode. `VITE_ENABLE_DEMO_FALLBACKS=true` uses clearly labelled sample delivery slots because the slot-listing endpoint does not exist yet.

### Google Calendar delivery events

The dashboard calendar is an iframe view only. The backend writes delivery events after the order commits, through the outbox, Scheduler sweep, and Calendar queue consumer.

To enable it locally:

1. Enable the Google Calendar API in a Google Cloud project.
2. Create a service account and a JSON key.
3. Put `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.dev.vars`. Keep the private key out of git; use the full PEM `private_key` from the service-account JSON key, including the BEGIN/END lines. A short placeholder or slug will leave Calendar sync disabled.
4. Share the target calendar with the service-account email as **Make changes to events** (writer).
5. Set `GOOGLE_CALENDAR_ID` to the same public calendar used by the frontend widget.
6. Restart `pnpm dev:live`. The script warns and skips Calendar while either credential is still `replace-me`.

Existing orders may not have events if they were created before Calendar sync was configured. The reconciliation trigger enqueues missing calendar upserts; new orders enqueue events automatically after commit. The Google calendar must also be publicly embeddable for the dashboard iframe to render it.

To build the production files that the Gateway serves:

```bash
pnpm build:web
```

The build output is `apps/web/dist`, which is the Gateway `assets.directory`. After building, the Gateway can serve the SPA locally:

```bash
pnpm dev:gateway
```

The Gateway uses `not_found_handling: "single-page-application"`, so client-side routes fall back to `index.html`.

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
pnpm test:web
pnpm build:web
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc
```

`pnpm check` runs the root Worker tests, all typechecks including `@freshfold/ui` and `apps/web`, the web Vitest suite (jsdom + Testing Library), and the web production build.

## Guardrails

- Do not use staging or production D1 databases, queues, calendars, or messaging credentials locally.
- Do not commit `.dev.vars`, private keys, access tokens, or customer data.
- Use the fake Google and notification providers in automated tests.
