# FreshFold Backend — Setup, Migration, Storage Monitoring & Restore Runbook

## 1. Prerequisites & Runtime Versions

- **Node.js:** `>= 22` (verified on `v24.15.0`)
- **Package Manager:** `pnpm@10.32.1`
- **Cloudflare Runtime:** Wrangler `4.160.0`, Hono `4.13.17`, Drizzle ORM `0.45.4`, Drizzle Kit `0.31.11`, Zod `4.6.7`

## 2. Architecture Layout (`workers/api/`)

Clean Architecture dependency direction (`presentation -> application -> domain <- infrastructure`):

- `workers/api/src/shared/` — Constants, integer paise/gram math (`BigInt` half-up rounding), typed `AppError` hierarchy, UTC clock, cursor pagination.
- `workers/api/src/domain/` — Pure entities, pricing/GST calculation rules, state machines, and DB-agnostic repository/storage port interfaces (PostgreSQL migration ready).
- `workers/api/src/application/` — Zod DTO validation schemas, deterministic pricing engine, idempotency service, and business use cases (zero Hono/Drizzle/Cloudflare imports).
- `workers/api/src/infrastructure/` — Drizzle D1 schema (32 tables), D1 repositories, R2 storage adapter, Supabase RS256/ES256 JWKS verifier, and HMAC-SHA256 payment webhook verifier.
- `workers/api/src/presentation/` — Hono HTTP routes (`/health`, `/health/database`, `/api/me`, `/api/v1/*`), per-request DI composition root, request IDs, structured JSON logging, and error mapping.

## 3. Local Development & Migration Workflow

> [!IMPORTANT]
> Never use `drizzle-kit push` for staging or production. Always generate reviewed SQL migrations via Drizzle Kit and apply them via Wrangler D1 migrations.

```bash
# 1. Generate a new SQL migration after changing Drizzle schema files
pnpm db:generate

# 2. Review generated SQL under migrations/api/ before committing or applying

# 3. Apply migrations to a fresh local D1 database
pnpm db:migrate:local

# 4. Run API worker locally (port 8787, proxied automatically by frontend Vite)
pnpm dev:api

# 5. Run all typechecks, unit tests, D1/R2 integration tests, frontend tests & build
pnpm check
```

### Remote Staging / Production Migrations

```bash
# Configure secrets first (never commit secrets):
wrangler secret put SUPABASE_URL --config workers/api/wrangler.jsonc
wrangler secret put PAYMENT_WEBHOOK_SECRET --config workers/api/wrangler.jsonc

# Apply reviewed migrations during an approved release window:
pnpm db:migrate:remote
```

## 4. D1 Storage Monitoring & Alert Thresholds

The API exposes `GET /api/v1/system/storage-health` (restricted to `super_admin`, `admin`, `manager`), measuring live D1 utilization from Cloudflare D1's native `result.meta.size_after` metric (since D1's SQLite authorizer restricts `PRAGMA page_count`/`PRAGMA page_size`) against `D1_STORAGE_LIMIT_BYTES` (default `524288000` = 500 MB conservative ceiling):

| Utilization | Alert Level | Required Operational Action |
|---|---|---|
| `< 60%` | `normal` | Routine monthly review |
| `60% – 74.99%` | `review_60` | Review monthly growth rate and index footprint |
| `75% – 84.99%` | `prepare_archive_75` | Run staged archive & restore verification tests for eligible operational history |
| `>= 85%` | `action_required_85` | Execute approved capacity plan (plan upgrade, archival, or PostgreSQL migration) |

## 5. Backup, Verified R2 Archival & Restore Procedure

- **Financial retention invariant:** Never delete issued `invoices`, `invoice_items`, `payments`, `payment_transactions`, `payment_allocations`, or `refunds` solely to stay under a storage ceiling.
- **Verified R2 archive batches (`HealthUseCases.createVerifiedArchiveBatch`):**
  1. Exports eligible operational records to `archives/<entity>/<archiveId>.jsonl` in R2.
  2. Writes `archives/<entity>/<archiveId>.manifest.json` containing `recordCount`, `dataSizeBytes`, and `dataSha256Hex`.
  3. Reads the R2 data object back and verifies its SHA-256 checksum matches the manifest (`verified: true`) before any source purge can ever be considered.
- **D1 Export & Restore:**
  - Export full database snapshot: `wrangler d1 export laundry-erp-db --remote --output=backup-$(date +%F).sql --config workers/api/wrangler.jsonc`
  - Restore into a fresh verification D1 database: `wrangler d1 execute laundry-erp-db-restore --local --file=backup-YYYY-MM-DD.sql --config workers/api/wrangler.jsonc`
  - Validate row counts, `PRAGMA foreign_key_check`, and `GET /health/database` before cutover.

## 6. Known Limitations & Unresolved Business Decisions (Pre-Production Sign-Off)

Confirm the following with the business owner and qualified GST tax advisor before production invoicing:

1. **Supplier GSTIN & State Code:** Seed data uses placeholder branch state code `'29'` (Karnataka) and `gstin = NULL`. Update the `branches` table with legal business details before issuing live tax invoices.
2. **HSN/SAC & GST Rates:** Seeded rates (`GST_18_PLACEHOLDER` SAC `999712`, `GST_5_PLACEHOLDER` SAC `999711`) are placeholders only and **not** tax advice. Confirm exact classifications and rates per service.
3. **Weight Measurement Point:** Standardize operationally whether garment weight (in integer grams) is recorded dry at intake or after washing.
4. **Invoice Finalization Event:** Confirm whether invoices are issued immediately at order confirmation, at processing completion (`ready`), or at delivery.
5. **Cancellation & Refund Policy:** Confirm cut-off statuses and fee/refund rules for cancelled orders.
6. **Cloudflare Plan Limits:** Verify actual D1 storage limits on the target Cloudflare account plan before production cutover.
