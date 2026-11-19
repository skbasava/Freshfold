import type { PricingBasis } from "../../shared/constants";
import { InvariantViolationError, ValidationError } from "../../shared/errors";
import {
  calculatePerItemLinePaise,
  calculatePerKgLinePaise,
} from "../../shared/money";

export interface RateCardItemRule {
  id: number;
  rateCardId: number;
  serviceId: number;
  itemId: number | null;
  pricingBasis: PricingBasis;
  pricingKey: string;
  unitPricePaise: number;
  minQuantity: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

/**
 * Deterministic non-null pricing key used in SQLite unique indexes so weight-based
 * rows (where `itemId` is NULL) cannot be duplicated despite SQLite treating
 * NULLs as distinct in conventional unique indexes.
 *
 * Format:
 *  - per_item: `svc:<serviceId>:item:<itemId>:per_item`
 *  - per_kg (no item): `svc:<serviceId>:item:none:per_kg`
 *  - per_kg (specific item): `svc:<serviceId>:item:<itemId>:per_kg`
 */
export function buildPricingKey(
  serviceId: number,
  itemId: number | null,
  pricingBasis: PricingBasis,
): string {
  if (pricingBasis === "per_item" && itemId === null) {
    throw new ValidationError("per_item rate-card row requires an itemId");
  }
  const itemPart = itemId === null ? "none" : String(itemId);
  return `svc:${serviceId}:item:${itemPart}:${pricingBasis}`;
}

/**
 * Checks whether two half-open/closed effective date ranges `[fromA, toA]` and `[fromB, toB]`
 * overlap, where `null` end means open-ended (+infinity).
 */
export function doEffectivePeriodsOverlap(
  fromA: string,
  toA: string | null,
  fromB: string,
  toB: string | null,
): boolean {
  if (toA !== null && toA < fromA) {
    throw new ValidationError("effectiveTo cannot be earlier than effectiveFrom");
  }
  if (toB !== null && toB < fromB) {
    throw new ValidationError("effectiveTo cannot be earlier than effectiveFrom");
  }
  const aEndsBeforeBStarts = toA !== null && toA < fromB;
  const bEndsBeforeAStarts = toB !== null && toB < fromA;
  return !aEndsBeforeBStarts && !bEndsBeforeAStarts;
}

export function isEffectiveAt(
  effectiveFrom: string,
  effectiveTo: string | null,
  atIso: string,
): boolean {
  if (atIso < effectiveFrom) return false;
  if (effectiveTo !== null && atIso > effectiveTo) return false;
  return true;
}

export interface LineBaseCalculationInput {
  pricingBasis: PricingBasis;
  unitPricePaise: number;
  quantityPieces?: number | null;
  weightGrams?: number | null;
  minQuantity?: number | null;
}

export interface LineBaseCalculationResult {
  pricingBasis: PricingBasis;
  quantityPieces: number | null;
  weightGrams: number | null;
  billableQuantity: number;
  grossAmountPaise: number;
}

/**
 * Computes gross line amount in integer paise using documented unit rules:
 * - `per_item`: `unitPricePaise` (paise/piece) * `quantityPieces` (whole pieces)
 * - `per_kg`: `unitPricePaise` (paise/kg) * `weightGrams` (grams) / 1000, rounded half-up
 */
export function calculateGrossLineAmount(
  input: LineBaseCalculationInput,
): LineBaseCalculationResult {
  if (input.pricingBasis === "per_item") {
    const qty = input.quantityPieces;
    if (qty === null || qty === undefined || !Number.isSafeInteger(qty) || qty <= 0) {
      throw new ValidationError("per_item line requires positive integer quantityPieces");
    }
    if (input.weightGrams !== null && input.weightGrams !== undefined) {
      throw new ValidationError("per_item line must not specify weightGrams");
    }
    const billableQty =
      input.minQuantity !== null && input.minQuantity !== undefined
        ? Math.max(qty, input.minQuantity)
        : qty;
    return {
      pricingBasis: "per_item",
      quantityPieces: qty,
      weightGrams: null,
      billableQuantity: billableQty,
      grossAmountPaise: calculatePerItemLinePaise(input.unitPricePaise, billableQty),
    };
  }

  const grams = input.weightGrams;
  if (grams === null || grams === undefined || !Number.isSafeInteger(grams) || grams <= 0) {
    throw new ValidationError("per_kg line requires positive integer weightGrams");
  }
  if (input.quantityPieces !== null && input.quantityPieces !== undefined) {
    throw new ValidationError("per_kg line must not specify quantityPieces");
  }
  const billableGrams =
    input.minQuantity !== null && input.minQuantity !== undefined
      ? Math.max(grams, input.minQuantity)
      : grams;
  return {
    pricingBasis: "per_kg",
    quantityPieces: null,
    weightGrams: grams,
    billableQuantity: billableGrams,
    grossAmountPaise: calculatePerKgLinePaise(input.unitPricePaise, billableGrams),
  };
}

export function assertNoRateCardOverlap(
  existing: Pick<RateCardItemRule, "id" | "effectiveFrom" | "effectiveTo">[],
  candidateFrom: string,
  candidateTo: string | null,
  excludeId?: number,
): void {
  for (const row of existing) {
    if (excludeId !== undefined && row.id === excludeId) continue;
    if (
      doEffectivePeriodsOverlap(
        row.effectiveFrom,
        row.effectiveTo,
        candidateFrom,
        candidateTo,
      )
    ) {
      throw new InvariantViolationError(
        `Effective period [${candidateFrom}, ${candidateTo ?? "open"}] overlaps existing rate-card item #${row.id}`,
      );
    }
  }
}
