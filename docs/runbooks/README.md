# Runbooks

Operational runbooks for the Laundry ERP. Each failure runbook covers detection, diagnosis, mitigation, rollback, and escalation. Commands use placeholders such as `<worker-name>`, `<laundry-database>`, and `<service-token>`; never store real secrets or customer data in this directory.

| Runbook | Use when |
|---|---|
| `observability.md` | Reading structured logs, metrics, correlation IDs, redaction, and alert thresholds. |
| `google-outage.md` | Google Calendar API is failing, rate limiting, or unavailable. |
| `messaging-outage.md` | WhatsApp/SMS provider is failing or rate limiting. |
| `d1-errors.md` | D1 errors, latency, storage, or quota pressure affect `LAUNDRY_DB`. |
| `queue-backlog.md` | Outbox, calendar, notification, or DLQ backlog is growing. |
| `invalid-sync-token.md` | Calendar polling receives HTTP 410 and starts a full resync. |
| `dlq-replay.md` | Failed outbox rows or dead-letter messages need controlled replay. |
| `incorrect-projection.md` | Calendar events and D1 canonical orders disagree, or reverts repeat. |
| `notification-uncertainty.md` | A message may have been accepted but the ledger cannot prove it. |
| `secret-rotation.md` | Rotating Cloudflare secrets and provider credentials. |
| `staging-to-production.md` | Promoting a reviewed change from staging to production. |
| `supabase-auth.md` | Supabase project setup, JWKS/JWT configuration, `app_metadata`/hook authorization claims, and environment isolation. |
| `auth.md` | Retirement notice for the removed Auth Worker (`workers/auth`) and `AUTH_DB` (superseded by `supabase-auth.md`). |
| `gateway.md` | Gateway routing, request IDs, Supabase bearer authn/authz, rate limits, and forwarding. |
| `environment-separation.md` | Verifying staging and production resources do not overlap. |
| `production-readiness.md` | Reviewing production blockers, gates, open decisions, and approval status. Deployment is not approved. |
| `local-development.md` | Running the Workers locally. |

**Alerting caveat:** Alerts and metrics are log/observability-based. No external paging provider, external metrics backend, or guaranteed alert delivery is configured.
