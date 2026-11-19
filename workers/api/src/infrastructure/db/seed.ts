import { and, eq } from "drizzle-orm";
import { buildPricingKey } from "../../domain/entities/pricing";
import { DEFAULT_BRANCH_CODE } from "../../shared/constants";
import { createDbClient } from "./client";
import {
  appSettings,
  branches,
  itemCategories,
  items,
  rateCardItems,
  rateCards,
  roles,
  serviceCategories,
  services,
  taxRates,
} from "./schema";

export interface SeedResult {
  branchId: number;
  defaultRateCardId: number;
  taxRateIds: Record<string, number>;
  serviceIds: Record<string, number>;
  itemIds: Record<string, number>;
}

/**
 * Idempotent database seed for the single default branch, roles, settings,
 * service & item catalog, configurable placeholder GST rates (requiring
 * tax-advisor validation prior to production), and a default rate card.
 */
export async function seedDatabase(
  d1: D1Database,
  nowIso: string = new Date().toISOString(),
): Promise<SeedResult> {
  const db = createDbClient(d1);
  const effectiveFrom = "2026-01-01T00:00:00.000Z";

  // 1. Default single branch (configurable placeholder state code '29' = Karnataka)
  await db
    .insert(branches)
    .values({
      code: DEFAULT_BRANCH_CODE,
      name: "FreshFold Main Branch",
      legalName: "FreshFold Laundry Services",
      gstin: null,
      stateCode: "29",
      addressLine1: "Main Operations Center",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      phone: "+919900000001",
      email: "ops@freshfold.local",
      isDefault: true,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoNothing({ target: branches.code });

  const [branch] = await db.select().from(branches).limit(1);
  if (!branch) {
    throw new Error("Failed to seed default branch");
  }

  // 2. Roles
  const roleSeeds = [
    { code: "super_admin", name: "Super Admin", description: "Full system administration" },
    { code: "admin", name: "Admin", description: "Branch configuration, pricing, and billing" },
    { code: "manager", name: "Manager", description: "Daily operations, orders, and invoicing" },
    { code: "front_desk", name: "Front Desk", description: "Customer intake and order counter" },
    { code: "service", name: "Service", description: "Internal service integrations" },
  ];
  for (const role of roleSeeds) {
    await db
      .insert(roles)
      .values({ ...role, isActive: true, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing({ target: roles.code });
  }

  // 3. System Settings
  const settingSeeds = [
    {
      settingKey: "business.currency",
      settingValueJson: JSON.stringify("INR"),
      description: "Base accounting currency (stored in integer paise)",
    },
    {
      settingKey: "business.timezone",
      settingValueJson: JSON.stringify("Asia/Kolkata"),
      description: "Operational timezone for business hours and slots",
    },
    {
      settingKey: "business.multi_branch_enabled",
      settingValueJson: JSON.stringify(false),
      description: "Single-branch initial deployment mode",
    },
    {
      settingKey: "gst.tax_advisor_review_required",
      settingValueJson: JSON.stringify(true),
      description:
        "Placeholder GST rates and HSN/SAC codes must be confirmed by a qualified tax advisor before production invoicing",
    },
    {
      settingKey: "storage.d1_ceiling_bytes",
      settingValueJson: JSON.stringify(524_288_000),
      description: "Conservative 500 MB D1 capacity planning ceiling",
    },
  ];
  for (const setting of settingSeeds) {
    await db
      .insert(appSettings)
      .values({ ...setting, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing({ target: appSettings.settingKey });
  }

  // 4. Configurable Placeholder GST Rates (basis points)
  const taxSeeds = [
    {
      code: "GST_18_PLACEHOLDER",
      name: "GST 18% (Placeholder — Confirm with Tax Advisor)",
      hsnSacCode: "999712",
      totalRateBps: 1800,
      cgstRateBps: 900,
      sgstRateBps: 900,
      igstRateBps: 1800,
      isExempt: false,
      effectiveFrom,
    },
    {
      code: "GST_5_PLACEHOLDER",
      name: "GST 5% (Placeholder — Confirm with Tax Advisor)",
      hsnSacCode: "999711",
      totalRateBps: 500,
      cgstRateBps: 250,
      sgstRateBps: 250,
      igstRateBps: 500,
      isExempt: false,
      effectiveFrom,
    },
    {
      code: "GST_EXEMPT",
      name: "GST Exempt 0%",
      hsnSacCode: "999719",
      totalRateBps: 0,
      cgstRateBps: 0,
      sgstRateBps: 0,
      igstRateBps: 0,
      isExempt: true,
      effectiveFrom,
    },
  ];
  for (const rate of taxSeeds) {
    await db
      .insert(taxRates)
      .values({ ...rate, isActive: true, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing();
  }
  const allTaxRates = await db.select().from(taxRates);
  const taxRateIds: Record<string, number> = {};
  for (const r of allTaxRates) {
    taxRateIds[r.code] = r.id;
  }

  // 5. Service Categories & Services
  const svcCatSeeds = [
    { code: "LAUNDRY", name: "Everyday Laundry", sortOrder: 1 },
    { code: "DRY_CLEAN", name: "Dry Cleaning", sortOrder: 2 },
    { code: "PRESSING", name: "Ironing & Steam Press", sortOrder: 3 },
  ];
  for (const cat of svcCatSeeds) {
    await db
      .insert(serviceCategories)
      .values({ ...cat, isActive: true, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing({ target: serviceCategories.code });
  }
  const svcCats = await db.select().from(serviceCategories);
  const svcCatMap = new Map(svcCats.map((c) => [c.code, c.id]));

  const serviceSeeds = [
    {
      categoryId: svcCatMap.get("LAUNDRY")!,
      code: "WASH_FOLD",
      name: "Wash & Fold",
      defaultPricingBasis: "per_kg",
      defaultTaxRateId: taxRateIds["GST_18_PLACEHOLDER"] ?? null,
      turnaroundHours: 48,
    },
    {
      categoryId: svcCatMap.get("LAUNDRY")!,
      code: "WASH_IRON",
      name: "Wash & Iron",
      defaultPricingBasis: "per_item",
      defaultTaxRateId: taxRateIds["GST_18_PLACEHOLDER"] ?? null,
      turnaroundHours: 48,
    },
    {
      categoryId: svcCatMap.get("DRY_CLEAN")!,
      code: "DRY_CLEAN",
      name: "Dry Clean",
      defaultPricingBasis: "per_item",
      defaultTaxRateId: taxRateIds["GST_18_PLACEHOLDER"] ?? null,
      turnaroundHours: 72,
    },
    {
      categoryId: svcCatMap.get("PRESSING")!,
      code: "STEAM_IRON",
      name: "Steam Iron",
      defaultPricingBasis: "per_item",
      defaultTaxRateId: taxRateIds["GST_5_PLACEHOLDER"] ?? null,
      turnaroundHours: 24,
    },
  ];
  for (const svc of serviceSeeds) {
    await db
      .insert(services)
      .values({ ...svc, isActive: true, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing({ target: services.code });
  }
  const allServices = await db.select().from(services);
  const serviceIds: Record<string, number> = {};
  for (const s of allServices) {
    serviceIds[s.code] = s.id;
  }

  // 6. Item Categories & Items
  const itemCatSeeds = [
    { code: "GARMENTS", name: "Apparel & Garments", sortOrder: 1 },
    { code: "HOUSEHOLD", name: "Bedding & Household", sortOrder: 2 },
  ];
  for (const cat of itemCatSeeds) {
    await db
      .insert(itemCategories)
      .values({ ...cat, isActive: true, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing({ target: itemCategories.code });
  }
  const itemCats = await db.select().from(itemCategories);
  const itemCatMap = new Map(itemCats.map((c) => [c.code, c.id]));

  const itemSeeds = [
    { categoryId: itemCatMap.get("GARMENTS")!, code: "SHIRT", name: "Shirt", hsnSacCode: "999712" },
    { categoryId: itemCatMap.get("GARMENTS")!, code: "TROUSER", name: "Trouser", hsnSacCode: "999712" },
    { categoryId: itemCatMap.get("GARMENTS")!, code: "SAREE", name: "Saree", hsnSacCode: "999712" },
    { categoryId: itemCatMap.get("GARMENTS")!, code: "SUIT", name: "Two-Piece Suit", hsnSacCode: "999712" },
    { categoryId: itemCatMap.get("HOUSEHOLD")!, code: "BEDSHEET", name: "Bedsheet", hsnSacCode: "999712" },
  ];
  for (const it of itemSeeds) {
    await db
      .insert(items)
      .values({ ...it, isActive: true, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoNothing({ target: items.code });
  }
  const allItems = await db.select().from(items);
  const itemIds: Record<string, number> = {};
  for (const it of allItems) {
    itemIds[it.code] = it.id;
  }

  // 7. Default Rate Card & Initial Item + Weight-based Prices (integer paise)
  await db
    .insert(rateCards)
    .values({
      branchId: branch.id,
      code: "STD_2026",
      name: "Standard Retail Rate Card 2026",
      description: "Default branch rate card supporting per-item and per-kg pricing",
      isDefault: true,
      isActive: true,
      effectiveFrom,
      effectiveTo: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoNothing({ target: rateCards.code });

  const [defaultRateCard] = await db.select().from(rateCards).limit(1);
  if (!defaultRateCard) {
    throw new Error("Failed to seed default rate card");
  }

  const gst18Id = taxRateIds["GST_18_PLACEHOLDER"]!;
  const gst5Id = taxRateIds["GST_5_PLACEHOLDER"]!;

  const rciSeeds = [
    {
      serviceId: serviceIds["WASH_FOLD"]!,
      itemId: null,
      taxRateId: gst18Id,
      pricingBasis: "per_kg" as const,
      unitPricePaise: 9900, // ₹99.00 / kg
      minQuantity: 1000, // 1 kg minimum
    },
    {
      serviceId: serviceIds["WASH_IRON"]!,
      itemId: itemIds["SHIRT"]!,
      taxRateId: gst18Id,
      pricingBasis: "per_item" as const,
      unitPricePaise: 6000, // ₹60.00 / shirt
      minQuantity: null,
    },
    {
      serviceId: serviceIds["WASH_IRON"]!,
      itemId: itemIds["TROUSER"]!,
      taxRateId: gst18Id,
      pricingBasis: "per_item" as const,
      unitPricePaise: 7000, // ₹70.00 / trouser
      minQuantity: null,
    },
    {
      serviceId: serviceIds["DRY_CLEAN"]!,
      itemId: itemIds["SUIT"]!,
      taxRateId: gst18Id,
      pricingBasis: "per_item" as const,
      unitPricePaise: 35000, // ₹350.00 / suit
      minQuantity: null,
    },
    {
      serviceId: serviceIds["STEAM_IRON"]!,
      itemId: itemIds["SHIRT"]!,
      taxRateId: gst5Id,
      pricingBasis: "per_item" as const,
      unitPricePaise: 2500, // ₹25.00 / shirt
      minQuantity: null,
    },
  ];

  for (const row of rciSeeds) {
    const pricingKey = buildPricingKey(row.serviceId, row.itemId, row.pricingBasis);
    const [existing] = await db
      .select({ id: rateCardItems.id })
      .from(rateCardItems)
      .where(
        and(
          eq(rateCardItems.rateCardId, defaultRateCard.id),
          eq(rateCardItems.pricingKey, pricingKey),
          eq(rateCardItems.effectiveFrom, effectiveFrom),
        ),
      )
      .limit(1);

    if (existing) {
      continue;
    }

    await db.insert(rateCardItems).values({
      rateCardId: defaultRateCard.id,
      serviceId: row.serviceId,
      itemId: row.itemId,
      taxRateId: row.taxRateId,
      pricingBasis: row.pricingBasis,
      pricingKey,
      unitPricePaise: row.unitPricePaise,
      minQuantity: row.minQuantity,
      effectiveFrom,
      effectiveTo: null,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return {
    branchId: branch.id,
    defaultRateCardId: defaultRateCard.id,
    taxRateIds,
    serviceIds,
    itemIds,
  };
}
