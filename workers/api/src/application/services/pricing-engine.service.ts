import {
  buildPricingKey,
  calculateGrossLineAmount,
} from "../../domain/entities/pricing";
import { calculateLineGstSnapshot } from "../../domain/entities/tax";
import type { CatalogRepository } from "../../domain/repositories/catalog.repository";
import type { CustomerRepository } from "../../domain/repositories/customer.repository";
import type { PricingRepository } from "../../domain/repositories/pricing.repository";
import type { SystemRepository } from "../../domain/repositories/system.repository";
import type { PricingBasis, TaxSupplyType } from "../../shared/constants";
import { NotFoundError, ValidationError } from "../../shared/errors";

export interface QuoteLineInput {
  serviceId: number;
  itemId?: number | null;
  pricingBasis: PricingBasis;
  quantityPieces?: number | null;
  weightGrams?: number | null;
  discountPaise?: number;
  notes?: string | null;
}

export interface PricedLineSnapshot {
  serviceId: number;
  itemId: number | null;
  taxRateId: number;
  serviceNameSnapshot: string;
  itemNameSnapshot: string | null;
  hsnSacCodeSnapshot: string;
  pricingBasis: PricingBasis;
  quantityPieces: number | null;
  weightGrams: number | null;
  unitPricePaise: number;
  grossAmountPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  taxRateBps: number;
  cgstRateBps: number;
  sgstRateBps: number;
  igstRateBps: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  igstAmountPaise: number;
  totalTaxPaise: number;
  lineTotalPaise: number;
  notes: string | null;
}

export interface PricedQuoteResult {
  branchId: number;
  customerId: number;
  rateCardId: number;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  taxSupplyType: TaxSupplyType;
  lines: PricedLineSnapshot[];
  subtotalPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  totalAmountPaise: number;
}

export interface PricingEngineDeps {
  customers: CustomerRepository;
  catalog: CatalogRepository;
  pricing: PricingRepository;
  system?: SystemRepository;
}

export class PricingEngineService {
  constructor(private readonly deps: PricingEngineDeps) {}

