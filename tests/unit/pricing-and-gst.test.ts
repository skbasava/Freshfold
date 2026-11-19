import { describe, expect, it } from "vitest";
import { assertDeliveryStatusTransition } from "../../workers/api/src/domain/entities/delivery";
import {
  assertInvoiceCanAcceptAllocation,
  assertInvoiceMutable,
  deriveInvoiceStatusFromAmounts,
} from "../../workers/api/src/domain/entities/invoice";
import {
  assertOrderStatusTransition,
  canTransitionOrderStatus,
} from "../../workers/api/src/domain/entities/order";
import {
  assertAllocationWithinBounds,
  assertPaymentAllocatable,
  assertRefundWithinBounds,
} from "../../workers/api/src/domain/entities/payment";
import {
  assertNoRateCardOverlap,
  buildPricingKey,
  calculateGrossLineAmount,
  doEffectivePeriodsOverlap,
} from "../../workers/api/src/domain/entities/pricing";
import { calculateLineGstSnapshot } from "../../workers/api/src/domain/entities/tax";
import { evaluateStorageAlertLevel } from "../../workers/api/src/application/use-cases/health.use-cases";
import {
  calculateBasisPointsPaise,
  calculatePerItemLinePaise,
  calculatePerKgLinePaise,
} from "../../workers/api/src/shared/money";

