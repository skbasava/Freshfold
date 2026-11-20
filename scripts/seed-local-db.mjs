import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const d1Dir = path.join(
  rootDir,
  "workers",
  "api",
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);

export function seedLocalDatabase(dbPath) {
  console.log(`Processing SQLite database: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  // 1. Apply schema migrations if not yet applied
  const hasTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")
    .get();

  if (!hasTables) {
    const sql0 = fs.readFileSync(
      path.join(rootDir, "migrations", "api", "0000_gifted_talisman.sql"),
      "utf8",
    );
    const sql1 = fs.readFileSync(
      path.join(rootDir, "migrations", "api", "0001_db_invariants.sql"),
      "utf8",
    );
    db.exec(sql0);
    db.exec(sql1);
  }

  const usersColumns = db.prepare("PRAGMA table_info(users)").all();
  const hasTenantColumn = usersColumns.some((col) => col.name === "tenant_id");
  if (!hasTenantColumn) {
    const sql2 = fs.readFileSync(
      path.join(rootDir, "migrations", "api", "0002_multi_tenant_hub.sql"),
      "utf8",
    );
    db.exec(sql2);
  }

  const now = new Date().toISOString();
  const effectiveFrom = "2026-01-01T00:00:00.000Z";

  // 1b. Default Tenant
  db.prepare(`
    INSERT OR IGNORE INTO tenants (
      id, code, name, slug, plan_tier, status, contact_email, contact_phone, created_at, updated_at
    ) VALUES (
      1, 'TENANT-001', 'FreshFold India', 'freshfold-india', 'enterprise', 'active', 'admin@freshfold.in', '+919900000000', ?, ?
    )
  `).run(now, now);

  // 2. Default Branch
  db.prepare(`
    INSERT OR IGNORE INTO branches (
      id, code, name, legal_name, gstin, state_code, address_line1, city, state, postal_code, phone, email, is_default, is_active, created_at, updated_at
    ) VALUES (
      1, 'MAIN', 'FreshFold Main Branch', 'FreshFold Laundry Services', NULL, '29', 'Main Operations Center', 'Bengaluru', 'Karnataka', '560001', '+919900000001', 'ops@freshfold.local', 1, 1, ?, ?
    )
  `).run(now, now);

  // 3. Roles
  const roles = [
    ["super_admin", "Super Admin", "Full system administration"],
    ["admin", "Admin", "Branch configuration, pricing, and billing"],
    ["manager", "Manager", "Daily operations, orders, and invoicing"],
    ["front_desk", "Front Desk", "Customer intake and order counter"],
    ["service", "Service", "Internal service integrations"],
  ];
  for (const [code, name, desc] of roles) {
    db.prepare(`
      INSERT OR IGNORE INTO roles (code, name, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(code, name, desc, now, now);
  }

  // 4. App Settings
  const settings = [
    ["business.currency", JSON.stringify("INR"), "Base accounting currency"],
    ["business.timezone", JSON.stringify("Asia/Kolkata"), "Operational timezone"],
    ["business.multi_branch_enabled", JSON.stringify(false), "Single-branch mode"],
    ["gst.tax_advisor_review_required", JSON.stringify(true), "GST review flag"],
    ["storage.d1_ceiling_bytes", JSON.stringify(524288000), "D1 storage ceiling"],
  ];
  for (const [key, val, desc] of settings) {
    db.prepare(`
      INSERT OR IGNORE INTO app_settings (setting_key, setting_value_json, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(key, val, desc, now, now);
  }

  // 5. Placeholder Tax Rates
  const taxes = [
    ["GST_18_PLACEHOLDER", "GST 18% (Placeholder)", "999712", 1800, 900, 900, 1800, 0],
    ["GST_5_PLACEHOLDER", "GST 5% (Placeholder)", "999711", 500, 250, 250, 500, 0],
    ["GST_EXEMPT", "GST Exempt 0%", "999719", 0, 0, 0, 0, 1],
  ];
  for (const [code, name, hsn, total, cgst, sgst, igst, isExempt] of taxes) {
    db.prepare(`
      INSERT OR IGNORE INTO tax_rates (
        code, name, hsn_sac_code, total_rate_bps, cgst_rate_bps, sgst_rate_bps, igst_rate_bps, is_exempt, effective_from, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(code, name, hsn, total, cgst, sgst, igst, isExempt, effectiveFrom, now, now);
  }

  // 6. Service Categories & Services
  db.prepare(`INSERT OR IGNORE INTO service_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (1, 'LAUNDRY', 'Everyday Laundry', 1, 1, ?, ?)`).run(now, now);
  db.prepare(`INSERT OR IGNORE INTO service_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (2, 'DRY_CLEAN', 'Dry Cleaning', 2, 1, ?, ?)`).run(now, now);
  db.prepare(`INSERT OR IGNORE INTO service_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (3, 'PRESSING', 'Ironing & Steam Press', 3, 1, ?, ?)`).run(now, now);

  const gst18 = db.prepare("SELECT id FROM tax_rates WHERE code = 'GST_18_PLACEHOLDER'").get();
  const gst5 = db.prepare("SELECT id FROM tax_rates WHERE code = 'GST_5_PLACEHOLDER'").get();

  const services = [
    [1, "WASH_FOLD", "Wash & Fold", "per_kg", gst18?.id ?? null, 48],
    [1, "WASH_IRON", "Wash & Iron", "per_item", gst18?.id ?? null, 48],
    [2, "DRY_CLEAN", "Dry Clean", "per_item", gst18?.id ?? null, 72],
    [3, "STEAM_IRON", "Steam Iron", "per_item", gst5?.id ?? null, 24],
  ];
  for (const [catId, code, name, basis, taxId, turnaround] of services) {
    db.prepare(`
      INSERT OR IGNORE INTO services (
        category_id, code, name, default_pricing_basis, default_tax_rate_id, turnaround_hours, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(catId, code, name, basis, taxId, turnaround, now, now);
  }

  // 7. Item Categories & Items
  db.prepare(`INSERT OR IGNORE INTO item_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (1, 'GARMENTS', 'Apparel & Garments', 1, 1, ?, ?)`).run(now, now);
  db.prepare(`INSERT OR IGNORE INTO item_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (2, 'HOUSEHOLD', 'Bedding & Household', 2, 1, ?, ?)`).run(now, now);

  const items = [
    [1, "SHIRT", "Shirt", "999712"],
    [1, "TROUSER", "Trouser", "999712"],
    [1, "SAREE", "Saree", "999712"],
    [1, "SUIT", "Two-Piece Suit", "999712"],
    [2, "BEDSHEET", "Bedsheet", "999712"],
  ];
  for (const [catId, code, name, hsn] of items) {
    db.prepare(`
      INSERT OR IGNORE INTO items (
        category_id, code, name, hsn_sac_code, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(catId, code, name, hsn, now, now);
  }

  // 8. Default Rate Card & Items
  db.prepare(`
    INSERT OR IGNORE INTO rate_cards (
      id, branch_id, code, name, description, is_default, is_active, effective_from, created_at, updated_at
    ) VALUES (
      1, 1, 'STD_2026', 'Standard Retail Rate Card 2026', 'Default rate card', 1, 1, ?, ?, ?
    )
  `).run(effectiveFrom, now, now);

  // Clean up legacy malformed rate card items
  db.prepare("DELETE FROM rate_card_items WHERE pricing_key LIKE 's:%'").run();

  function buildPricingKey(serviceId, itemId, pricingBasis) {
    const itemPart = itemId === null ? "none" : String(itemId);
    return `svc:${serviceId}:item:${itemPart}:${pricingBasis}`;
  }

  const washFold = db.prepare("SELECT id FROM services WHERE code = 'WASH_FOLD'").get();
  const washIron = db.prepare("SELECT id FROM services WHERE code = 'WASH_IRON'").get();
  const dryClean = db.prepare("SELECT id FROM services WHERE code = 'DRY_CLEAN'").get();
  const steamIron = db.prepare("SELECT id FROM services WHERE code = 'STEAM_IRON'").get();

  const allItems = db.prepare("SELECT id, code FROM items").all();
  const itemMap = Object.fromEntries(allItems.map((it) => [it.code, it.id]));

  const rciRows = [];

  // Wash & Fold (per piece & per kg - 18% GST)
  if (washFold && gst18) {
    rciRows.push({
      serviceId: washFold.id,
      itemId: null,
      taxRateId: gst18.id,
      pricingBasis: "per_kg",
      unitPricePaise: 9900, // ₹99/kg fallback
      minQuantity: 1000,
    });

    const wfPrices = {
      SHIRT: 5000,
      TROUSER: 6000,
      SAREE: 10000,
      SUIT: 20000,
      BEDSHEET: 12000,
    };
    for (const [code, price] of Object.entries(wfPrices)) {
      if (itemMap[code]) {
        rciRows.push({
          serviceId: washFold.id,
          itemId: itemMap[code],
          taxRateId: gst18.id,
          pricingBasis: "per_item",
          unitPricePaise: price,
          minQuantity: null,
        });
      }
    }
  }

  // Wash & Iron (per item - 18% GST)
  if (washIron && gst18) {
    const prices = {
      SHIRT: 6000,
      TROUSER: 7000,
      SAREE: 12000,
      SUIT: 25000,
      BEDSHEET: 15000,
    };
    for (const [code, price] of Object.entries(prices)) {
      if (itemMap[code]) {
        rciRows.push({
          serviceId: washIron.id,
          itemId: itemMap[code],
          taxRateId: gst18.id,
          pricingBasis: "per_item",
          unitPricePaise: price,
          minQuantity: null,
        });
      }
    }
  }

  // Dry Clean (per item - 18% GST)
  if (dryClean && gst18) {
    const prices = {
      SHIRT: 15000,
      TROUSER: 18000,
      SAREE: 30000,
      SUIT: 35000,
      BEDSHEET: 25000,
    };
    for (const [code, price] of Object.entries(prices)) {
      if (itemMap[code]) {
        rciRows.push({
          serviceId: dryClean.id,
          itemId: itemMap[code],
          taxRateId: gst18.id,
          pricingBasis: "per_item",
          unitPricePaise: price,
          minQuantity: null,
        });
      }
    }
  }

  // Steam Iron (per item - 5% GST)
  if (steamIron && gst5) {
    const prices = {
      SHIRT: 2500,
      TROUSER: 3000,
      SAREE: 6000,
      SUIT: 12000,
      BEDSHEET: 5000,
    };
    for (const [code, price] of Object.entries(prices)) {
      if (itemMap[code]) {
        rciRows.push({
          serviceId: steamIron.id,
          itemId: itemMap[code],
          taxRateId: gst5.id,
          pricingBasis: "per_item",
          unitPricePaise: price,
          minQuantity: null,
        });
      }
    }
  }

  const rciCount = db.prepare("SELECT count(*) as count FROM rate_card_items").get();
  if (rciCount?.count === 0) {
    for (const row of rciRows) {
      const key = buildPricingKey(row.serviceId, row.itemId, row.pricingBasis);
      db.prepare(`
        INSERT OR IGNORE INTO rate_card_items (
          rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, min_quantity, effective_from, is_active, created_at, updated_at
        ) VALUES (
          1, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
        )
      `).run(
        row.serviceId,
        row.itemId,
        row.taxRateId,
        row.pricingBasis,
        key,
        row.unitPricePaise,
        row.minQuantity,
        effectiveFrom,
        now,
        now,
      );
    }
  }

  // Default Sample Customer (if none exist)
  const custCount = db.prepare("SELECT count(*) as count FROM customers").get();
  if (custCount?.count === 0) {
    db.prepare(`
      INSERT INTO customers (
        tenant_id, branch_id, customer_code, full_name, phone, email, state_code, is_active, created_at, updated_at
      ) VALUES (
        1, 1, 'CUST-001', 'Rahul Sharma', '+919876543210', 'customer@freshfold.local', '29', 1, ?, ?
      )
    `).run(now, now);
  }

  // 9. Staff Account (Auto-provision current user as Manager)
  const knownSubs = [
    "2a9431e6-00b4-4a12-b395-5fd15ab69a29",
  ];

  const managerRole = db.prepare("SELECT id FROM roles WHERE code = 'manager'").get();

  for (const sub of knownSubs) {
    db.prepare(`
      INSERT OR IGNORE INTO users (
        tenant_id, branch_id, supabase_user_id, email, full_name, is_active, created_at, updated_at
      ) VALUES (
        1, 1, ?, 'manager@freshfold.in', 'Store Manager', 1, ?, ?
      )
    `).run(sub, now, now);

    const user = db.prepare("SELECT id FROM users WHERE supabase_user_id = ?").get(sub);
    if (user && managerRole) {
      db.prepare(`
        INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at)
        VALUES (?, ?, ?)
      `).run(user.id, managerRole.id, now);
    }
  }

  console.log(`Successfully migrated and seeded ${dbPath}`);
  db.close();
}

function run() {
  if (!fs.existsSync(d1Dir)) {
    console.log(`D1 directory does not exist yet at: ${d1Dir}`);
    return;
  }
  const files = fs.readdirSync(d1Dir);
  let count = 0;
  for (const f of files) {
    if (f.endsWith(".sqlite") && !f.startsWith("metadata")) {
      seedLocalDatabase(path.join(d1Dir, f));
      count++;
    }
  }
  if (count === 0) {
    console.log("No active miniflare sqlite databases found in:", d1Dir);
  }
}

run();
