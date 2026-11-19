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

export function applyMigrationsAndCleanTables(db, { reset = false } = {}) {
  const migrationsDir = path.join(rootDir, "migrations", "laundry");
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found at ${migrationsDir}`);
    return;
  }

  // List of all legacy and non-approved tables to remove
  const legacyTables = [
    "delivery_slots",
    "order_events",
    "changes",
    "outbox",
    "calendar_sync",
    "sync_state",
    "notifications",
    "calendar_repairs",
    "branches",
    "users",
    "tenant_memberships",
    "services",
    "payments",
    "device_registrations",
    "replication_policies",
    "sync_operations",
    "sync_changes",
    "hub_order_counters",
  ];

  for (const t of legacyTables) {
    db.exec(`DROP TABLE IF EXISTS ${t};`);
  }

  // If reset requested or schema outdated, drop the 5 tables to apply fresh definitions
  if (reset) {
    console.log("Resetting all application tables...");
    db.exec(`DROP TABLE IF EXISTS orders_items;`);
    db.exec(`DROP TABLE IF EXISTS orders;`);
    db.exec(`DROP TABLE IF EXISTS customers;`);
    db.exec(`DROP TABLE IF EXISTS hubs;`);
    db.exec(`DROP TABLE IF EXISTS tenants;`);
    db.exec(`DROP TABLE IF EXISTS d1_migrations;`);
  } else {
    // Check if orders table is missing item_id
    try {
      const ordersInfo = db.prepare("PRAGMA table_info(orders)").all();
      const hasItemId = ordersInfo.some((c) => c.name === "item_id");
      if (ordersInfo.length > 0 && !hasItemId) {
        console.log("Detected outdated orders table schema. Recreating orders and orders_items...");
        db.exec(`DROP TABLE IF EXISTS orders_items;`);
        db.exec(`DROP TABLE IF EXISTS orders;`);
      }
    } catch {
      // Table doesn't exist yet
    }
  }

  // Ensure d1_migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS d1_migrations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = db.prepare("SELECT name FROM d1_migrations").all();
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  for (const file of migrationFiles) {
    if (!reset && appliedSet.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration: ${file}`);
    db.exec(sql);
    db.prepare(`
      INSERT OR REPLACE INTO d1_migrations (name, applied_at)
      VALUES (?, CURRENT_TIMESTAMP)
    `).run(file);
  }
}

