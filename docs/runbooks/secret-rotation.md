# Secret Rotation Runbook

**Scope:** Rotating Cloudflare Worker secrets such as `INTERNAL_CONTEXT_SECRET`, `SERVICE_TOKEN`, `DLQ_ADMIN_TOKEN`, `GOOGLE_PRIVATE_KEY`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `SMS_API_TOKEN`, `SMS_API_URL`, `SMS_SENDER_ID`, and `AUTH_SESSION_SECRET`.

**Status:** Procedure only; no staging or production rotation has been performed in this repository.

Never paste secret values into tickets, logs, source, Wrangler vars, or these runbooks. Use the provider console and `wrangler secret put` prompts.

## Detection / triggers

- Scheduled rotation interval reached.
- Credential exposure or suspected exposure.
- Provider revokes or rotates a credential.
- A Worker returns `401`/`403` against Google, messaging, or an internal service.

## Diagnosis

1. Confirm which environment and Worker use the credential. Staging and production must use separate values and resources.
2. List non-secret deployment configuration and confirm the expected secret names. Wrangler does not print secret values:

```bash
pnpm exec wrangler secret list --config workers/<worker>/wrangler.jsonc
```

3. Confirm the Worker health endpoint and the affected integration before changing anything:

```bash
curl --fail-with-body "https://<worker-or-internal-host>/health"
pnpm exec wrangler tail <worker-name> --config workers/<worker>/wrangler.jsonc --format pretty
```

## Mitigation / rotation procedure

1. Create the replacement credential in the provider console (Google service account key, WhatsApp/SMS token, or internal random secret).
2. Store it as a Wrangler secret for the target environment only:

```bash
pnpm exec wrangler secret put <SECRET_NAME> --config workers/<worker>/wrangler.jsonc
```

3. Deploy the Worker that reads it after the normal review gate. Rotate service-binding callers and receivers together when the secret is shared (`SERVICE_TOKEN`, `INTERNAL_CONTEXT_SECRET`).
4. Verify health, queue processing, and one controlled integration call. Do not run bulk replay during rotation.
5. Revoke the old credential at the provider only after verification succeeds.
6. Record the rotation date, owner, environment, and credential name in the operations log. Never record the value.

## Rollback

- If the new credential fails verification, restore the previous value through the provider console and `wrangler secret put` if it is still valid.
- Revoke the failed replacement credential.
- Revert a Worker deployment only if code and secret changes were coupled and the old deployment is compatible with the restored secret.

## Escalation

Escalate immediately when:

- A production secret was exposed in a log, ticket, commit, or client bundle.
- Queue or order processing fails after rotation.
- Google or messaging credentials are shared across staging and production.
- Rotation requires coordinated downtime.

Related: `environment-separation.md`, `observability.md`, `staging-to-production.md`.