describe("Pure Integer Money, Weight & Pricing Domain Rules", () => {
  it("calculates per-item line totals in exact integer paise", () => {
    expect(calculatePerItemLinePaise(6000, 3)).toBe(18000);
    expect(calculatePerItemLinePaise(2550, 5)).toBe(12750);
  });

  it("calculates per-kg line totals from integer grams with HALF-UP rounding edge cases", () => {
    // 12500 paise/kg * 333g = 4162.5 paise -> rounds half-up to 4163
    expect(calculatePerKgLinePaise(12500, 333)).toBe(4163);
    // 12500 paise/kg * 332g = 4150.0 paise -> exact 4150
    expect(calculatePerKgLinePaise(12500, 332)).toBe(4150);
    // 9900 paise/kg * 1250g = 12375 paise
    expect(calculatePerKgLinePaise(9900, 1250)).toBe(12375);
    // 1001 paise/kg * 500g = 500.5 paise -> rounds half-up to 501
    expect(calculatePerKgLinePaise(1001, 500)).toBe(501);
    // 1001 paise/kg * 499g = 499.499 paise -> rounds down to 499
    expect(calculatePerKgLinePaise(1001, 499)).toBe(499);
  });

  it("enforces minimum billable quantity on per_kg lines", () => {
    const res = calculateGrossLineAmount({
      pricingBasis: "per_kg",
      unitPricePaise: 9900,
      weightGrams: 600,
      minQuantity: 1000,
    });
    expect(res.weightGrams).toBe(600);
    expect(res.billableQuantity).toBe(1000);
    expect(res.grossAmountPaise).toBe(9900);
  });

  it("builds deterministic non-null pricing keys for nullable item_id weight rows", () => {
    expect(buildPricingKey(1, null, "per_kg")).toBe("svc:1:item:none:per_kg");
    expect(buildPricingKey(2, 10, "per_item")).toBe("svc:2:item:10:per_item");
    expect(() => buildPricingKey(2, null, "per_item")).toThrow(
      /requires an itemId/i,
    );
  });

  it("detects overlapping effective date ranges accurately", () => {
    expect(
      doEffectivePeriodsOverlap(
        "2026-01-01T00:00:00Z",
        "2026-06-30T23:59:59Z",
        "2026-06-01T00:00:00Z",
        null,
      ),
    ).toBe(true);

    expect(
      doEffectivePeriodsOverlap(
        "2026-01-01T00:00:00Z",
        "2026-05-31T23:59:59Z",
        "2026-06-01T00:00:00Z",
        null,
      ),
    ).toBe(false);

    expect(() =>
      assertNoRateCardOverlap(
        [
          {
            id: 7,
            effectiveFrom: "2026-01-01T00:00:00Z",
            effectiveTo: null,
          },
        ],
        "2026-03-01T00:00:00Z",
        "2026-12-31T23:59:59Z",
      ),
    ).toThrow(/overlaps existing rate-card item #7/i);
  });
});

describe("Indian GST Domain Calculation Service", () => {
  const gst18 = {
    hsnSacCode: "999712",
    totalRateBps: 1800,
    cgstRateBps: 900,
    sgstRateBps: 900,
    igstRateBps: 1800,
    isExempt: false,
  };

  const gst5 = {
    hsnSacCode: "999711",
    totalRateBps: 500,
    cgstRateBps: 250,
    sgstRateBps: 250,
    igstRateBps: 500,
    isExempt: false,
  };

  it("calculates intra-state CGST + SGST with discount applied before GST", () => {
    // Gross ₹200.00 (20000), discount ₹20.00 (2000) -> taxable ₹180.00 (18000)
    // CGST 9% = 1620, SGST 9% = 1620, total tax = 3240, line total = 21240
    const snap = calculateLineGstSnapshot({
      grossAmountPaise: 20000,
      discountPaise: 2000,
      supplierStateCode: "29",
      placeOfSupplyStateCode: "29",
      taxRate: gst18,
    });

    expect(snap.taxSupplyType).toBe("intra_state");
    expect(snap.taxableAmountPaise).toBe(18000);
    expect(snap.cgstAmountPaise).toBe(1620);
    expect(snap.sgstAmountPaise).toBe(1620);
    expect(snap.igstAmountPaise).toBe(0);
    expect(snap.totalTaxPaise).toBe(3240);
    expect(snap.lineTotalPaise).toBe(21240);
  });

  it("calculates inter-state IGST cleanly with HALF-UP rounding", () => {
    // Taxable 1010 paise at 5% (500 bps) = 50.5 -> rounds half-up to 51 paise
    const snap = calculateLineGstSnapshot({
      grossAmountPaise: 1010,
      discountPaise: 0,
      supplierStateCode: "29",
      placeOfSupplyStateCode: "27",
      taxRate: gst5,
    });

    expect(snap.taxSupplyType).toBe("inter_state");
    expect(snap.cgstAmountPaise).toBe(0);
    expect(snap.sgstAmountPaise).toBe(0);
    expect(snap.igstAmountPaise).toBe(51);
    expect(snap.totalTaxPaise).toBe(51);
    expect(snap.lineTotalPaise).toBe(1061);
    expect(calculateBasisPointsPaise(1010, 500)).toBe(51);
  });

  it("handles exempt GST supplies with zero tax across all components", () => {
    const snap = calculateLineGstSnapshot({
      grossAmountPaise: 15000,
      discountPaise: 0,
      supplierStateCode: "29",
      placeOfSupplyStateCode: "27",
      taxRate: {
        hsnSacCode: "999719",
        totalRateBps: 0,
        cgstRateBps: 0,
        sgstRateBps: 0,
        igstRateBps: 0,
        isExempt: true,
      },
    });
    expect(snap.taxSupplyType).toBe("exempt");
    expect(snap.totalTaxPaise).toBe(0);
    expect(snap.lineTotalPaise).toBe(15000);
  });
});

describe("Domain State Machines, Accounting Bounds & Storage Alerts", () => {
  it("enforces order and delivery state machine transitions", () => {
    expect(canTransitionOrderStatus("confirmed", "processing")).toBe(true);
    expect(() => assertOrderStatusTransition("delivered", "processing")).toThrow();
    expect(() => assertOrderStatusTransition("cancelled", "confirmed")).toThrow();

    expect(() => assertDeliveryStatusTransition("scheduled", "dispatched")).not.toThrow();
    expect(() => assertDeliveryStatusTransition("completed", "in_transit")).toThrow();
  });

  it("enforces invoice immutability and payment allocation/refund bounds", () => {
    expect(() => assertInvoiceMutable("draft")).not.toThrow();
    expect(() => assertInvoiceMutable("issued")).toThrow(/immutable/i);
    expect(() => assertInvoiceCanAcceptAllocation("void")).toThrow();
    expect(deriveInvoiceStatusFromAmounts(10000, 4000, "issued")).toBe("partially_paid");
    expect(deriveInvoiceStatusFromAmounts(10000, 10000, "partially_paid")).toBe("paid");

    expect(() => assertPaymentAllocatable("pending")).toThrow();
    expect(() =>
      assertAllocationWithinBounds({
        allocationPaise: 6000,
        paymentCapturedPaise: 10000,
        paymentAlreadyAllocatedPaise: 5000,
        paymentRefundedPaise: 0,
        invoiceBalanceDuePaise: 8000,
      }),
    ).toThrow(/exceeds available payment amount/i);

    expect(() =>
      assertRefundWithinBounds({
        refundPaise: 4001,
        paymentCapturedPaise: 10000,
        alreadyRefundedPaise: 6000,
      }),
    ).toThrow(/exceeds refundable payment balance/i);
  });

  it("evaluates D1 capacity alert thresholds at 60%, 75%, and 85%", () => {
    expect(evaluateStorageAlertLevel(42)).toBe("normal");
    expect(evaluateStorageAlertLevel(60)).toBe("review_60");
    expect(evaluateStorageAlertLevel(75)).toBe("prepare_archive_75");
    expect(evaluateStorageAlertLevel(85)).toBe("action_required_85");
  });
});
