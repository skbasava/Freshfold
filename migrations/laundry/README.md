# Laundry D1 migrations

These migrations are the Phase 3 core schema for the Laundry Worker. They are not production-final until the T-021 schema review is approved.

## Apply locally

```bash
pnpm db:laundry:migrate:local
```

## Apply to a remote database

```bash
pnpm db:laundry:migrate:remote
```

Do not apply remote migrations until the staging and production D1 database IDs are configured and the migration review is approved.

## Schema notes

- All business tables carry `hub_id`; `hubs` carries `tenant_id`.
- Timestamps are UTC epoch milliseconds.
- `order_events.detail_json` and `calendar_repairs.detail_json` require valid JSON.
- Order statuses are `confirmed`, `processing`, `hold`, `out_for_delivery`, `delivered`, and `cancelled`; `hold_comment` stores the current hold reason.
- Capacity is counted from `confirmed`, `processing`, `hold`, and `out_for_delivery` orders sharing a `delivery_slot_id`; there is no separate reservation table.
- Slot timing is validated in Asia/Kolkata: the slot must start in the future, end after it starts, stay within 09:00–20:00, and not cross the local date boundary.
- Local databases created before the ADR-013 status change must be recreated before applying these migrations.
- `changes` is unique per `(hub_id, order_id, version)`, and dependent audit/outbox inserts use `INSERT OR IGNORE` for replay safety.
- Retention and archival are operational policies, not part of these migrations.
