# Laundry Management System --- D1 Database Implementation Prompt & Plan

**Project:** Laundry Management System\
**Backend:** Hono.js on Cloudflare Workers\
**Database:** Cloudflare D1 (SQLite)\
**ORM and migrations:** Drizzle ORM + Drizzle Kit\
**File storage:** Cloudflare R2\
**Language:** TypeScript\
**Architecture:** Clean Architecture\
**Initial scale:** 1,000--5,000 orders/month\
**Business configuration:** Single branch, item-wise and weight-based
pricing, Indian GST

------------------------------------------------------------------------

## 1. Project objective

Build a new laundry-management backend from a clean foundation. Do not
carry forward the previous Cloudflare Workers implementation or its
database schema unless the project owner explicitly identifies code or
data that must be retained.

The first scope is limited to customer, catalog, pricing, order,
billing, payment, and pickup/delivery capabilities.

**Out of scope for this phase:** - Laundry staff/worker management -
Staff attendance, worker assignments, and worker activity - Machine
management and processing-batch management - Unrequested customer-facing
or admin frontend redesign

Use Cloudflare Workers as the runtime and Hono.js as the HTTP framework.
Use Cloudflare D1 as the transactional database and R2 for images and
documents.

Design the domain and repository interfaces so that the application can
be moved to PostgreSQL or another relational database later without
rewriting business use cases.

------------------------------------------------------------------------

# PART A --- MASTER PROMPT FOR THE CODING AGENT

Copy the prompt below into the coding agent or development workspace.

## 2. Implementation prompt

You are a senior TypeScript backend architect. Design and implement a
production-minded Laundry Management System API from scratch using
**Hono.js, Cloudflare Workers, Cloudflare D1 (SQLite), Drizzle ORM,
Drizzle Kit, TypeScript, Zod, and Cloudflare R2**.

### Business decisions

1.  The business initially operates from one branch.
2.  Keep a `branches` table and a default branch record, but do not
    implement multi-branch workflows yet.
3.  Support both:
    -   Item-based pricing, such as a shirt priced per piece.
    -   Weight-based pricing, such as laundry priced per kilogram.
4.  Weight must be stored as integer grams. Never use floating-point
    values for stored quantities or financial calculations.
5.  Support Indian GST:
    -   CGST + SGST for applicable intra-state supplies.
    -   IGST for applicable inter-state supplies.
    -   Configurable, effective-dated tax rates and HSN/SAC metadata.
    -   Store tax rate and tax amount snapshots on order/invoice lines.
    -   Do not hardcode a GST rate or assume a tax classification. Make
        tax configuration data-driven and require business/tax-advisor
        validation.
6.  Use integer paise for every monetary value. Example: ₹250.50 is
    stored as `25050`.
7.  Store timestamps in UTC using a consistent ISO-8601 representation.
8.  Store images, PDFs, and other files in R2. Store only R2 object keys
    and metadata in D1.
9.  Expected order volume is 1,000--5,000 orders per month.
10. Plan conservatively for a 500 MB D1 database ceiling, even if the
    account's current plan permits more.

### Required architecture

Use Clean Architecture with clear dependency direction:

-   `domain`: entities, value objects, repository contracts, domain
    rules.
-   `application`: use cases, DTOs, input/output ports.
-   `infrastructure`: D1/Drizzle repositories, R2 storage adapter,
    external payment adapters.
-   `presentation`: Hono routes, controllers/handlers, middleware,
    request validation.
-   `shared`: errors, result types, constants, utilities.

Business use cases must not import Hono, Drizzle, D1, or
Cloudflare-specific types. Infrastructure implements domain/application
interfaces. Presentation calls application use cases.

Use dependency injection through Hono's environment/context or a small
composition root. Avoid a global database connection.

### Required modules and tables

Implement these 33 proposed tables. Keep naming consistent and document
any justified change.

**Branch** 1. `branches`

**Customer** 2. `customers` 3. `customer_addresses` 4.
`customer_preferences`

**Catalog and services** 5. `item_categories` 6. `items` 7.
`item_attributes` 8. `service_categories` 9. `services`

**Pricing and tax** 10. `rate_cards` 11. `rate_card_items` 12.
`customer_rate_cards` 13. `tax_rates`

