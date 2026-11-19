import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatDateTime, formatPaiseToInr } from "../services/orders.service";

// ✏️ EDIT THESE with your real business details
const COMPANY = {
  name: "FRESHFOLD LAUNDRY",
  tagline: "Express Care & Dry Cleaning",
  address: "12, Main Road, Your Area, City - 560001",
  phone: "+91 98765 43210",
  email: "hello@freshfold.in",
  gstin: "29ABCDE1234F1Z5",
  upiId: "freshfold@upi", // set to "" to hide the "Scan to pay" QR
  trackingBaseUrl: "https://freshfold.in/track", // QR opens {this}/{orderNumber}
  terms: [
    "Bring this receipt to collect your items.",
    "Items not collected within 30 days are not our responsibility.",
    "We are not liable for colour bleed or pre-existing damage.",
  ],
};

interface ReceiptDocketProps {
  order: any; // createdOrder.order
  items: any[]; // createdOrder.items
  paidPaise: number;
  balanceDuePaise: number;
  paymentMethodLabel?: string;
  specialInstructions?: string;
}

export function ReceiptDocket({
  order,
  items,
  paidPaise,
  balanceDuePaise,
  paymentMethodLabel,
  specialInstructions,
}: ReceiptDocketProps) {
  const totalPieces = items.reduce((a, it) => a + (it.quantityPieces ?? 1), 0);
  const trackingUrl = `${COMPANY.trackingBaseUrl}/${encodeURIComponent(order.orderNumber)}`;

  const upiUrl =
    COMPANY.upiId && balanceDuePaise > 0
      ? `upi://pay?pa=${encodeURIComponent(COMPANY.upiId)}&pn=${encodeURIComponent(
          COMPANY.name,
        )}&am=${(balanceDuePaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(
          `Order ${order.orderNumber}`,
        )}`
      : null;

  return (
    <div id="receipt-print" className="receipt-print-root">
      {/* Header */}
      <div className="r-center r-border-b">
        <div className="r-title">{COMPANY.name}</div>
        <div className="r-small">{COMPANY.tagline}</div>
        <div className="r-small">{COMPANY.address}</div>
        <div className="r-small">Ph: {COMPANY.phone}</div>
        {COMPANY.email && <div className="r-small">{COMPANY.email}</div>}
        {COMPANY.gstin && <div className="r-small">GSTIN: {COMPANY.gstin}</div>}
      </div>

      {/* Order info */}
      <div className="r-border-b r-small">
        <div className="r-row">
          <span>Order #</span>
          <b>{order.orderNumber}</b>
        </div>
        <div className="r-row">
          <span>Date</span>
          <span>{formatDateTime(order.createdAt)}</span>
        </div>
        <div className="r-row">
          <span>Customer</span>
          <span>{order.customerName}</span>
        </div>
        {order.customerPhone && (
          <div className="r-row">
            <span>Phone</span>
            <span>{order.customerPhone}</span>
          </div>
        )}
        <div className="r-row">
          <span>Ready By</span>
          <b>{formatDateTime(order.promisedDeliveryAt)}</b>
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
          {items.map((it, i) => (
            <tr key={it.id ?? i}>
              <td>
                {it.itemNameSnapshot || "Garment"}
                {it.serviceNameSnapshot ? (
                  <div className="r-small">{it.serviceNameSnapshot}</div>
                ) : null}
              </td>
              <td style={{ textAlign: "center" }}>{it.quantityPieces ?? 1}</td>
              <td style={{ textAlign: "right" }}>{formatPaiseToInr(it.lineTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="r-small r-border-b" style={{ paddingBottom: 4 }}>
        Total pieces: <b>{totalPieces}</b>
      </div>

      {/* Totals */}
      <div className="r-border-b">
        <div className="r-row">
          <span>Subtotal</span>
          <span>{formatPaiseToInr(order.subtotalPaise)}</span>
        </div>
        <div className="r-row">
          <span>GST</span>
          <span>{formatPaiseToInr(order.totalTaxPaise)}</span>
        </div>
        <div className="r-row r-total">
          <span>TOTAL</span>
          <span>{formatPaiseToInr(order.totalAmountPaise)}</span>
        </div>
        <div className="r-row">
          <span>Paid{paymentMethodLabel ? ` (${paymentMethodLabel})` : ""}</span>
          <span>{formatPaiseToInr(paidPaise)}</span>
        </div>
        <div className="r-row r-bold">
          <span>Balance Due</span>
          <span>{formatPaiseToInr(balanceDuePaise)}</span>
        </div>
        <div className="r-center r-bold" style={{ marginTop: 4 }}>
          {balanceDuePaise <= 0 ? "*** PAID IN FULL ***" : "*** PAYMENT PENDING ***"}
        </div>
      </div>

      {specialInstructions ? (
        <div className="r-border-b r-small">
          <b>Notes:</b> {specialInstructions}
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