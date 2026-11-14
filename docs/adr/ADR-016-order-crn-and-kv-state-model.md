# ADR-016: Order CRN Identifier and Cloudflare KV State Model (Decoupled from D1)

**Status:** Accepted — Approved by project owner on 2026-11-14.  
**Date:** 2026-11-14  
**Deciders:** Project owner  
**Related:** ADR-002, ADR-003, ADR-013, ADR-015, `specs/constitution.md` §1, §3, §4

---

## Context

In our multi-tenant laundry platform, the project owner directed:
1. **CRN (Compact Reference Number) Identifier System:**
   - 32-bit compact bitfield: 9 bits for `tenant_id` ($0 \dots 511$), 4 bits for `hub_id` ($0 \dots 15$), and 19 bits for `order_id` ($0 \dots 524,287$).
   - Canonical URN: `crn:tenant_id:hub_id:order_id`.
2. **State Model Decoupled from D1 into Cloudflare KV:**
   - **The project owner directed that state management is NOT managed in D1.**
   - Instead, Cloudflare KV (`ORDER_STATE_KV`) maintains the order state model.
   - **Key:** `crn_id` (e.g. `crn:1:0:42`).
   - **Value:** State snapshot tracking:
     - `previousState`: the state before the last transition.
     - `currentState`: the active operational status.
     - `intent`: the transition action triggering the change.
     - `changedAt`: UTC timestamp.
     - `diagnostic`: flow status (`"healthy" | "held" | "broken" | "cancelled"`), failure reason, and broken step.
   - Frontline staff and operators query KV directly to understand why an order flow is broken or stalled in sub-millisecond latency.

---

## Decision

1. **Constitutional Amendment (§1 and ADR-002):**
   - Cloudflare KV (`ORDER_STATE_KV`) is adopted as the dedicated order state store.
   - D1 stores entity data (customer, items, delivery slots, pricing, CRN, timestamps), but **state management is owned by Cloudflare KV**.
   - State queries and state transitions write to and read from `ORDER_STATE_KV` keyed by `crn_id`.

2. **CRN Bitfield Allocation (`packages/contracts/src/crn.ts`):**
   - 9 bits for `tenant_id` (0..511)
   - 4 bits for `hub_id` (0..15)
   - 19 bits for `order_id` (0..524,287)
   - Total: 32 bits ($9 + 4 + 19 = 32$).
   - Canonical format: `crn:${tenantId}:${hubId}:${orderId}`.

3. **D1 Schema (`migrations/laundry/0006_order_crn.sql`):**
   - Add `seq_id` to `tenants` (9-bit sequence 0..511).
   - Add `seq_id` to `hubs` (4-bit sequence 0..15).
   - Add `crn_id TEXT UNIQUE`, `crn_packed INTEGER`, and `seq_id INTEGER` to `orders`.
   - Add `hub_order_counters` table for monotonic, atomic 19-bit sequence allocation per hub.

4. **Order State Lifecycle & Diagnostics in KV:**
   - Key: `crn_id`
   - Value: `OrderStateSnapshot`:
     - `{ crnId, orderId, tenantId, hubId, previousState, currentState, intent, version, changedAt, actor, diagnostic }`
   - Transitions validate against the state machine; if a transition is invalid or blocked, KV records `diagnostic.status = "broken"` with `diagnostic.brokenStep` and `diagnostic.reason` so operators immediately know why the flow is broken.

5. **CRUD Operations:**
   - **Create:** `POST /api/orders` — reserves next sequence, generates CRN, writes order to D1, initializes KV state (`previousState: null, currentState: "confirmed"`).
   - **Read:** `GET /api/orders` & `GET /api/orders/:id` — loads order and resolves live state from KV. `GET /api/orders/:id/state` reads diagnostic snapshot from KV directly.
   - **Update / Mutate:** `POST /api/orders/:id/transition` & `POST /api/orders/apply-change` — updates KV state (`previousState` -> `currentState`), records diagnostics.
   - **Delete / Cancel:** `DELETE /api/orders/:id` — sets KV `currentState: "cancelled"` and marks cancelled in D1.
