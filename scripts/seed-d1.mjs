import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const d1Dir = path.join(
  rootDir,
  "workers",
  "laundry",
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);

function deriveCustomerId(hubId, phoneNormalized) {
  const hash = crypto
    .createHash("sha256")
    .update(`${hubId}:${phoneNormalized}`)
    .digest("hex");
  return `cust_${hash.slice(0, 32)}`;
}

function parseKolkataDate(dateStr, timeStr) {
  // e.g. "2026-11-13", "09:00" -> epoch ms in Asia/Kolkata (+05:30)
  return Date.parse(`${dateStr}T${timeStr}:00+05:30`);
}

function getTodayKolkata() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function seedDatabase(dbPath) {
  console.log(`Seeding SQLite database: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  // Check if tables exist
  const tableCheck = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'")
    .get();
  if (!tableCheck) {
    console.log("Tenants table does not exist in this database. Skipping.");
    db.close();
    return;
  }

  const now = Date.now();
  const todayKey = getTodayKolkata();
  const tomorrowDate = new Date(Date.now() + 86400000);
  const tomorrowFormatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const tParts = tomorrowFormatter.formatToParts(tomorrowDate);
  const tGet = (type) => tParts.find((p) => p.type === type)?.value ?? "";
  const tomorrowKey = `${tGet("year")}-${tGet("month")}-${tGet("day")}`;

  const tenantId = "tenant-1";
  const hubId = "hub-1";
  const branchId = "branch-1";

  // 1. Tenant
  const hasTenantSlug = db
    .prepare("PRAGMA table_info(tenants)")
    .all()
    .some((col) => col.name === "slug");

  if (hasTenantSlug) {
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, created_at, slug, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tenantId, "FreshFold", now, "freshfold", now);
  } else {
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, created_at)
      VALUES (?, ?, ?)
    `).run(tenantId, "FreshFold", now);
  }

  // 2. Hub
  db.prepare(`
    INSERT OR REPLACE INTO hubs (id, tenant_id, name, timezone, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hubId, tenantId, "Main Hub", "Asia/Kolkata", now);

  // Check if branches table exists
  const hasBranches = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='branches'")
    .get();
  if (hasBranches) {
    db.prepare(`
      INSERT OR REPLACE INTO branches (id, tenant_id, name, code, address, is_active, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      branchId,
      tenantId,
      "Main Branch - Bandra",
      "MB-01",
      "Plot 42, Hill Road, Bandra West, Mumbai, MH 400050",
      1,
      1,
      now,
      now,
    );
  }

  // Check if services table exists
  const hasServices = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'")
    .get();
  const serviceDefs = [
    { id: "srv-wash-fold", name: "Wash & Fold", unit: "kg", price: 12000 },
    { id: "srv-wash-iron", name: "Wash & Iron", unit: "piece", price: 5000 },
    { id: "srv-dry-clean", name: "Dry Clean", unit: "piece", price: 25000 },
    { id: "srv-steam-press", name: "Steam Press", unit: "piece", price: 3500 },
  ];
  if (hasServices) {
    for (const s of serviceDefs) {
      db.prepare(`
        INSERT OR REPLACE INTO services (id, tenant_id, name, description, pricing_unit, unit_price_minor, is_active, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(s.id, tenantId, s.name, `${s.name} service`, s.unit, s.price, 1, 1, now, now);
    }
  }

  // 3. Delivery Slots
  const slotHours = [
    { start: "09:00", end: "11:00", cap: 10 },
    { start: "11:00", end: "13:00", cap: 10 },
    { start: "14:00", end: "16:00", cap: 10 },
    { start: "16:00", end: "18:00", cap: 10 },
    { start: "18:00", end: "20:00", cap: 8 },
  ];

  const slotsMap = new Map();

  for (const dateKey of [todayKey, tomorrowKey]) {
    for (const sh of slotHours) {
      const slotId = `slot-${dateKey}-${sh.start.replace(":", "")}`;
      const slotKey = `${dateKey}_${sh.start}`;
      const startsAt = parseKolkataDate(dateKey, sh.start);
      const endsAt = parseKolkataDate(dateKey, sh.end);

      db.prepare(`
        INSERT OR REPLACE INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(slotId, hubId, slotKey, dateKey, sh.start, startsAt, endsAt, sh.cap, 1, now);

      slotsMap.set(slotKey, { id: slotId, startsAt, endsAt });
    }
  }

  // 4. Customers
  const customerDefs = [
    { name: "Rajesh Kumar", phone: "+919820112345", email: "rajesh.kumar@example.com", notes: "Prefers eco-friendly detergent" },
    { name: "Sneha Sharma", phone: "+919820223456", email: "sneha.sharma@example.com", notes: "Delicate silks only" },
    { name: "Amit Patel", phone: "+919820334567", email: "amit.patel@example.com", notes: "Heavy starch on collars" },
    { name: "Priya Iyer", phone: "+919820445678", email: "priya.iyer@example.com", notes: "Call before delivery" },
    { name: "Vikram Malhotra", phone: "+919820556789", email: "vikram.m@example.com", notes: "Deliver to security desk" },
    { name: "Ananya Deshmukh", phone: "+919820667890", email: "ananya.d@example.com", notes: "Express handling preferred" },
  ];

  const hasCustomersTenantCol = db
    .prepare("PRAGMA table_info(customers)")
    .all()
    .some((col) => col.name === "tenant_id");

  const customers = [];
  for (const c of customerDefs) {
    const custId = deriveCustomerId(hubId, c.phone);
    if (hasCustomersTenantCol) {
      db.prepare(`
        INSERT OR REPLACE INTO customers (id, hub_id, name, phone, phone_normalized, notes, created_at, updated_at, tenant_id, branch_id, email, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(custId, hubId, c.name, c.phone, c.phone, c.notes, now, now, tenantId, branchId, c.email, 1);
    } else {
      db.prepare(`
        INSERT OR REPLACE INTO customers (id, hub_id, name, phone, phone_normalized, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(custId, hubId, c.name, c.phone, c.phone, c.notes, now, now);
    }
    customers.push({ id: custId, ...c });
  }

  // 5. Orders
  const todaySlot11 = slotsMap.get(`${todayKey}_11:00`);
  const todaySlot14 = slotsMap.get(`${todayKey}_14:00`);
  const todaySlot16 = slotsMap.get(`${todayKey}_16:00`);
  const todaySlot18 = slotsMap.get(`${todayKey}_18:00`);
  const todaySlot09 = slotsMap.get(`${todayKey}_09:00`);
  const tomorrowSlot11 = slotsMap.get(`${tomorrowKey}_11:00`);

  const orderDefs = [
    {
      id: "ord-1001",
      customer: customers[0],
      status: "confirmed",
      serviceType: "Wash & Fold",
      serviceId: "srv-wash-fold",
      slot: todaySlot14,
      items: [
        { desc: "Formal Shirts", qty: 4, unitPrice: 3000 },
        { desc: "Trousers", qty: 2, unitPrice: 4000 },
      ],
      holdComment: null,
      notes: "Door delivery requested",
    },
    {
      id: "ord-1002",
      customer: customers[1],
      status: "processing",
      serviceType: "Dry Clean",
      serviceId: "srv-dry-clean",
      slot: todaySlot16,
      items: [
        { desc: "Silk Saree with Zari", qty: 2, unitPrice: 25000 },
      ],
      holdComment: null,
      notes: "Dry clean with tissue wrapping",
    },
    {
      id: "ord-1003",
      customer: customers[2],
      status: "hold",
      serviceType: "Wash & Iron",
      serviceId: "srv-wash-iron",
      slot: todaySlot18,
      items: [
        { desc: "Winter Blazer", qty: 1, unitPrice: 15000 },
        { desc: "Linen Dress Shirts", qty: 3, unitPrice: 5000 },
      ],
      holdComment: "Waiting for stain treatment confirmation from customer",
      notes: "Coffee mark on right sleeve",
    },
    {
      id: "ord-1004",
      customer: customers[3],
      status: "out_for_delivery",
      serviceType: "Wash & Fold",
      serviceId: "srv-wash-fold",
      slot: todaySlot11,
      items: [
        { desc: "Double Bed Sheet Set", qty: 4, unitPrice: 6000 },
        { desc: "Pillow Covers", qty: 8, unitPrice: 1500 },
      ],
      holdComment: null,
      notes: "Call customer on arrival",
    },
    {
      id: "ord-1005",
      customer: customers[4],
      status: "delivered",
      serviceType: "Steam Press",
      serviceId: "srv-steam-press",
      slot: todaySlot09,
      deliveredAt: todaySlot09.startsAt + 45 * 60 * 1000,
      items: [
        { desc: "Two-Piece Suits", qty: 3, unitPrice: 7000 },
      ],
      holdComment: null,
      notes: "Delivered to reception",
    },
    {
      id: "ord-1006",
      customer: customers[5],
      status: "confirmed",
      serviceType: "Dry Clean",
      serviceId: "srv-dry-clean",
      slot: tomorrowSlot11,
      items: [
        { desc: "Evening Gown", qty: 2, unitPrice: 20000 },
      ],
      holdComment: null,
      notes: "Deliver tomorrow before noon",
    },
  ];

  const hasOrdersTenantCol = db
    .prepare("PRAGMA table_info(orders)")
    .all()
    .some((col) => col.name === "tenant_id");

  for (const o of orderDefs) {
    const totalMinor = o.items.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
    const createdAt = now - Math.floor(Math.random() * 7200000);

    if (hasOrdersTenantCol) {
      db.prepare(`
        INSERT OR REPLACE INTO orders (
          id, hub_id, customer_id, status, service_type,
          delivery_slot_id, delivery_at, version, last_mutation_id,
          last_notified_delivery_at, hold_comment, created_at, updated_at,
          cancelled_at, tenant_id, branch_id, order_number, payment_status,
          subtotal_minor, discount_minor, tax_minor, total_minor,
          received_at, promised_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `).run(
        o.id,
        hubId,
        o.customer.id,
        o.status,
        o.serviceType,
        o.slot ? o.slot.id : null,
        o.slot ? o.slot.startsAt : null,
        1,
        `seed_mut_${o.id}`,
        null,
        o.holdComment,
        createdAt,
        now,
        null,
        tenantId,
        branchId,
        o.id.toUpperCase(),
        o.status === "delivered" ? "paid" : "unpaid",
        totalMinor,
        0,
        0,
        totalMinor,
        createdAt,
        o.slot ? o.slot.startsAt : null,
      );
    } else {
      db.prepare(`
        INSERT OR REPLACE INTO orders (
          id, hub_id, customer_id, status, service_type,
          delivery_slot_id, delivery_at, version, last_mutation_id,
          last_notified_delivery_at, hold_comment, created_at, updated_at,
          cancelled_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?
        )
      `).run(
        o.id,
        hubId,
        o.customer.id,
        o.status,
        o.serviceType,
        o.slot ? o.slot.id : null,
        o.slot ? o.slot.startsAt : null,
        1,
        `seed_mut_${o.id}`,
        null,
        o.holdComment,
        createdAt,
        now,
        null,
      );
    }

    // Order items
    db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(o.id);
    const hasOrderItemsTenantCol = db
      .prepare("PRAGMA table_info(order_items)")
      .all()
      .some((col) => col.name === "tenant_id");

    for (let i = 0; i < o.items.length; i++) {
      const itm = o.items[i];
      const itemId = `item-${o.id}-${i + 1}`;
      if (hasOrderItemsTenantCol) {
        db.prepare(`
          INSERT INTO order_items (
            id, hub_id, order_id, description, quantity,
            service_type, created_at, tenant_id, service_id,
            unit_price_minor, line_total_minor, version, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId,
          hubId,
          o.id,
          itm.desc,
          itm.qty,
          o.serviceType,
          createdAt,
          tenantId,
          o.serviceId,
          itm.unitPrice,
          itm.qty * itm.unitPrice,
          1,
          now,
        );
      } else {
        db.prepare(`
          INSERT INTO order_items (
            id, hub_id, order_id, description, quantity,
            service_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId,
          hubId,
          o.id,
          itm.desc,
          itm.qty,
          o.serviceType,
          createdAt,
        );
      }
    }

    // Order Event
    db.prepare(`
      INSERT OR REPLACE INTO order_events (
        id, hub_id, order_id, mutation_id, payload_hash,
        event_type, source, actor_type, actor_id,
        previous_version, new_version, at, detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `evt-${o.id}-1`,
      hubId,
      o.id,
      `seed_mut_${o.id}`,
      `hash_${o.id}`,
      "order_created",
      "app",
      "user",
      "staff_seed",
      0,
      1,
      createdAt,
      JSON.stringify({ orderId: o.id, customerName: o.customer.name, status: o.status }),
    );

    // Changes
    db.prepare(`
      INSERT OR REPLACE INTO changes (hub_id, order_id, version, op, changed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(hubId, o.id, 1, "upsert", createdAt);
  }

  console.log(`Successfully seeded database: ${dbPath}`);
  console.log(`  Tenants: 1 (tenant-1)`);
  console.log(`  Hubs: 1 (hub-1)`);
  console.log(`  Delivery Slots: ${slotsMap.size}`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Orders: ${orderDefs.length}`);

  db.close();
}

function run() {
  if (!fs.existsSync(d1Dir)) {
    console.error(`D1 directory not found: ${d1Dir}`);
    return;
  }
  const files = fs.readdirSync(d1Dir);
  for (const f of files) {
    if (f.endsWith(".sqlite") && !f.startsWith("metadata")) {
      seedDatabase(path.join(d1Dir, f));
    }
  }
}

run();
