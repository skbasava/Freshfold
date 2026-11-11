# Environment Separation

## Resource Isolation

| Resource | Local | Staging | Production |
| --- | --- | --- | --- |
| D1 `LAUNDRY_DB` | Wrangler local state | Dedicated staging database | Dedicated production database |
| D1 `AUTH_DB` | Wrangler local state | Dedicated staging database | Dedicated production database |
| Calendar queues and DLQs | Local simulation | Dedicated staging queues | Dedicated production queues |
| Notification queues and DLQs | Local simulation | Dedicated staging queues | Dedicated production queues |
| Google Calendar | Fake provider in tests | Dedicated staging calendar | Production calendar |
| WhatsApp/SMS | Fake provider in tests | Staging credentials or sandbox | Production credentials |

Staging must never share D1 databases, queues, calendars, or messaging credentials with production.

## Secrets

Store secrets with Wrangler per environment:

```bash
pnpm exec wrangler secret put AUTH_SESSION_SECRET --config workers/auth/wrangler.jsonc
pnpm exec wrangler secret put GOOGLE_PRIVATE_KEY --config workers/calendar/wrangler.jsonc
pnpm exec wrangler secret put WHATSAPP_API_TOKEN --config workers/notifications/wrangler.jsonc
pnpm exec wrangler secret put WHATSAPP_PHONE_NUMBER_ID --config workers/notifications/wrangler.jsonc
pnpm exec wrangler secret put SMS_API_TOKEN --config workers/notifications/wrangler.jsonc
pnpm exec wrangler secret put SMS_API_URL --config workers/notifications/wrangler.jsonc
pnpm exec wrangler secret put SMS_SENDER_ID --config workers/notifications/wrangler.jsonc
```

`NOTIFICATION_CHANNEL` and `NOTIFICATION_DELAY_SECONDS` are non-secret Wrangler vars and must match the provider selected for the environment.

Keep placeholders only in `.dev.vars.example`. Never commit `.dev.vars`, private keys, access tokens, customer phone numbers, or message contents.

## Least Privilege

- Give the Calendar Worker only the Google scopes it needs.
- Give the Notification Worker only the messaging credentials it needs.
- Give the Scheduler Worker no database credentials.
- Rotate credentials separately for each environment.

## Rotation

1. Create the replacement credential in the provider console.
2. Store it as a Wrangler secret for the target environment.
3. Deploy the Worker that reads it.
4. Verify health, queue processing, and a single controlled integration call.
5. Revoke the old credential.
6. Record the rotation date and owner in the operations log.

## Verification

- Run `pnpm check` before deployment.
- Run `wrangler deploy --dry-run` for every changed Worker.
- Confirm the environment name and resource bindings before any deploy.