**Orders** 14. `orders` 15. `order_items` 16. `order_status_history` 17.
`order_notes` 18. `order_adjustments`

**Billing and payments** 19. `invoices` 20. `invoice_items` 21.
`payments` 22. `payment_transactions` 23. `refunds` 24.
`payment_allocations`

**Pickup and delivery** 25. `deliveries` 26. `delivery_status_history`

**Authentication and access** 27. `users` 28. `roles` 29. `user_roles`
30. `sessions`

**System** 31. `audit_logs` 32. `app_settings` 33. `idempotency_keys`

Do not add staff/worker tables.

### Schema and data integrity requirements

-   Use SQLite-compatible Drizzle schema definitions.
-   Use `INTEGER PRIMARY KEY` for compact integer IDs unless there is a
    documented reason otherwise.
-   Define explicit foreign keys and appropriate `ON DELETE` behavior.
-   Use `RESTRICT` for financial records and historical business
    records; use `CASCADE` only for dependent records whose deletion is
    safe; use `SET NULL` for optional actor references where
    appropriate.
-   Add indexes for actual query patterns and foreign-key lookup
    columns.
-   Add unique constraints for business identifiers such as customer
    code, order number, invoice number, payment number, service code,
    and role code.
-   Add `CHECK` constraints for non-negative amounts, positive
    quantities, valid flags, and allowed pricing types/statuses where
    practical.
-   Validate all external input with Zod.
-   Add database-level protection as well as application validation for
    critical invariants.
-   Use soft deletion for master/customer records where appropriate. Do
    not hard-delete issued invoices, payments, refunds, or orders.
-   Do not store raw payment-card details, CVV, passwords, bearer
    tokens, or full sensitive gateway payloads.
-   Store password hashes and hashed session tokens only.
-   Use a unique idempotency key scoped to an operation.

### Pricing requirements

Support two pricing bases:

-   `per_item`: quantity is a whole number of pieces.
-   `per_kg`: quantity is integer grams.

Define and document one unambiguous price unit for each pricing type.
Recommended convention: - `per_item`: `unit_price` is paise per item. -
`per_kg`: rate is paise per kilogram and quantity is grams; calculate
with integer arithmetic and a documented rounding rule.

Ensure a weight-based rate-card row can be represented without an item
ID. Do not rely on a normal unique index containing a nullable `item_id`
to prevent duplicate weight-based rows: SQLite permits multiple NULL
values in unique indexes. Use appropriate partial unique indexes or an
explicit non-null pricing key.

Prevent overlapping effective periods for the same applicable rate-card
pricing key through application validation and, if practical, database
constraints/triggers.

At order creation, snapshot item/service descriptions, pricing basis,
quantity, price, discount, taxable value, tax rate, tax split, and final
line total. Later catalog/rate-card/tax changes must not alter
historical orders or issued invoices.

### GST requirements

-   Store tax rates in integer basis points (e.g. 500 = 5%, 1800 = 18%).
-   Store taxable value, CGST, SGST, IGST, and total amounts in paise.
-   Store supplier state code and place-of-supply state code on the
    invoice or another immutable tax document snapshot.
-   Determine intra-state/inter-state treatment from validated business
    configuration and applicable tax rules.
-   Apply rounding consistently at line or invoice level and document
    the rule.
-   Do not infer a tax rate from a service name.
-   Make tax calculation a domain/application service with unit tests.
-   Include HSN/SAC snapshot fields on invoice lines.
-   Treat the schema as technical support for GST, not as legal/tax
    advice.

### Order and billing requirements

-   Support one order with multiple items.
-   Support one or multiple invoices per order if the business later
    needs partial billing.
-   Support partial payments and payment allocation to invoices.
-   A payment can be allocated across invoices only through
    `payment_allocations`.
-   Validate that total allocations do not exceed the captured/settled
    payment amount.
-   Validate that invoice allocations do not exceed the amount due,
    accounting for refunds/credit notes according to the chosen
    accounting model.
-   Do not treat a payment attempt as a successful payment until the
    provider confirms it.
-   Store provider references and transaction status, not raw sensitive
    payloads.
-   Make order creation and payment initiation idempotent.
-   Define clear order, invoice, payment, refund, and delivery state
    machines.
