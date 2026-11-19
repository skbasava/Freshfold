import type { TaxSupplyType } from "../../shared/constants";
import { ValidationError } from "../../shared/errors";
import {
  assertNonNegativeInteger,
  calculateBasisPointsPaise,
} from "../../shared/money";

export interface TaxRateConfig {
  id: number;
  code: string;
  name: string;
  hsnSacCode: string;
  /** Total GST rate in basis points (e.g., 1800 = 18.00%, 500 = 5.00%, 0 = exempt) */
  totalRateBps: number;
  cgstRateBps: number;
  sgstRateBps: number;
  igstRateBps: number;
  isExempt: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface LineTaxCalculationInput {
  grossAmountPaise: number;
  /** Discount applied BEFORE GST per approved business rule */
  discountPaise: number;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  taxRate: Pick<
    TaxRateConfig,
    "hsnSacCode" | "totalRateBps" | "cgstRateBps" | "sgstRateBps" | "igstRateBps" | "isExempt"
  >;
}

export interface LineTaxSnapshot {
  hsnSacCode: string;
  taxSupplyType: TaxSupplyType;
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
}

export function validateTaxRateConfig(
  rate: Pick<
    TaxRateConfig,
    "totalRateBps" | "cgstRateBps" | "sgstRateBps" | "igstRateBps" | "isExempt"
  >,
): void {
  assertNonNegativeInteger(rate.totalRateBps, "totalRateBps");
  assertNonNegativeInteger(rate.cgstRateBps, "cgstRateBps");
  assertNonNegativeInteger(rate.sgstRateBps, "sgstRateBps");
  assertNonNegativeInteger(rate.igstRateBps, "igstRateBps");

  if (rate.isExempt) {
    if (
      rate.totalRateBps !== 0 ||
      rate.cgstRateBps !== 0 ||
      rate.sgstRateBps !== 0 ||
      rate.igstRateBps !== 0
    ) {
      throw new ValidationError("Exempt tax rate must have 0 bps for all tax components");
    }
    return;
  }

  if (rate.cgstRateBps + rate.sgstRateBps !== rate.totalRateBps) {
    throw new ValidationError("cgstRateBps + sgstRateBps must equal totalRateBps");
  }
  if (rate.igstRateBps !== rate.totalRateBps) {
    throw new ValidationError("igstRateBps must equal totalRateBps");
  }
}

export function determineTaxSupplyType(
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
  isExempt: boolean,
): TaxSupplyType {
  if (isExempt) return "exempt";
  const supplier = supplierStateCode.trim().toUpperCase();
  const pos = placeOfSupplyStateCode.trim().toUpperCase();
  if (!supplier || !pos) {
    throw new ValidationError(
      "Both supplierStateCode and placeOfSupplyStateCode are required for GST calculation",
    );
  }
  return supplier === pos ? "intra_state" : "inter_state";
}

/**
 * Pure Indian GST calculation service.
 *
 * Rules:
 * 1. Never infers a tax rate from service/item names; uses data-driven `TaxRateConfig`.
 * 2. Applies line discount before GST: `taxableAmountPaise = grossAmountPaise - discountPaise`.
 * 3. Rounds per line using exact integer HALF-UP arithmetic (`calculateBasisPointsPaise`).
 * 4. Intra-state supplies split tax into CGST + SGST; inter-state supplies apply IGST.
 * 5. Exempt supplies yield zero tax across all components.
 */
export function calculateLineGstSnapshot(
  input: LineTaxCalculationInput,
): LineTaxSnapshot {
  assertNonNegativeInteger(input.grossAmountPaise, "grossAmountPaise");
  assertNonNegativeInteger(input.discountPaise, "discountPaise");
  if (input.discountPaise > input.grossAmountPaise) {
    throw new ValidationError("discountPaise cannot exceed grossAmountPaise");
  }

  validateTaxRateConfig(input.taxRate);

  const taxableAmountPaise = input.grossAmountPaise - input.discountPaise;
  const supplyType = determineTaxSupplyType(
    input.supplierStateCode,
    input.placeOfSupplyStateCode,
    input.taxRate.isExempt,
  );

  if (supplyType === "exempt" || input.taxRate.totalRateBps === 0) {
    return {
      hsnSacCode: input.taxRate.hsnSacCode,
      taxSupplyType: "exempt",
      grossAmountPaise: input.grossAmountPaise,
      discountPaise: input.discountPaise,
      taxableAmountPaise,
      taxRateBps: 0,
      cgstRateBps: 0,
      sgstRateBps: 0,
      igstRateBps: 0,
      cgstAmountPaise: 0,
      sgstAmountPaise: 0,
      igstAmountPaise: 0,
      totalTaxPaise: 0,
      lineTotalPaise: taxableAmountPaise,
    };
  }

  if (supplyType === "intra_state") {
    const cgstAmountPaise = calculateBasisPointsPaise(
      taxableAmountPaise,
      input.taxRate.cgstRateBps,
    );
    const sgstAmountPaise = calculateBasisPointsPaise(
      taxableAmountPaise,
      input.taxRate.sgstRateBps,
    );
    const totalTaxPaise = cgstAmountPaise + sgstAmountPaise;
    return {
      hsnSacCode: input.taxRate.hsnSacCode,
      taxSupplyType: "intra_state",
      grossAmountPaise: input.grossAmountPaise,
      discountPaise: input.discountPaise,
      taxableAmountPaise,
      taxRateBps: input.taxRate.totalRateBps,
      cgstRateBps: input.taxRate.cgstRateBps,
      sgstRateBps: input.taxRate.sgstRateBps,
      igstRateBps: 0,
      cgstAmountPaise,
      sgstAmountPaise,
      igstAmountPaise: 0,
      totalTaxPaise,
      lineTotalPaise: taxableAmountPaise + totalTaxPaise,
    };
  }

  const igstAmountPaise = calculateBasisPointsPaise(
    taxableAmountPaise,
    input.taxRate.igstRateBps,
  );
  return {
    hsnSacCode: input.taxRate.hsnSacCode,
    taxSupplyType: "inter_state",
    grossAmountPaise: input.grossAmountPaise,
    discountPaise: input.discountPaise,
    taxableAmountPaise,
    taxRateBps: input.taxRate.totalRateBps,
    cgstRateBps: 0,
    sgstRateBps: 0,
    igstRateBps: input.taxRate.igstRateBps,
    cgstAmountPaise: 0,
    sgstAmountPaise: 0,
    igstAmountPaise,
    totalTaxPaise: igstAmountPaise,
    lineTotalPaise: taxableAmountPaise + igstAmountPaise,
  };
}
