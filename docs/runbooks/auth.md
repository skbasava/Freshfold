# Auth Worker Runbook (Retired)

**Status:** **RETIRED (`ADR-015`).** The legacy Auth Worker (`workers/auth`), `AUTH_DB` (`migrations/auth`), D1 `employees`/`employee_hub_memberships` tables, and Gateway `/auth/*` cookie/CSRF routes have been removed.

All staff authentication, session validation, and staff authorization (`role`, `tenantId`, `hubId`) are handled by Supabase Auth and verified at the Gateway via JWKS.

See [supabase-auth.md](supabase-auth.md) and [gateway.md](gateway.md).
