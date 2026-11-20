import type { PricingBasis } from "../../shared/constants";
import type { TaxRateConfig } from "../entities/tax";

export interface RateCardRecord {
  id: number;
  tenantId: number;
  branchId: number;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RateCardItemRecord {
  id: number;
  rateCardId: number;
  serviceId: number;
  itemId: number | null;
  taxRateId: number;
  pricingBasis: PricingBasis;
  pricingKey: string;
  unitPricePaise: number;
  minQuantity: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRateCardRecord {
  id: number;
  customerId: number;
  rateCardId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PricingRepository {
  createTaxRate(input: {
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
  }): Promise<TaxRateConfig>;
  findTaxRateById(id: number): Promise<TaxRateConfig | null>;
  listTaxRates(activeOnly?: boolean): Promise<TaxRateConfig[]>;

  createRateCard(input: {
    tenantId?: number;
    branchId: number;
    code: string;
    name: string;
    description?: string | null;
    isDefault?: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<RateCardRecord>;
  findRateCardById(id: number): Promise<RateCardRecord | null>;
  findDefaultRateCard(branchId: number, atIso: string): Promise<RateCardRecord | null>;
  listRateCards(branchId?: number, tenantId?: number): Promise<RateCardRecord[]>;

  addRateCardItem(input: {
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
  }): Promise<RateCardItemRecord>;
  upsertRateCardItem(input: {
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
  }): Promise<RateCardItemRecord>;
  listRateCardItems(
    rateCardId: number,
    pricingKey?: string,
  ): Promise<RateCardItemRecord[]>;
  findActiveRateCardItem(params: {
    rateCardId: number;
    pricingKey: string;
    atIso: string;
  }): Promise<RateCardItemRecord | null>;

  assignCustomerRateCard(input: {
    customerId: number;
    rateCardId: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    nowIso: string;
  }): Promise<CustomerRateCardRecord>;
  findActiveCustomerRateCard(
    customerId: number,
    atIso: string,
  ): Promise<CustomerRateCardRecord | null>;
}