-   Record every order/delivery status transition in its history table.
-   Do not silently recalculate an issued invoice.

### D1 and R2 requirements

-   Bind D1 through the Cloudflare Worker environment.
-   Initialize Drizzle using `drizzle-orm/d1`.
-   Bind R2 through the Worker environment.
-   Use R2 for item/customer images, invoice PDFs, and archived exports.
-   Use D1 for transactional records and R2 keys/metadata only.
-   Use cursor-based pagination for orders, invoices, customers, and
    payments.
-   Avoid unbounded list queries and large `OFFSET` pagination.
-   Keep D1 transactions/batches short.
-   Check D1/SQLite limits and Cloudflare plan limits against current
    official documentation before deployment.
-   Do not assume D1 is a drop-in replacement for PostgreSQL; verify
    supported SQL, transaction, migration, and runtime behavior.
-   Do not use `drizzle-kit push` as the production migration strategy.
    Generate reviewed migrations and apply them through Wrangler D1
    migrations.
-   Enable and verify foreign-key enforcement for the actual D1
    execution path.
-   Include local and remote migration instructions.

### Indexing requirements

Add indexes based on documented query patterns, including:

-   Customer phone and customer code.
-   Customer address by customer ID.
-   Orders by customer and creation date.
-   Orders by status and creation date.
-   Orders by branch and creation date.
-   Order items by order ID.
-   Order status history by order ID and creation date.
-   Rate-card pricing lookup.
-   Invoices by customer/date and order.
-   Payments by customer/date and order.
-   Payment transactions by provider/reference.
-   Payment allocations by invoice and payment.
-   Deliveries by status/scheduled date.
-   Sessions by token hash, user, and expiry.
-   Audit logs by date and entity.

Avoid redundant indexes. Inspect important queries with
`EXPLAIN QUERY PLAN`.

### Retention and capacity requirements

-   Establish a storage monitoring process and alert thresholds at 60%,
    75%, and 85% of the configured capacity ceiling.
-   Measure actual D1 size and growth; do not treat a planning
    allocation as a measured forecast.
-   Keep financial records according to applicable legal/accounting
    retention requirements. Do not automatically delete invoices or
    payment records based only on age.
-   Keep operational history according to an approved retention policy.
-   Use R2 for verified archives and file content.
-   Archive in batches with manifests, record counts, checksums, and
    restore tests.
-   Verify an archive before deleting any eligible source records.
-   Include a documented restore procedure.
-   Avoid storing application logs in D1; use Cloudflare
    logging/observability.

### Deliverables

Produce the following in order:

1.  A reviewed schema inventory and ER diagram.
2.  Complete Drizzle SQLite schema files for all 33 tables.
3.  Shared timestamp/ID conventions and enums/status constants.
4.  All foreign keys, unique constraints, check constraints, and
    indexes.
5.  Seed data for the single default branch, initial roles, settings,
    service categories, item categories, and a default rate card where
    appropriate.
6.  Drizzle configuration and Cloudflare Worker configuration.
7.  Initial migration and a safe migration workflow.
8.  D1 database adapter and R2 storage adapter.
9.  Zod validation schemas.
10. Unit tests for pricing, weight conversion, GST, rounding, and state
    transitions.
11. Integration tests against local D1.
12. Example Hono health and database health endpoints.
13. A storage monitoring and archival plan.
14. Setup, development, migration, deployment, backup/export, and
    restore documentation.

### Quality gates

Before calling the work complete:

-   Run TypeScript type checking.
-   Run linting and tests.
-   Generate migrations from the final schema.
-   Apply migrations to a fresh local D1 database.
-   Verify all expected tables, indexes, constraints, and foreign keys.
-   Test insert/update/delete behavior for each important foreign-key
    policy.
-   Test duplicate business identifiers and idempotency.
-   Test item and weight-based pricing, including rounding edge cases.
-   Test intra-state CGST/SGST and inter-state IGST examples using
    configurable test rates.
-   Test partial payments, allocations, failed payments, refunds, and
    invoice immutability.
-   Verify R2 file upload/download using object keys stored in D1.
-   Review important query plans and pagination.
-   Document all known limitations and unresolved business decisions.