  async calculateQuote(input: {
    customerId: number;
    rateCardId?: number;
    placeOfSupplyStateCode?: string;
    asOfIso: string;
    lines: QuoteLineInput[];
  }): Promise<PricedQuoteResult> {
    if (input.lines.length === 0) {
      throw new ValidationError("At least one order line is required");
    }

    const customer = await this.deps.customers.findById(input.customerId);
    if (!customer || !customer.isActive || customer.deletedAt !== null) {
      throw new NotFoundError(`Active customer #${input.customerId} not found`);
    }

    const branchId = customer.branchId ?? 1;
    const supplierStateCode = "29";

    const resolvedRateCardId = await this.resolveRateCardId(
      customer.id,
      branchId,
      input.asOfIso,
      input.rateCardId,
    );

    const placeOfSupplyStateCode =
      input.placeOfSupplyStateCode ?? customer.stateCode ?? supplierStateCode;

    const gstConfig = await this.deps.system?.getSetting<{ enabled: boolean }>("gst_config");
    const isGstEnabled = gstConfig?.enabled !== false;

    const pricedLines: PricedLineSnapshot[] = [];
    let subtotalPaise = 0;
    let discountPaise = 0;
    let taxableAmountPaise = 0;
    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;
    let totalTaxPaise = 0;
    let totalAmountPaise = 0;
    let orderSupplyType: TaxSupplyType = "exempt";

    for (const line of input.lines) {
      const service = await this.deps.catalog.findServiceById(line.serviceId);
      if (!service || !service.isActive) {
        throw new NotFoundError(`Active service #${line.serviceId} not found`);
      }

      const itemId = line.itemId ?? null;
      let itemNameSnapshot: string | null = null;
      if (itemId !== null) {
        const item = await this.deps.catalog.findItemById(itemId);
        if (!item || !item.isActive) {
          throw new NotFoundError(`Active item #${itemId} not found`);
        }
        itemNameSnapshot = item.name;
      }

      const pricingKey = buildPricingKey(service.id, itemId, line.pricingBasis);
      let rateCardItem = await this.deps.pricing.findActiveRateCardItem({
        rateCardId: resolvedRateCardId,
        pricingKey,
        atIso: input.asOfIso,
      });

      if (!rateCardItem && line.pricingBasis === "per_item") {
        // Fallback for per_item lines if specific item price is not yet registered
        const fallbackKgKey = buildPricingKey(service.id, null, "per_kg");
        const fallbackKg = await this.deps.pricing.findActiveRateCardItem({
          rateCardId: resolvedRateCardId,
          pricingKey: fallbackKgKey,
          atIso: input.asOfIso,
        });
        if (fallbackKg) {
          rateCardItem = {
            ...fallbackKg,
            pricingBasis: "per_item",
            unitPricePaise: Math.round(fallbackKg.unitPricePaise * 0.6),
          };
        }
      }

      if (!rateCardItem) {
        throw new NotFoundError(
          `No active rate found on rate card #${resolvedRateCardId} for ${pricingKey}`,
        );
      }

      const rawTaxRate = await this.deps.pricing.findTaxRateById(rateCardItem.taxRateId);
      if (!rawTaxRate) {
        throw new NotFoundError(`Tax rate #${rateCardItem.taxRateId} not found`);
      }

      const taxRate = isGstEnabled
        ? rawTaxRate
        : {
            ...rawTaxRate,
            totalRateBps: 0,
            cgstRateBps: 0,
            sgstRateBps: 0,
            igstRateBps: 0,
            isExempt: true,
          };

      const base = calculateGrossLineAmount({
        pricingBasis: line.pricingBasis,
        unitPricePaise: rateCardItem.unitPricePaise,
        quantityPieces: line.quantityPieces ?? null,
        weightGrams: line.weightGrams ?? null,
        minQuantity: rateCardItem.minQuantity,
      });

      const gst = calculateLineGstSnapshot({
        grossAmountPaise: base.grossAmountPaise,
        discountPaise: line.discountPaise ?? 0,
        supplierStateCode,
        placeOfSupplyStateCode,
        taxRate,
      });

      if (gst.taxSupplyType !== "exempt") {
        orderSupplyType = gst.taxSupplyType;
      }

      pricedLines.push({
        serviceId: service.id,
        itemId,
        taxRateId: taxRate.id,
        serviceNameSnapshot: service.name,
        itemNameSnapshot,
        hsnSacCodeSnapshot: gst.hsnSacCode,
        pricingBasis: line.pricingBasis,
        quantityPieces: base.quantityPieces,
        weightGrams: base.weightGrams,
        unitPricePaise: rateCardItem.unitPricePaise,
        grossAmountPaise: gst.grossAmountPaise,
        discountPaise: gst.discountPaise,
        taxableAmountPaise: gst.taxableAmountPaise,
        taxRateBps: gst.taxRateBps,
        cgstRateBps: gst.cgstRateBps,
        sgstRateBps: gst.sgstRateBps,
        igstRateBps: gst.igstRateBps,
        cgstAmountPaise: gst.cgstAmountPaise,
        sgstAmountPaise: gst.sgstAmountPaise,
        igstAmountPaise: gst.igstAmountPaise,
        totalTaxPaise: gst.totalTaxPaise,
        lineTotalPaise: gst.lineTotalPaise,
        notes: line.notes ?? null,
      });

      subtotalPaise += gst.grossAmountPaise;
      discountPaise += gst.discountPaise;
      taxableAmountPaise += gst.taxableAmountPaise;
      cgstPaise += gst.cgstAmountPaise;
      sgstPaise += gst.sgstAmountPaise;
      igstPaise += gst.igstAmountPaise;
      totalTaxPaise += gst.totalTaxPaise;
      totalAmountPaise += gst.lineTotalPaise;
    }

    return {
      branchId,
      customerId: customer.id,
      rateCardId: resolvedRateCardId,
      supplierStateCode,
      placeOfSupplyStateCode,
      taxSupplyType: orderSupplyType,
      lines: pricedLines,
      subtotalPaise,
      discountPaise,
      taxableAmountPaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      totalTaxPaise,
      totalAmountPaise,
    };
  }

  private async resolveRateCardId(
    customerId: number,
    branchId: number,
    asOfIso: string,
    explicitRateCardId?: number,
  ): Promise<number> {
    if (explicitRateCardId !== undefined) {
      const explicit = await this.deps.pricing.findRateCardById(explicitRateCardId);
      if (!explicit || !explicit.isActive) {
        throw new NotFoundError(`Active rate card #${explicitRateCardId} not found`);
      }
      return explicit.id;
    }

    const assigned = await this.deps.pricing.findActiveCustomerRateCard(
      customerId,
      asOfIso,
    );
    if (assigned) {
      return assigned.rateCardId;
    }

    const fallback = await this.deps.pricing.findDefaultRateCard(branchId, asOfIso);
    if (!fallback) {
      throw new NotFoundError(`No active default rate card for branch #${branchId}`);
    }
    return fallback.id;
  }
}
