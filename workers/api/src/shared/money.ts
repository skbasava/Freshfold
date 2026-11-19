import { ValidationError } from "./errors";

/**
 * Pure integer arithmetic for monetary amounts (paise) and weights (grams).
 *
 * All calculations use BigInt intermediate values and explicit HALF-UP
 * rounding so no IEEE-754 floating-point imprecision can ever enter order,
 * pricing, or GST totals.
 */

export function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative integer`);
  }
}

export function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`);
  }
}

/**
 * Exact integer division with HALF-UP rounding for non-negative numerators
 * and positive denominators: floor((numerator + floor(denominator/2)) / denominator)
 * handles even denominators cleanly; general exact half-up checks 2 * remainder >= denominator.
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) {
    throw new ValidationError("Denominator must be positive");
  }
  const negative = numerator < 0n;
  const absNum = negative ? -numerator : numerator;
  const quotient = absNum / denominator;
  const remainder = absNum % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  const signed = negative ? -rounded : rounded;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) {
    throw new ValidationError("Monetary calculation overflow");
  }
  return result;
}

/**
 * `per_item`: unitPricePaise (paise per piece) * quantityPieces (whole pieces).
 */
export function calculatePerItemLinePaise(
  unitPricePaise: number,
  quantityPieces: number,
): number {
  assertNonNegativeInteger(unitPricePaise, "unitPricePaise");
  assertPositiveInteger(quantityPieces, "quantityPieces");
  const total = BigInt(unitPricePaise) * BigInt(quantityPieces);
  const asNum = Number(total);
  if (!Number.isSafeInteger(asNum)) {
    throw new ValidationError("Per-item line total overflow");
  }
  return asNum;
}

/**
 * `per_kg`: ratePerKgPaise (paise per 1000g) * weightGrams (integer grams) / 1000,
 * rounded HALF-UP to the nearest integer paise.
 *
 * Example: ₹125.00/kg (12500 paise) * 333g = 4162.5 paise -> 4163 paise (₹41.63).
 */
export function calculatePerKgLinePaise(
  ratePerKgPaise: number,
  weightGrams: number,
): number {
  assertNonNegativeInteger(ratePerKgPaise, "ratePerKgPaise");
  assertPositiveInteger(weightGrams, "weightGrams");
  return divideRoundHalfUp(BigInt(ratePerKgPaise) * BigInt(weightGrams), 1000n);
}

/**
 * Apply basis-point rate (e.g. 500 = 5.00%, 1800 = 18.00%) to integer paise
 * using exact HALF-UP rounding.
 */
export function calculateBasisPointsPaise(
  basePaise: number,
  rateBps: number,
): number {
  assertNonNegativeInteger(basePaise, "basePaise");
  assertNonNegativeInteger(rateBps, "rateBps");
  return divideRoundHalfUp(BigInt(basePaise) * BigInt(rateBps), 10000n);
}

/**
 * Format integer paise as human-readable INR string (for logging/display only).
 */
export function formatPaiseAsInr(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}₹${rupees}.${rem}`;
}
