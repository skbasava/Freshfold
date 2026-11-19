import type { InvoiceStatus } from "../../shared/constants";
import { InvariantViolationError } from "../../shared/errors";

const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["issued", "void"],
  issued: ["partially_paid", "paid", "void"],
  partially_paid: ["paid", "issued"],
  paid: ["partially_paid", "issued"],
  void: [],
};

export function canTransitionInvoiceStatus(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  if (from === to) return false;
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function assertInvoiceMutable(status: InvoiceStatus): void {
  if (status !== "draft") {
    throw new InvariantViolationError(
      `Invoice in status '${status}' is immutable and cannot be recalculated or edited`,
    );
  }
}

export function assertInvoiceCanAcceptAllocation(status: InvoiceStatus): void {
  if (status === "draft" || status === "void") {
    throw new InvariantViolationError(
      `Cannot allocate payment to invoice in status '${status}'`,
    );
  }
}

export function deriveInvoiceStatusFromAmounts(
  totalAmountPaise: number,
  paidAmountPaise: number,
  currentStatus: InvoiceStatus,
): InvoiceStatus {
  if (currentStatus === "draft" || currentStatus === "void") {
    return currentStatus;
  }
  if (paidAmountPaise <= 0) {
    return "issued";
  }
  if (paidAmountPaise >= totalAmountPaise) {
    return "paid";
  }
  return "partially_paid";
}
