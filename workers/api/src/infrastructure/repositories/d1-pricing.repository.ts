import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { TaxRateConfig } from "../../domain/entities/tax";
import type {
  CustomerRateCardRecord,
  PricingRepository,
  RateCardItemRecord,
  RateCardRecord,
} from "../../domain/repositories/pricing.repository";
import type { PricingBasis } from "../../shared/constants";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import {
  customerRateCards,
  rateCardItems,
  rateCards,
  taxRates,
} from "../db/schema";

export class D1PricingRepository implements PricingRepository {
  constructor(private readonly db: ApiDatabase) {}

  async createTaxRate(input: {
    code: string;
    name: string;
    hsnSacCode: string;
    totalRateBps: number;
    cgstRateBps: number;
    sgstRateBps: number;
    igstRateBps: number;
    isExempt: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<TaxRateConfig> {
    try {
      const [row] = await this.db
        .insert(taxRates)
        .values({
          code: input.code,
          name: input.name,
          hsnSacCode: input.hsnSacCode,
          totalRateBps: input.totalRateBps,
          cgstRateBps: input.cgstRateBps,
          sgstRateBps: input.sgstRateBps,
          igstRateBps: input.igstRateBps,
          isExempt: input.isExempt,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findTaxRateById(id: number): Promise<TaxRateConfig | null> {
    const [row] = await this.db
      .select()
      .from(taxRates)
      .where(eq(taxRates.id, id))
      .limit(1);
    return row ?? null;
  }

  async listTaxRates(activeOnly = true): Promise<TaxRateConfig[]> {
    return this.db
      .select()
      .from(taxRates)
      .where(activeOnly ? eq(taxRates.isActive, true) : undefined)
      .orderBy(asc(taxRates.code), desc(taxRates.effectiveFrom));
  }

  async createRateCard(input: {
    tenantId?: number;
    branchId: number;
    code: string;
    name: string;
    description?: string | null;
    isDefault?: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<RateCardRecord> {
    try {
      const [row] = await this.db
        .insert(rateCards)
        .values({
          tenantId: input.tenantId ?? 1,
          branchId: input.branchId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          isDefault: Boolean(input.isDefault),
          isActive: true,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findRateCardById(id: number): Promise<RateCardRecord | null> {
    const [row] = await this.db
      .select()
      .from(rateCards)
      .where(eq(rateCards.id, id))
      .limit(1);
    return row ?? null;
  }

  async findDefaultRateCard(
    branchId: number,
    atIso: string,
  ): Promise<RateCardRecord | null> {
    const [row] = await this.db
      .select()
      .from(rateCards)
      .where(
        and(
          eq(rateCards.branchId, branchId),
          eq(rateCards.isDefault, true),
          eq(rateCards.isActive, true),
          lte(rateCards.effectiveFrom, atIso),
          or(isNull(rateCards.effectiveTo), gte(rateCards.effectiveTo, atIso)),
        ),
      )
      .orderBy(desc(rateCards.effectiveFrom))
      .limit(1);
    return row ?? null;
  }

  async listRateCards(
    branchId?: number,
    tenantId?: number,
  ): Promise<RateCardRecord[]> {
    const conditions = [];
    if (branchId !== undefined) conditions.push(eq(rateCards.branchId, branchId));
    if (tenantId !== undefined) conditions.push(eq(rateCards.tenantId, tenantId));
    return this.db
      .select()
      .from(rateCards)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(rateCards.isDefault), asc(rateCards.id));
  }

  async addRateCardItem(input: {
    rateCardId: number;
    serviceId: number;
    itemId: number | null;
    taxRateId: number;
    pricingBasis: PricingBasis;
    pricingKey: string;
    unitPricePaise: number;
    minQuantity?: number | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<RateCardItemRecord> {
    try {
      const [row] = await this.db
        .insert(rateCardItems)
        .values({
          rateCardId: input.rateCardId,
          serviceId: input.serviceId,
          itemId: input.itemId,
          taxRateId: input.taxRateId,
          pricingBasis: input.pricingBasis,
          pricingKey: input.pricingKey,
          unitPricePaise: input.unitPricePaise,
          minQuantity: input.minQuantity ?? null,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return { ...row!, pricingBasis: row!.pricingBasis as PricingBasis };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async upsertRateCardItem(input: {
    rateCardId: number;
    serviceId: number;
    itemId: number | null;
    taxRateId: number;
    pricingBasis: PricingBasis;
    pricingKey: string;
    unitPricePaise: number;
    minQuantity?: number | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<RateCardItemRecord> {
    try {
      const existing = await this.db
        .select()
        .from(rateCardItems)
        .where(
          and(
            eq(rateCardItems.rateCardId, input.rateCardId),
            eq(rateCardItems.pricingKey, input.pricingKey),
            eq(rateCardItems.isActive, true),
            isNull(rateCardItems.effectiveTo),
          ),
        );

      if (existing.length > 0) {
        const [updated] = await this.db
          .update(rateCardItems)
          .set({
            unitPricePaise: input.unitPricePaise,
            minQuantity: input.minQuantity ?? null,
            updatedAt: input.nowIso,
          })
          .where(eq(rateCardItems.id, existing[0].id))
          .returning();
        return { ...updated!, pricingBasis: updated!.pricingBasis as PricingBasis };
      }

      const [row] = await this.db
        .insert(rateCardItems)
        .values({
          rateCardId: input.rateCardId,
          serviceId: input.serviceId,
          itemId: input.itemId,
          taxRateId: input.taxRateId,
          pricingBasis: input.pricingBasis,
          pricingKey: input.pricingKey,
          unitPricePaise: input.unitPricePaise,
          minQuantity: input.minQuantity ?? null,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return { ...row!, pricingBasis: row!.pricingBasis as PricingBasis };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async listRateCardItems(
    rateCardId: number,
    pricingKey?: string,
  ): Promise<RateCardItemRecord[]> {
    const conditions = [eq(rateCardItems.rateCardId, rateCardId)];
    if (pricingKey !== undefined) {
      conditions.push(eq(rateCardItems.pricingKey, pricingKey));
    }
    const rows = await this.db
      .select()
      .from(rateCardItems)
      .where(and(...conditions))
      .orderBy(asc(rateCardItems.pricingKey), desc(rateCardItems.effectiveFrom));
    return rows.map((r) => ({ ...r, pricingBasis: r.pricingBasis as PricingBasis }));
  }

  async findActiveRateCardItem(params: {
    rateCardId: number;
    pricingKey: string;
    atIso: string;
  }): Promise<RateCardItemRecord | null> {
    const [row] = await this.db
      .select()
      .from(rateCardItems)
      .where(
        and(
          eq(rateCardItems.rateCardId, params.rateCardId),
          eq(rateCardItems.pricingKey, params.pricingKey),
          eq(rateCardItems.isActive, true),
          lte(rateCardItems.effectiveFrom, params.atIso),
          or(
            isNull(rateCardItems.effectiveTo),
            gte(rateCardItems.effectiveTo, params.atIso),
          ),
        ),
      )
      .orderBy(desc(rateCardItems.effectiveFrom))
      .limit(1);
    return row ? { ...row, pricingBasis: row.pricingBasis as PricingBasis } : null;
  }

  async assignCustomerRateCard(input: {
    customerId: number;
    rateCardId: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<CustomerRateCardRecord> {
    try {
      const [row] = await this.db
        .insert(customerRateCards)
        .values({
          customerId: input.customerId,
          rateCardId: input.rateCardId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findActiveCustomerRateCard(
    customerId: number,
    atIso: string,
  ): Promise<CustomerRateCardRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerRateCards)
      .where(
        and(
          eq(customerRateCards.customerId, customerId),
          eq(customerRateCards.isActive, true),
          lte(customerRateCards.effectiveFrom, atIso),
          or(
            isNull(customerRateCards.effectiveTo),
            gte(customerRateCards.effectiveTo, atIso),
          ),
        ),
      )
      .orderBy(desc(customerRateCards.effectiveFrom))
      .limit(1);
    return row ?? null;
  }
}
