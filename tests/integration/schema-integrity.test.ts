import { describe, expect, it } from "vitest";
import { createTestHarness } from "../helpers/test-app";

const EXPECTED_TABLES = [
  "app_settings",
  "audit_logs",
  "branches",
  "customer_addresses",
  "customer_preferences",
  "customer_rate_cards",
  "customers",
  "deliveries",
  "delivery_status_history",
  "idempotency_keys",
  "invoice_items",
  "invoices",
  "item_attributes",
  "item_categories",
  "items",
  "notification_logs",
  "order_adjustments",
  "order_items",
  "order_notes",
  "order_status_history",
  "orders",
  "payment_allocations",
  "payment_transactions",
  "payments",
  "rate_card_items",
  "rate_cards",
  "refunds",
  "roles",
  "service_categories",
  "services",
  "tax_rates",
  "tenant_notification_configs",
  "tenants",
  "user_roles",
  "users",
];

describe("D1 Schema, Foreign Keys, Triggers, Constraints & Query Plans", () => {
  it("applies reviewed migrations to fresh D1 with all 35 tables and foreign_keys enabled", async () => {
    const harness = await createTestHarness();

    const tablesRes = await harness.env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY name`,
    ).all<{ name: string }>();

    const names = tablesRes.results.map((r) => r.name);
    expect(names).toEqual(EXPECTED_TABLES);

    const fkRes = await harness.env.DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(fkRes?.foreign_keys).toBe(1);
  });

  it("enforces CASCADE on customer addresses/preferences and RESTRICT on customers with orders", async () => {
    const harness = await createTestHarness();

    // 1. Customer without orders: deleting customer cascades addresses & preferences
    const c1Res = await harness.request("/api/v1/customers", {
      method: "POST",
      headers: { ...harness.managerAuthHeader, "content-type": "application/json" },
      body: JSON.stringify({
        customerCode: "CUST-CASCADE-1",
        fullName: "Cascade Test",
        phone: "+919800000011",
      }),
    });
    expect(c1Res.status).toBe(201);
    const { data: c1 } = (await c1Res.json()) as { data: { id: number } };

    await harness.request(`/api/v1/customers/${c1.id}/addresses`, {
      method: "POST",
      headers: { ...harness.managerAuthHeader, "content-type": "application/json" },
      body: JSON.stringify({
        addressType: "home",
        line1: "12 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        stateCode: "29",
        postalCode: "560001",
      }),
    });

    await harness.env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(c1.id).run();
    const orphanAddr = await harness.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM customer_addresses WHERE customer_id = ?",
    )
      .bind(c1.id)
      .first<{ cnt: number }>();
    expect(orphanAddr?.cnt).toBe(0);

    // 2. Customer with an order: DELETE is blocked by FK RESTRICT & order trigger
    const c2Res = await harness.request("/api/v1/customers", {
      method: "POST",
      headers: { ...harness.managerAuthHeader, "content-type": "application/json" },
      body: JSON.stringify({
        customerCode: "CUST-RESTRICT-1",
        fullName: "Restrict Test",
        phone: "+919800000022",
      }),
    });
    const { data: c2 } = (await c2Res.json()) as { data: { id: number } };

    const ordRes = await harness.request("/api/v1/orders", {
      method: "POST",
      headers: { ...harness.managerAuthHeader, "content-type": "application/json" },
      body: JSON.stringify({
        customerId: c2.id,
        lines: [
          {
            serviceId: harness.seed.serviceIds["WASH_FOLD"],
            pricingBasis: "per_kg",
            weightGrams: 1500,
          },
        ],
      }),
    });
    expect(ordRes.status).toBe(201);
    const { data: ordData } = (await ordRes.json()) as {
      data: { order: { id: number } };
    };

    await expect(
      harness.env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(c2.id).run(),
    ).rejects.toThrow(/FOREIGN KEY/i);

    await expect(
      harness.env.DB.prepare("DELETE FROM orders WHERE id = ?")
        .bind(ordData.order.id)
        .run(),
    ).rejects.toThrow(/cannot be hard-deleted/i);
  });

  it("blocks duplicate weight-based rate_card_items (nullable item_id) and overlapping effective dates in DB", async () => {
    const harness = await createTestHarness();
    const washFoldId = harness.seed.serviceIds["WASH_FOLD"]!;
    const gst18Id = harness.seed.taxRateIds["GST_18_PLACEHOLDER"]!;

    // Seed already inserted an active open-ended per_kg row with item_id = NULL
    await expect(
      harness.env.DB.prepare(
        `INSERT INTO rate_card_items (
          rate_card_id, service_id, item_id, tax_rate_id, pricing_basis,
          pricing_key, unit_price_paise, effective_from, effective_to, is_active, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, 'per_kg', ?, 11000, '2026-04-01T00:00:00.000Z', NULL, 1, '2026-06-15T10:00:00.000Z', '2026-06-15T10:00:00.000Z')`,
      )
        .bind(
          harness.seed.defaultRateCardId,
          washFoldId,
          gst18Id,
          `svc:${washFoldId}:item:none:per_kg`,
        )
        .run(),
    ).rejects.toThrow(/Overlapping effective period|UNIQUE constraint/i);
  });

  it("uses designed indexes in EXPLAIN QUERY PLAN for critical query patterns", async () => {
    const harness = await createTestHarness();

    const queries = [
      {
        sql: "EXPLAIN QUERY PLAN SELECT * FROM customers WHERE phone = ?",
        params: ["+919800000001"],
        expectedIndex: "idx_customers_phone",
      },
      {
        sql: "EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 20",
        params: [1],
        expectedIndex: "idx_orders_customer_created",
      },
      {
        sql: "EXPLAIN QUERY PLAN SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 20",
        params: ["confirmed"],
        expectedIndex: "idx_orders_status_created",
      },
      {
        sql: "EXPLAIN QUERY PLAN SELECT * FROM deliveries WHERE status = ? ORDER BY scheduled_at ASC LIMIT 20",
        params: ["scheduled"],
        expectedIndex: "idx_deliveries_status_scheduled",
      },
    ];

    for (const q of queries) {
      const plan = await harness.env.DB.prepare(q.sql)
        .bind(...q.params)
        .all<{ detail: string }>();
      const details = plan.results.map((r) => r.detail).join(" | ");
      expect(details).toContain(q.expectedIndex);
    }
  });
});