Do not claim a feature is implemented or tested unless the corresponding
code and test results exist. Do not silently invent business rules. Ask
for clarification when a decision materially affects financial
correctness or data integrity.

------------------------------------------------------------------------

# PART B --- IMPLEMENTATION PLAN

## 3. Phase-by-phase delivery plan

### Phase 0 --- Repository and environment audit

**Goal:** Understand the current project and establish a clean starting
point.

Tasks: - Inspect the existing repository, package manager, deployment
setup, and current Worker entry point. - Identify code that must be
removed versus reusable configuration. - Confirm the Cloudflare account
plan and D1 database size limit. - Confirm whether existing
customer/order data must be migrated or whether this is a fresh
database. - Create a new branch and baseline commit. - Record the
selected Node.js and package-manager versions.

**Exit criteria:** Agreed repository structure, runtime versions,
deployment environment, and data migration decision.

### Phase 1 --- Project foundation

**Goal:** Establish Hono, Workers, D1, Drizzle, and Clean Architecture.

Tasks: - Configure TypeScript and Wrangler. - Create the D1 database and
R2 bucket. - Add Drizzle ORM and Drizzle Kit. - Create the application
composition root and dependency injection. - Add environment bindings
and secret management. - Add `/health` and `/health/database`. - Add
error handling, request IDs, and structured logging.

**Exit criteria:** Worker runs locally, connects to local D1, and
deploys to a non-production environment.

### Phase 2 --- Schema and migrations

**Goal:** Establish the complete relational foundation.

Tasks: - Implement all 33 schema tables. - Define foreign keys and
deletion policies. - Define indexes and unique constraints. - Add checks
for amounts, quantities, and valid pricing/tax values. - Generate and
review the initial migration. - Seed one default branch and required
reference data. - Test a fresh local database migration.

**Exit criteria:** Fresh D1 database can be created entirely from
reviewed migrations and seed scripts.

### Phase 3 --- Customer and catalog

**Goal:** Build the master data APIs.

Tasks: - Customer create/read/update and controlled deactivation. -
Customer address management. - Customer preferences. - Item categories
and items. - Service categories and services. - R2 image upload and
metadata management. - Search, filtering, and cursor pagination.

**Exit criteria:** Customer and catalog use cases pass unit and
integration tests.

### Phase 4 --- Pricing and GST

**Goal:** Make pricing deterministic and auditable.

Tasks: - Rate-card CRUD and activation. - Customer-specific rate-card
assignment. - Item-wise price lookup. - Weight-based price lookup. -
Effective-date validation. - GST configuration and tax calculation
service. - Integer arithmetic and rounding tests. - Price/tax snapshot
creation.

**Exit criteria:** Test cases prove that later rate-card or tax changes
do not modify historical order values.

### Phase 5 --- Order management

**Goal:** Implement reliable order creation and lifecycle management.

Tasks: - Create an order with multiple line items. - Validate customer,
item, service, rate card, and address. - Calculate item and weight-based
lines. - Snapshot pricing and GST. - Create order status history. - Add
notes and adjustments. - Add idempotency. - Implement customer order
history and admin order listing.

**Exit criteria:** Order creation is atomic, repeat-safe, and
financially reproducible.

### Phase 6 --- Billing and payments

**Goal:** Implement invoices and payment accounting.

Tasks: - Invoice creation and numbering. - Immutable issued invoice
lines. - GST breakdown and place-of-supply snapshots. - Partial payment
support. - Payment allocations. - Payment provider adapter and webhook
verification. - Refund workflow. - Reconciliation and duplicate-webhook
protection. - R2 invoice PDF generation/storage if required.

**Exit criteria:** Partial payments, failed transactions, duplicate
callbacks, refunds, and invoice immutability pass tests.

### Phase 7 --- Pickup and delivery

**Goal:** Manage collection and return delivery.

Tasks: - Create pickup and delivery records. - Snapshot delivery
addresses. - Schedule delivery. - Track delivery status transitions. -
Add customer-facing delivery status queries.

**Exit criteria:** Delivery state transitions are recorded and
queryable.

### Phase 8 --- Storage, observability, and release

**Goal:** Prepare for production operation within the D1 storage budget.

