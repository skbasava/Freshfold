# Phase 0 Verification Report

**Date:** 2026-11-11
**Repository:** `/home/satish/Documents/laundry_app`
**State:** No commits, no remote, no application code, no root manifest, no build/test/lint toolchain. `specs/` was empty at verification time.
**Tests run:** None. Verification used official documentation and `npm view`.

## Cloudflare

| Claim | Official source | Status | Notes |
|---|---|---|---|
| `D1.batch()` executes sequentially, non-concurrently; failure aborts/rolls back the sequence | https://developers.cloudflare.com/d1/worker-api/d1-database/ (Jun 22, 2026) | Verified | A zero-row `UPDATE` is not a failure, so later statements still run. |
| `D1Result.meta.changes` exists | Same D1 Worker API page | Verified | Required for the guarded-statement strategy. |
| D1 is single-threaded and serializes queries per database | https://developers.cloudflare.com/d1/platform/limits/ (Oct 30, 2026) | Verified | Backed by a single Durable Object. |
| D1 limits: 100 bound parameters/query, 100 columns/table, 100 KB SQL, 30 s query, 2 MB row | Same limits page | Verified | Batch counts as one query against the paid 1,000 queries/invocation limit. |
| SQLite triggers exist in D1 | https://developers.cloudflare.com/d1/sql-api/sql-statements/ (Apr 21, 2026) | Partially verified | No official page documents trigger or `RAISE(ABORT)` behaviour inside `batch()`. |
| `UPDATE ... RETURNING` works in D1 | D1 SQL docs | Unverified | No official D1 documentation found. Do not rely on it. |
| Queues are at-least-once; duplicates possible | https://developers.cloudflare.com/queues/reference/delivery-guarantees/ (Apr 21, 2026) | Verified | Consumers must be idempotent. |
| Queue `delaySeconds` maximum is 24 hours | https://developers.cloudflare.com/queues/platform/limits/ (Oct 30, 2026) | Verified | Older references may say 12 hours. |
| Queue retention up to 14 days; DLQ configurable per consumer; default max retries 3 | https://developers.cloudflare.com/queues/configuration/dead-letter-queues/ (Oct 12, 2026) | Verified | Without a DLQ, messages are deleted after the retry limit. |
| Queue batching: default 10, max 100; per-message `ack()`/`retry()` | https://developers.cloudflare.com/queues/configuration/batching-retries/ (Apr 21, 2026) | Verified | An uncaught error retries the whole batch. |
| Cron executes in UTC; changes propagate up to 15 minutes | https://developers.cloudflare.com/workers/configuration/cron-triggers/ (Oct 17, 2026) | Verified | Paid CPU: 30 s for intervals under 1 hour; 15 min for 1 hour or longer. |
| Service bindings: Worker-to-Worker, no public URL, same account, max 32 invocations/request | https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/ (Oct 13, 2026) | Verified | Cloudflare Access context does not propagate. |
| WebCrypto supports RSASSA-PKCS1-v1_5 (RS256), SHA-256, HMAC, `timingSafeEqual` | https://developers.cloudflare.com/workers/runtime-apis/web-crypto/ (Sep 30, 2026) | Verified | Adequate for Google service-account JWT signing. |
| Static Assets supported on Workers | https://developers.cloudflare.com/workers/static-assets/ (Oct 12, 2026) | Verified | SPA fallback and `run_worker_first` available. |
| Vitest Workers integration uses `@cloudflare/vitest-plugin` | https://developers.cloudflare.com/workers/testing/vitest-integration/ (Aug 20, 2026) | Verified | Replaces `@cloudflare/vitest-pool-workers`; runs via Miniflare. |
| Workers limits: 128 MB memory, 10,000 subrequests paid, 6 simultaneous outgoing connections | https://developers.cloudflare.com/workers/platform/limits/ | Verified | CPU defaults: 30 s HTTP; 30 s cron under 1 hour; 15 min cron 1 hour or longer. |

## Google

| Claim | Official source | Status | Notes |
|---|---|---|---|
| Service-account JWT assertion uses RS256, `aud=https://oauth2.googleapis.com/token`, `exp` at most 1 hour | https://developers.google.com/identity/protocols/oauth2/service-account | Verified | Token response has `access_token` and `expires_in` 3600. |
| Calendar incremental sync uses `syncToken`; next token only on the last page; invalid token returns 410 | https://developers.google.com/calendar/api/guides/sync | Verified | Persist the next token only after all pages are processed. |
| `syncToken` cannot be combined with `privateExtendedProperty`, `q`, `timeMin`, `timeMax`, `updatedMin`, `orderBy`, and similar parameters | https://developers.google.com/workspace/calendar/api/v3/reference/events/list | Verified | Match `extendedProperties.private.orderId` in code during sync. |
| Event IDs use base32hex lowercase `a-v` and `0-9`, length 5-1024, unique per calendar | https://developers.google.com/calendar/api/v3/reference/events | Verified | Collisions are not guaranteed detected; deterministic IDs are allowed. |
| `extendedProperties.private` is writable | Same events resource page | Verified | Use `orderId` and `projectedVersion`. |
| Conditional writes use `If-Match`; mismatch returns 412; duplicate insert returns 409; invalid sync token 410; rate limit 429 | https://developers.google.com/workspace/calendar/api/guides/errors and performance guide | Verified | Re-fetch and re-evaluate on 412. |
| Calendar quotas: 10,000/min/project; 600/min/user/project; service account counts as one user | https://developers.google.com/workspace/calendar/api/guides/quota | Verified | One-minute polling is within quota for small volume. |
| Service account should not own the calendar | https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert | Verified deviation | Google warns that service-account ownership cannot be transferred. See ADR-004. |
| ACL insert with `role: writer` grants read/write access | https://developers.google.com/workspace/calendar/api/v3/reference/acl/insert | Verified | `owner` ACL role is not the same as data owner. |
| Workflows should be used for durable multi-step orchestration | Not applicable | Not selected | Queues plus Cron sweeper meet v1 requirements. See ADR-009. |

## Package versions

| Package | Version verified 2026-11-11 |
|---|---|
| `wrangler` | 4.160.0 |
| `hono` | 4.13.17 |
| `zod` | 4.6.7 |
| `vitest` | 5.1.0 |
| `@cloudflare/vitest-plugin` | 1.7.0 |
| `@cloudflare/workers-types` | 5.20261110.1 |
| `typescript` | 7.0.2 |

Re-verify at install time.

## Unverified and open items

- D1 trigger execution and rollback semantics inside `batch()`.
- D1 `UPDATE ... RETURNING`.
- Google Calendar duplicate-insert behaviour against a staging calendar.
- Exact Google event normalization behaviour.
- Temporal/timezone library availability in Workers.
- Business rules: offline requirement, volume, slot model, capacity, business hours, cancellation/refund permissions, notification provider, tenant/hub model.
- DPDP/legal review of customer data in Google Workspace Calendar.
