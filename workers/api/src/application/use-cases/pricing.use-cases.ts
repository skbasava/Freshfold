import {
  assertNoRateCardOverlap,
  buildPricingKey,
} from "../../domain/entities/pricing";
import { validateTaxRateConfig, type TaxRateConfig } from "../../domain/entities/tax";
import type { CatalogRepository } from "../../domain/repositories/catalog.repository";
import type {
  BranchRepository,
  CustomerRepository,
} from "../../domain/repositories/customer.repository";
import type {
  CustomerRateCardRecord,
  PricingRepository,
  RateCardItemRecord,
  RateCardRecord,
} from "../../domain/repositories/pricing.repository";
import type { SystemRepository } from "../../domain/repositories/system.repository";
import type { PricingBasis } from "../../shared/constants";
import { NotFoundError, ValidationError } from "../../shared/errors";
import type { Clock } from "../../shared/time";
import {
  PricingEngineService,
  type PricedQuoteResult,
  type QuoteLineInput,
} from "../services/pricing-engine.service";

export interface PricingUseCasesDeps {
  branches: BranchRepository;
  customers: CustomerRepository;
  catalog: CatalogRepository;
  pricing: PricingRepository;
  system: SystemRepository;
  clock: Clock;
}

export class PricingUseCases {
  private readonly engine: PricingEngineService;