Tasks: - Record database-size measurements. - Establish 60%, 75%, and
85% alert thresholds. - Review indexes and query plans. - Verify cursor
pagination. - Define retention and archival policies. - Build R2 archive
manifests and restore tests. - Configure production secrets and
bindings. - Run security and release checks.

**Exit criteria:** Production checklist, migration procedure,
monitoring, and restore procedure are documented and tested.

------------------------------------------------------------------------

## 4. Suggested initial API inventory

Use versioned routes under `/api/v1`.

  -----------------------------------------------------------------------
  Module                              Example endpoints
  ----------------------------------- -----------------------------------
  Health                              `GET /health`,
                                      `GET /health/database`

  Customers                           `POST /customers`,
                                      `GET /customers`,
                                      `GET /customers/:id`,
                                      `PATCH /customers/:id`

  Addresses                           `POST /customers/:id/addresses`,
                                      `GET /customers/:id/addresses`

  Categories                          `GET /item-categories`,
                                      `POST /item-categories`

  Items                               `GET /items`, `POST /items`,
                                      `PATCH /items/:id`

  Services                            `GET /services`, `POST /services`

  Rate cards                          `GET /rate-cards`,
                                      `POST /rate-cards`,
                                      `POST /rate-cards/:id/items`

  Pricing                             `POST /pricing/quote`

  Orders                              `POST /orders`, `GET /orders`,
                                      `GET /orders/:id`,
                                      `PATCH /orders/:id/status`

  Invoices                            `POST /orders/:id/invoices`,
                                      `GET /invoices/:id`

  Payments                            `POST /payments`,
                                      `GET /payments/:id`,
                                      `POST /payments/:id/refunds`

  Deliveries                          `POST /orders/:id/deliveries`,
                                      `GET /deliveries`,
                                      `PATCH /deliveries/:id/status`
  -----------------------------------------------------------------------

These are API design examples. Confirm authorization and business rules
before implementing each endpoint.

------------------------------------------------------------------------

## 5. Core business rules to settle

The following details should be confirmed with the business owner before
production:

1.  Can one order contain both per-item and per-kilogram lines?
    Recommended: yes.
2.  Is weight measured before or after washing? Define the operational
    measurement point.
3.  Can an order receive multiple invoices? Recommended: support it in
    the schema.
4.  Can one payment cover multiple invoices? Recommended: support it
    through payment allocations.
5.  What event makes an invoice final/issued?
6.  Which GST registration and state code represent the supplier?
7.  What are the applicable HSN/SAC classifications and GST rates for
    each service?
8.  Are discounts applied before GST? Confirm the applicable tax
    treatment.
9.  What is the cancellation and refund policy?
10. Must any existing production data be migrated?

Do not assume the answers to tax or accounting questions.

------------------------------------------------------------------------

## 6. D1 storage and retention plan

### Storage principles

-   D1 stores structured business data.
-   R2 stores images, PDFs, and archive files.
-   Avoid BLOBs and Base64 content in D1.
-   Store only necessary payment-provider references.
-   Keep logs in Cloudflare observability tooling rather than
    transactional tables.
-   Use cursor pagination and bounded query results.
-   Keep indexes aligned with measured query patterns.

### Proposed retention starting points

These are operational suggestions, not legal retention advice.

  -----------------------------------------------------------------------
  Data                                Proposed treatment
  ----------------------------------- -----------------------------------
  Customer and address records        Retain while needed for service,
                                      accounting, and legal purposes

  Orders and order items              Keep operationally accessible;
                                      archive after an approved period

  Order status history                Retain detailed history according
                                      to operational needs

  Issued invoices                     Retain according to applicable
                                      tax/accounting requirements

  Payments and refunds                Retain according to applicable
                                      financial requirements

  Idempotency keys                    Expire after the configured
                                      retry/replay window

  Sessions                            Expire and periodically clean up

  Audit logs                          Retain according to security and
                                      compliance policy

  Images and PDFs                     R2 lifecycle/retention policy,
                                      subject to business/legal
                                      requirements
  -----------------------------------------------------------------------

Never delete invoices, payment records, or other legally required
financial evidence solely to remain under a storage target.