export function seedDatabase(dbPath, { reset = false } = {}) {
  console.log(`\n========================================`);
  console.log(`Processing SQLite database: ${dbPath}`);
  console.log(`========================================`);
  const db = new DatabaseSync(dbPath);

  // 1. Remove old tables and apply fresh migrations
  applyMigrationsAndCleanTables(db, { reset });

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

  // 1. Tenant
  db.prepare(`
    INSERT OR REPLACE INTO tenants (
      id, name, slug, status, plan_tier, rc_version, settings_json, metadata_json,
      contact_email, contact_phone, seq_id, version, created_at, updated_at
    )
    VALUES (?, ?, ?, 'active', 'standard', '1.0.0', '{}', '{}', ?, ?, 1, 1, ?, ?)
  `).run(tenantId, "FreshFold", "freshfold", "support@freshfold.in", "+919820000000", now, now);

  // 2. Hub
  db.prepare(`
    INSERT OR REPLACE INTO hubs (
      id, tenant_id, name, code, timezone, address, phone, is_active, rc_version,
      settings_json, metadata_json, seq_id, version, created_at, updated_at
    )
    VALUES (?, ?, ?, 'HUB1', 'Asia/Kolkata', 'Plot 42, Hill Road, Bandra West, Mumbai, MH 400050', '+919820000001', 1, '1.0.0', '{}', '{}', 0, 1, ?, ?)
  `).run(hubId, tenantId, "Main Hub", now, now);

  // 3. Customers
  const customerDefs = [
    { name: "Rajesh Kumar", phone: "+919820112345", email: "rajesh.kumar@example.com", notes: "Prefers eco-friendly detergent" },
    { name: "Sneha Sharma", phone: "+919820223456", email: "sneha.sharma@example.com", notes: "Delicate silks only" },
    { name: "Amit Patel", phone: "+919820334567", email: "amit.patel@example.com", notes: "Heavy starch on collars" },
    { name: "Priya Iyer", phone: "+919820445678", email: "priya.iyer@example.com", notes: "Call before delivery" },
    { name: "Vikram Malhotra", phone: "+919820556789", email: "vikram.m@example.com", notes: "Deliver to security desk" },
    { name: "Ananya Deshmukh", phone: "+919820667890", email: "ananya.d@example.com", notes: "Express handling preferred" },
  ];

  const customers = [];
  for (const c of customerDefs) {
    const custId = deriveCustomerId(hubId, c.phone);
    db.prepare(`
      INSERT OR REPLACE INTO customers (
        id, tenant_id, hub_id, name, phone, phone_normalized, email, notes, version, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(custId, tenantId, hubId, c.name, c.phone, c.phone, c.email, c.notes, now, now);
    customers.push({ id: custId, ...c });
  }

  // 4. Orders
  const orderDefs = [
    {
      id: "ord-1001",
      customer: customers[0],
      status: "confirmed",
      serviceType: "Wash & Fold",
      slotId: `slot-${todayKey}-1400`,
      items: [
        { desc: "Formal Shirts", qty: 4 },
        { desc: "Trousers", qty: 2 },
      ],
      holdComment: null,
    },
    {
      id: "ord-1002",
      customer: customers[1],
      status: "processing",
      serviceType: "Dry Clean",
      slotId: `slot-${todayKey}-1600`,
      items: [
        { desc: "Silk Saree with Zari", qty: 2 },
      ],
      holdComment: null,
    },
    {
      id: "ord-1003",
      customer: customers[2],
      status: "hold",
      serviceType: "Wash & Iron",
      slotId: `slot-${todayKey}-1800`,
      items: [
        { desc: "Winter Blazer", qty: 1 },
        { desc: "Linen Dress Shirts", qty: 3 },
      ],
      holdComment: "Waiting for stain treatment confirmation from customer",
    },
    {
      id: "ord-1004",
      customer: customers[3],
      status: "out_for_delivery",
      serviceType: "Wash & Fold",
      slotId: `slot-${todayKey}-1100`,
      items: [
        { desc: "Double Bed Sheet Set", qty: 4 },
        { desc: "Pillow Covers", qty: 8 },
      ],
      holdComment: null,
    },
    {
      id: "ord-1005",
      customer: customers[4],
      status: "delivered",
      serviceType: "Steam Press",
      slotId: `slot-${todayKey}-0900`,
      items: [
        { desc: "Two-Piece Suits", qty: 3 },
      ],
      holdComment: null,
    },
    {
      id: "ord-1006",
      customer: customers[5],
      status: "confirmed",
      serviceType: "Dry Clean",
      slotId: `slot-${tomorrowKey}-1100`,
      items: [
        { desc: "Evening Gown", qty: 2 },
      ],
      holdComment: null,
    },
  ];

  for (const o of orderDefs) {
    const createdAt = now - Math.floor(Math.random() * 7200000);
    const firstItemId = o.items.length > 0 ? `item-${o.id}-1` : null;

    db.prepare(`
      INSERT OR REPLACE INTO orders (
        crn_id, cust_id, service_type, status, delivery_slot,
        cancelled_at, created_at, updated_at, hold_comment, item_id
      ) VALUES (
        ?, ?, ?, ?, ?,
        NULL, ?, ?, ?, ?
      )
    `).run(
      o.id,
      o.customer.id,
      o.serviceType,
      o.status,
      o.slotId,
      createdAt,
      now,
      o.holdComment,
      firstItemId,
    );

    // Orders Items
    db.prepare(`DELETE FROM orders_items WHERE order_id = ?`).run(o.id);
    for (let i = 0; i < o.items.length; i++) {
      const itm = o.items[i];
      const itemId = `item-${o.id}-${i + 1}`;
      db.prepare(`
        INSERT INTO orders_items (
          item_id, order_id, item_name, description, quantity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        itemId,
        o.id,
        itm.desc,
        itm.desc,
        itm.qty,
        createdAt,
      );
    }
  }

  // Print summary verification
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name ASC").all();
  console.log(`\nActive tables in D1 (${tables.length}):`, tables.map((t) => t.name).join(", "));
  console.log(`Successfully seeded database: ${dbPath}`);
  console.log(`  Tenants: 1 (tenant-1)`);
  console.log(`  Hubs: 1 (hub-1)`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Orders: ${orderDefs.length}`);

  db.close();
}

function run() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset") || args.includes("-r");

  if (!fs.existsSync(d1Dir)) {
    console.error(`D1 directory not found: ${d1Dir}`);
    return;
  }
  const files = fs.readdirSync(d1Dir);
  for (const f of files) {
    if (f.endsWith(".sqlite") && !f.startsWith("metadata")) {
      seedDatabase(path.join(d1Dir, f), { reset });
    }
  }
}

run();