  constructor(private readonly deps: PricingUseCasesDeps) {
    this.engine = new PricingEngineService({
      branches: deps.branches,
      customers: deps.customers,
      catalog: deps.catalog,
      pricing: deps.pricing,
      system: deps.system,
    });
  }

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
  }): Promise<TaxRateConfig> {
    validateTaxRateConfig(input);
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new ValidationError("effectiveTo cannot be earlier than effectiveFrom");
    }
    return this.deps.pricing.createTaxRate({
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listTaxRates(activeOnly = true): Promise<TaxRateConfig[]> {
    return this.deps.pricing.listTaxRates(activeOnly);
  }

  async createRateCard(input: {
    tenantId?: number;
    branchId?: number;
    code: string;
    name: string;
    description?: string | null;
    isDefault?: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }): Promise<RateCardRecord> {
    const branch = input.branchId
      ? await this.deps.branches.findById(input.branchId)
      : await this.deps.branches.findDefault();
    if (!branch) {
      throw new NotFoundError("Branch not configured");
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new ValidationError("effectiveTo cannot be earlier than effectiveFrom");
    }
    return this.deps.pricing.createRateCard({
      tenantId: input.tenantId ?? branch.tenantId,
      branchId: branch.id,
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listRateCards(branchId?: number, tenantId?: number): Promise<RateCardRecord[]> {
    return this.deps.pricing.listRateCards(branchId, tenantId);
  }

  async getDefaultRateCardForBranch(branchId: number): Promise<RateCardRecord> {
    const card = await this.deps.pricing.findDefaultRateCard(
      branchId,
      this.deps.clock.nowIso(),
    );
    if (!card) {
      throw new NotFoundError(
        `No active default rate card found for branch #${branchId}`,
      );
    }
    return card;
  }

  async addRateCardItem(
    rateCardId: number,
    input: {
      serviceId: number;
      itemId?: number | null;
      taxRateId: number;
      pricingBasis: PricingBasis;
      unitPricePaise: number;
      minQuantity?: number | null;
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
  ): Promise<RateCardItemRecord> {
    const rateCard = await this.deps.pricing.findRateCardById(rateCardId);
    if (!rateCard) {
      throw new NotFoundError(`Rate card #${rateCardId} not found`);
    }
    const service = await this.deps.catalog.findServiceById(input.serviceId);
    if (!service) {
      throw new NotFoundError(`Service #${input.serviceId} not found`);
    }
    const itemId = input.itemId ?? null;
    if (itemId !== null) {
      const item = await this.deps.catalog.findItemById(itemId);
      if (!item) {
        throw new NotFoundError(`Item #${itemId} not found`);
      }
    }
    const taxRate = await this.deps.pricing.findTaxRateById(input.taxRateId);
    if (!taxRate) {
      throw new NotFoundError(`Tax rate #${input.taxRateId} not found`);
    }

    const pricingKey = buildPricingKey(input.serviceId, itemId, input.pricingBasis);
    const existing = await this.deps.pricing.listRateCardItems(rateCardId, pricingKey);
    assertNoRateCardOverlap(
      existing.filter((r) => r.isActive),
      input.effectiveFrom,
      input.effectiveTo ?? null,
    );

    return this.deps.pricing.addRateCardItem({
      rateCardId,
      serviceId: input.serviceId,
      itemId,
      taxRateId: input.taxRateId,
      pricingBasis: input.pricingBasis,
      pricingKey,
      unitPricePaise: input.unitPricePaise,
      minQuantity: input.minQuantity ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  async upsertRateCardItem(
    rateCardId: number,
    input: {
      serviceId: number;
      itemId?: number | null;
      taxRateId: number;
      pricingBasis: PricingBasis;
      unitPricePaise: number;
      minQuantity?: number | null;
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
  ): Promise<RateCardItemRecord> {
    const rateCard = await this.deps.pricing.findRateCardById(rateCardId);
    if (!rateCard) {
      throw new NotFoundError(`Rate card #${rateCardId} not found`);
    }
    const service = await this.deps.catalog.findServiceById(input.serviceId);
    if (!service) {
      throw new NotFoundError(`Service #${input.serviceId} not found`);
    }
    const itemId = input.itemId ?? null;
    if (itemId !== null) {
      const item = await this.deps.catalog.findItemById(itemId);
      if (!item) {
        throw new NotFoundError(`Item #${itemId} not found`);
      }
    }
    const taxRate = await this.deps.pricing.findTaxRateById(input.taxRateId);
    if (!taxRate) {
      throw new NotFoundError(`Tax rate #${input.taxRateId} not found`);
    }

    const pricingKey = buildPricingKey(input.serviceId, itemId, input.pricingBasis);

    return this.deps.pricing.upsertRateCardItem({
      rateCardId,
      serviceId: input.serviceId,
      itemId,
      taxRateId: input.taxRateId,
      pricingBasis: input.pricingBasis,
      pricingKey,
      unitPricePaise: input.unitPricePaise,
      minQuantity: input.minQuantity ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listRateCardItems(rateCardId: number): Promise<RateCardItemRecord[]> {
    return this.deps.pricing.listRateCardItems(rateCardId);
  }

  async assignCustomerRateCard(
    customerId: number,
    input: {
      rateCardId: number;
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
  ): Promise<CustomerRateCardRecord> {
    const customer = await this.deps.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }
    const rateCard = await this.deps.pricing.findRateCardById(input.rateCardId);
    if (!rateCard) {
      throw new NotFoundError(`Rate card #${input.rateCardId} not found`);
    }
    return this.deps.pricing.assignCustomerRateCard({
      customerId,
      rateCardId: input.rateCardId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  calculateQuote(input: {
    customerId: number;
    rateCardId?: number;
    placeOfSupplyStateCode?: string;
    asOfIso?: string;
    lines: QuoteLineInput[];
  }): Promise<PricedQuoteResult> {
    return this.engine.calculateQuote({
      ...input,
      asOfIso: input.asOfIso ?? this.deps.clock.nowIso(),
    });
  }

  async getGstConfig(): Promise<{ enabled: boolean }> {
    const setting = await this.deps.system.getSetting<{ enabled: boolean }>("gst_config");
    // Default to true if not configured
    return { enabled: setting?.enabled !== false };
  }

  async setGstConfig(
    enabled: boolean,
    actorUserId?: number | null,
  ): Promise<{ enabled: boolean }> {
    await this.deps.system.upsertSetting({
      key: "gst_config",
      value: { enabled },
      description:
        "Indian GST calculation switch: enabled = 18% GST (SAC 999711/999712), disabled = 0% tax exempt for small laundry business (turnover < 20 Lakhs)",
      updatedByUserId: actorUserId ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
    return { enabled };
  }
}
