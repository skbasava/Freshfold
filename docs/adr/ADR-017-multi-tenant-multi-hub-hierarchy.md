# ADR-017: Multi-Tenant and Multi-Hub Hierarchy with Scoped Customers, Rate Cards, and Orders

**Status:** Proposed (Awaiting Approval)  
**Date:** 2026-11-20  
**Deciders:** Project owner  
**Related:** ADR-003, ADR-011, ADR-013, ADR-015, ADR-016, `specs/constitution.md` §12, §13  

---

## Context

The Laundry ERP operates across multiple business organizations (Tenants). Each Tenant may operate multiple laundry facilities or retail intake points (Hubs).

The project owner directed:
1. **Multi-Tenant Hierarchy:** Each Tenant has multiple Hubs.
2. **Hub Scoping:** Each Hub owns its registered Customers and customer Orders.
3. **Hub & Tenant Specific Rate Cards:** Rate Cards are scoped per Tenant and per Hub. Pricing per item and per service can differ across different hubs under the same tenant (e.g. city-center hub vs airport hub vs suburban franchise hub).
4. **Data Isolation:** All operations (order creation, customer lookup, queue metrics, rate cards, and billing transactions) must enforce strict Tenant and Hub boundaries.

---

## Decision

1. **Schema & Entity Relationships:**
   - Add `tenants` table to `LAUNDRY_DB` D1 database.
   - Associate `branches` (Hubs) with `tenant_id` (`FOREIGN KEY REFERENCES tenants(id)`).
   - Associate `rate_cards` with `tenant_id` and `branch_id` (`hub_id`).
   - Associate `customers` with `tenant_id` and `branch_id` (`hub_id`).
   - Associate `orders` with `tenant_id`, `branch_id` (`hub_id`), `customer_id`, and `rate_card_id`.
   - Associate staff `users` with `tenant_id` and `branch_id` (`hub_id`).

2. **D1 Migration Strategy:**
   - Author a backward-compatible migration (`migrations/api/0002_multi_tenant_hub.sql`).
   - Pre-populate default tenant `FreshFold India` (`TENANT-001`), linking existing default branch `MAIN` to `tenant_id = 1`.
   - Backfill existing customers, rate cards, and orders to `tenant_id = 1`.

3. **Rate Card Scoping:**
   - Queries to `/api/v1/rate-cards` filter by `tenant_id = ? AND branch_id = ?`.
   - Order write path (`applyChange()` and `createOrder()`) validates that the selected `rateCardId` belongs to the order's `tenant_id` and `branch_id`.

4. **Session & Gateway Contract:**
   - `GET /api/me` returns `tenant`, active `hub`, and `availableHubs`.
   - Frontend sets `x-tenant-id` and `x-hub-id` headers on all authenticated API requests.
   - Server middleware validates that the authenticated staff actor is authorized for the requested `hub_id` within their `tenant_id`.

5. **FreshFold UI Implementation:**
   - **TopNavbarBlock**: Add interactive Tenant & Hub switcher dropdown in the navigation header.
   - **CreateOrderPage (POS)**: Automatically binds customer search and garment prices to the active Hub's rate card.
   - **ItemsPage**: Provide Hub selector tabs to inspect and edit rates per hub.
   - **SettingsPage**: Add "Hubs & Branches" management panel to configure store details, addresses, and rate card defaults.

---

## Consequences

### Positive
- Fully fulfills multi-store laundry business requirements: single portal manages multiple branches with distinct regional rate cards.
- Clean database-enforced integrity preventing cross-hub data leakage.
- Counter staff can easily operate their specific hub while managers/super-admins can switch across hubs in real-time.

### Negative and risks
- Requires schema migration in D1 and updating repository queries to filter by both `tenant_id` and `branch_id`.
- Requires test suite updates to assert multi-tenant/hub isolation.