### Capacity alerts

  -----------------------------------------------------------------------
  Database utilization                Action
  ----------------------------------- -----------------------------------
  60%                                 Review monthly growth and index
                                      footprint

  75%                                 Prepare and test archive/retention
                                      operations

  85%                                 Execute approved capacity plan;
                                      consider plan upgrade or database
                                      migration
  -----------------------------------------------------------------------

Measure actual D1 storage. The allocation is not a prediction of actual
usage.

------------------------------------------------------------------------

## 7. Migration and release checklist

### Local development

-   [ ] Install dependencies and pin compatible versions.
-   [ ] Configure Wrangler and local D1.
-   [ ] Generate Drizzle migrations.
-   [ ] Review generated SQL.
-   [ ] Apply migrations to a fresh local database.
-   [ ] Run seed scripts.
-   [ ] Run type checking and linting.
-   [ ] Run unit and integration tests.

### Staging

-   [ ] Create staging D1 and R2 resources.
-   [ ] Apply reviewed migrations.
-   [ ] Configure secrets.
-   [ ] Test customer/order/billing flows.
-   [ ] Test payment webhooks and idempotency.
-   [ ] Verify R2 upload/download.
-   [ ] Inspect query plans and storage metrics.

### Production

-   [ ] Confirm backup/export and restore procedure.
-   [ ] Confirm Cloudflare plan and database limits.
-   [ ] Review GST configuration with the business/tax advisor.
-   [ ] Apply migrations during an approved release window.
-   [ ] Verify health endpoints.
-   [ ] Verify monitoring and alerts.
-   [ ] Verify a tested rollback/recovery approach.

------------------------------------------------------------------------

## 8. Recommended implementation order

Do not build all modules at once. Work in small, reviewable increments:

1.  Repository audit and environment setup.
2.  D1/Drizzle foundation.
3.  Schema and initial migrations.
4.  Customer module.
5.  Catalog and service module.
6.  Rate cards and pricing engine.
7.  GST calculation service.
8.  Order module.
9.  Invoice and payment modules.
10. Pickup and delivery.
11. R2 documents and archival.
12. Monitoring, security, and production release.

**First milestone:** A clean Hono.js Worker that connects to D1, applies
the initial reviewed migration, seeds the default branch, and passes
schema/integrity tests.

**Second milestone:** Customer, catalog, and pricing APIs.

**Third milestone:** Order creation with correct item/weight pricing and
GST snapshots.

------------------------------------------------------------------------

## 9. Important technical review notes

Before generating the first production migration, verify these details
in the actual code:

-   The table inventory contains **33 tables**, including `branches` and
    `tax_rates`.
-   `invoice_items.order_item_id` must reference `order_items.id`, not
    `orders.id`.
-   `order_status_history.changed_by_user_id` should reference
    `users.id` if the actor is an application user.
-   A nullable `item_id` in weight-based rate-card rows needs a suitable
    partial unique index or explicit pricing key; a conventional unique
    index does not prevent multiple NULL entries in SQLite.
-   Effective-date overlaps need application-level validation and
    suitable database protection.
-   Payment allocations must be checked against both payment
    availability and invoice balance.
-   A payment-provider webhook must be signature-verified and
    idempotent.
-   GST calculation and rounding rules need explicit tests and
    tax-advisor validation.
-   Confirm foreign-key enforcement, D1 transaction behavior, and
    Drizzle support against the current Cloudflare/Drizzle
    documentation.
-   The exact Cloudflare D1 storage ceiling depends on the account plan;
    verify it in the account before production.

**Definition of done:** The initial schema can be applied to a fresh D1
database, all expected constraints and indexes are present, tests pass,
and no business use case depends directly on Hono or Drizzle.

------------------------------------------------------------------------

## 10. Official documentation

-   Cloudflare D1: https://developers.cloudflare.com/d1/
-   Cloudflare D1 limits:
    https://developers.cloudflare.com/d1/platform/limits/
-   Cloudflare Workers: https://developers.cloudflare.com/workers/
-   Cloudflare R2: https://developers.cloudflare.com/r2/
-   Hono: https://hono.dev/
-   Drizzle ORM D1: https://orm.drizzle.team/docs/connect-cloudflare-d1
-   Drizzle Kit migrations: https://orm.drizzle.team/docs/kit-overview
