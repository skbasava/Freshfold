import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatDateTime, formatPaiseToInr } from "../services/orders.service";

// ✏️ Business details
const COMPANY = {
  name: "FRESHFOLD LAUNDRY",
  tagline: "Express Care & Dry Cleaning",
  address: "12, Main Road, Indiranagar, Bengaluru - 560038",
  phone: "+91 98765 43210",
  email: "hello@freshfold.in",
  gstin: "29ABCDE1234F1Z5",
  upiId: "freshfold@upi", // set to "" to hide the "Scan to pay" QR
  trackingBaseUrl: "https://freshfold.in/track", // QR opens {this}/{orderNumber}
  terms: [
    "Bring this receipt to collect your items.",
    "Items not collected within 30 days are not our responsibility.",
    "We are not liable for colour bleed or pre-existing fabric damage.",
  ],
};

export interface ReceiptDocketProps {
  order: any; // createdOrder.order or orderDetail.order
  items: any[]; // createdOrder.items or orderDetail.items
  paidPaise: number;
  balanceDuePaise: number;
  refundedPaise?: number;
  paymentMethodLabel?: string;
  specialInstructions?: string;
  isReprint?: boolean;
  inlinePreview?: boolean;
}

export function ReceiptDocket({
  order,
  items,
  paidPaise,
  balanceDuePaise,
  refundedPaise,
  paymentMethodLabel,
  specialInstructions,
  isReprint = false,
  inlinePreview = false,
}: ReceiptDocketProps) {
  if (!order) return null;

  const safeItems = Array.isArray(items) ? items : [];
  const totalPieces = safeItems.reduce((a, it) => a + (it.quantityPieces ?? 0), 0);
  const orderNumber = order.orderNumber || String(order.id ?? "");
  const trackingUrl = `${COMPANY.trackingBaseUrl}/${encodeURIComponent(orderNumber)}`;

  const upiUrl =
    COMPANY.upiId && balanceDuePaise > 0
      ? `upi://pay?pa=${encodeURIComponent(COMPANY.upiId)}&pn=${encodeURIComponent(
          COMPANY.name,
        )}&am=${(balanceDuePaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(
          `Order ${orderNumber}`,
        )}`
      : null;

  const rootProps = inlinePreview
    ? {
        className:
          "receipt-preview-box w-full max-w-[340px] mx-auto bg-white p-4 border border-slate-300 rounded-xl shadow-xs font-mono text-xs text-slate-900 select-text",
      }
    : {
        id: "receipt-print",
        className: "receipt-print-root",
      };

  return (
    <div {...rootProps}>
      {/* Header */}
      <div className="r-center r-border-b">
        <div className="r-title">{COMPANY.name}</div>
        <div className="r-small">{COMPANY.tagline}</div>
        <div className="r-small">{COMPANY.address}</div>
        <div className="r-small">Ph: {COMPANY.phone}</div>
        {COMPANY.email && <div className="r-small">{COMPANY.email}</div>}
        {COMPANY.gstin && <div className="r-small">GSTIN: {COMPANY.gstin}</div>}
      </div>

      {/* Duplicate / Reprint Banner */}
      {isReprint && (
        <div
          className="r-center r-bold"
          style={{
            border: "1px dashed #000",
            padding: "3px 0",
            margin: "4px 0",
            fontSize: "10px",
            letterSpacing: "0.5px",
            backgroundColor: inlinePreview ? "#fef3c7" : undefined,
          }}
        >
          *** REPRINT / DUPLICATE RECEIPT ***
        </div>
      )}

      {/* Order info */}
      <div className="r-border-b r-small">
        <div className="r-row">
          <span>Order #</span>
          <b>{orderNumber}</b>
        </div>
        <div className="r-row">
          <span>Date</span>
          <span>{order.createdAt ? formatDateTime(order.createdAt) : "—"}</span>
        </div>
        <div className="r-row">
          <span>Customer</span>
          <span>{order.customerName || "Walk-in Customer"}</span>
        </div>
        {order.customerPhone && (
          <div className="r-row">
            <span>Phone</span>
            <span>{order.customerPhone}</span>
          </div>
        )}
        <div className="r-row">
          <span>Ready By</span>
          <b>{order.promisedDeliveryAt ? formatDateTime(order.promisedDeliveryAt) : "—"}</b>
        </div>
      </div>

      {/* Items */}
      <table className="r-table">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Item</th>
            <th style={{ textAlign: "center" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", padding: "6px 0" }}>
                No items recorded
              </td>
            </tr>
          ) : (
            safeItems.map((it, i) => (
              <tr key={it.id ?? i}>
                <td>
                  {it.itemNameSnapshot || "Garment"}
                  {it.serviceNameSnapshot ? (
                    <div className="r-small">{it.serviceNameSnapshot}</div>
                  ) : null}
                </td>
                <td style={{ textAlign: "center" }}>
                  {it.quantityPieces != null
                    ? `${it.quantityPieces} pcs`
                    : it.weightGrams != null
                      ? `${(it.weightGrams / 1000).toFixed(2)} kg`
                      : "1"}
                </td>
                <td style={{ textAlign: "right" }}>{formatPaiseToInr(it.lineTotalPaise ?? 0)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="r-small r-border-b" style={{ paddingBottom: 4 }}>
        Total pieces: <b>{totalPieces}</b>
      </div>

      {/* Totals */}
      <div className="r-border-b">
        <div className="r-row">
          <span>Subtotal</span>
          <span>{formatPaiseToInr(order.subtotalPaise ?? 0)}</span>
        </div>
        {order.discountPaise && order.discountPaise > 0 ? (
          <div className="r-row">
            <span>Discount</span>
            <span>-{formatPaiseToInr(order.discountPaise)}</span>
          </div>
        ) : null}
        <div className="r-row">
          <span>{order.taxSupplyType === "exempt" ? "GST (Exempt 0%)" : "GST"}</span>
          <span>{formatPaiseToInr(order.totalTaxPaise ?? 0)}</span>
        </div>
        <div className="r-row r-total">
          <span>TOTAL</span>
          <span>{formatPaiseToInr(order.totalAmountPaise ?? 0)}</span>
        </div>
        <div className="r-row">
          <span>Paid{paymentMethodLabel ? ` (${paymentMethodLabel})` : ""}</span>
          <span>{formatPaiseToInr(paidPaise ?? 0)}</span>
        </div>
        {refundedPaise && refundedPaise > 0 ? (
          <div className="r-row">
            <span>Refunded</span>
            <span>-{formatPaiseToInr(refundedPaise)}</span>
          </div>
        ) : null}
        <div className="r-row r-bold">
          <span>Balance Due</span>
          <span>{formatPaiseToInr(balanceDuePaise ?? 0)}</span>
        </div>
        <div className="r-center r-bold" style={{ marginTop: 4 }}>
          {balanceDuePaise <= 0 ? "*** PAID IN FULL ***" : "*** PAYMENT PENDING ***"}
        </div>
      </div>

      {(specialInstructions || order.specialInstructions) ? (
        <div className="r-border-b r-small">
          <b>Notes:</b> {specialInstructions || order.specialInstructions}
        </div>
      ) : null}

      {/* QR codes */}
      <div className="r-center r-border-b" style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        <div>
          <QRCodeSVG value={trackingUrl} size={90} level="M" includeMargin={false} />
          <div className="r-small">Scan to track order</div>
        </div>
        {upiUrl && (
          <div>
            <QRCodeSVG value={upiUrl} size={90} level="M" includeMargin={false} />
            <div className="r-small">Scan to pay {formatPaiseToInr(balanceDuePaise)}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="r-small" style={{ paddingTop: 4 }}>
        {COMPANY.terms.map((t, i) => (
          <div key={i}>• {t}</div>
        ))}
      </div>
      <div className="r-center r-bold" style={{ marginTop: 6 }}>
        Thank you for choosing {COMPANY.name.split(" ")[0]}!
      </div>
    </div>
  );
}
