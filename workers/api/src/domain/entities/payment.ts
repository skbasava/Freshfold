import type { PaymentStatus, RefundStatus } from "../../shared/constants";
import { InvariantViolationError } from "../../shared/errors";
import { assertPositiveInteger } from "../../shared/money";

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["authorized", "captured", "failed", "cancelled"],
  authorized: ["captured", "failed", "cancelled"],
  captured: ["partially_refunded", "refunded"],
  partially_refunded: ["partially_refunded", "refunded"],
  failed: [],
  refunded: [],
  cancelled: [],
};

const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  pending: ["processed", "failed", "cancelled"],
  processed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentStatusTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransitionPaymentStatus(from, to)) {
    throw new InvariantViolationError(
      `Invalid payment status transition from '${from}' to '${to}'`,
    );
  }
}

export function assertRefundStatusTransition(
  from: RefundStatus,
  to: RefundStatus,
): void {
  if (!REFUND_TRANSITIONS[from].includes(to)) {
    throw new InvariantViolationError(
      `Invalid refund status transition from '${from}' to '${to}'`,
    );
  }
}

export function assertPaymentAllocatable(status: PaymentStatus): void {
  if (status !== "captured" && status !== "partially_refunded") {
    throw new InvariantViolationError(
      `Only captured payments can be allocated (current status: '${status}')`,
    );
  }
}

export function assertAllocationWithinBounds(params: {
  allocationPaise: number;
  paymentCapturedPaise: number;
  paymentAlreadyAllocatedPaise: number;
  paymentRefundedPaise: number;
  invoiceBalanceDuePaise: number;
}): void {
  assertPositiveInteger(params.allocationPaise, "allocationPaise");

  const paymentNetAvailable =
    params.paymentCapturedPaise -
    params.paymentRefundedPaise -
    params.paymentAlreadyAllocatedPaise;

  if (params.allocationPaise > paymentNetAvailable) {
    throw new InvariantViolationError(
      `Allocation (${params.allocationPaise} paise) exceeds available payment amount (${paymentNetAvailable} paise)`,
    );
  }

  if (params.allocationPaise > params.invoiceBalanceDuePaise) {
    throw new InvariantViolationError(
      `Allocation (${params.allocationPaise} paise) exceeds invoice balance due (${params.invoiceBalanceDuePaise} paise)`,
    );
  }
}

export function assertRefundWithinBounds(params: {
  refundPaise: number;
  paymentCapturedPaise: number;
  alreadyRefundedPaise: number;
}): void {
  assertPositiveInteger(params.refundPaise, "refundPaise");
  const refundable = params.paymentCapturedPaise - params.alreadyRefundedPaise;
  if (params.refundPaise > refundable) {
    throw new InvariantViolationError(
      `Refund (${params.refundPaise} paise) exceeds refundable payment balance (${refundable} paise)`,
    );
  }
}
