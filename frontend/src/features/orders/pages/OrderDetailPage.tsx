import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { OrderStatus } from "@laundry/contracts";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Minus,
  Package,
  Pencil,
  Phone,
  Play,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Tag,
  Trash2,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CardPaymentFlaticonIcon,
  CashPaymentFlaticonIcon,
  FoldedLaundryStackIcon,
  LaundryCashRegisterIcon,
  LaundryClockDeliveryIcon,
  LaundryCustomerProfileIcon,
  LaundryDeliveryVanIcon,
  LaundryHoldIcon,
  LaundryInvoiceIcon,
  LaundryOrderTagIcon,
  RefundReturnFlaticonIcon,
  renderFlaticonGarment,
  renderFlaticonService,
  UpiPaymentFlaticonIcon,
  WashingMachineIcon,
} from "../components/PosFlaticons";

function GoogleCalendarFlaticon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="6" y="8" width="36" height="34" rx="6" fill="#FFFFFF" stroke="#4285F4" strokeWidth="2.5" />
      <path d="M6 18H42V14C42 10.6863 39.3137 8 36 8H12C8.68629 8 6 10.6863 6 14V18Z" fill="#4285F4" />
      <rect x="14" y="4" width="4" height="8" rx="2" fill="#EA4335" />
      <rect x="30" y="4" width="4" height="8" rx="2" fill="#EA4335" />
      <text x="24" y="34" textAnchor="middle" fill="#4285F4" fontSize="13" fontWeight="bold" fontFamily="sans-serif">31</text>
    </svg>
  );
}
import { apiFetch } from "@/lib/http/api-client";
import {
  defaultOrdersService,
  formatDateTime,
  formatPaiseToInr,
  type OrdersService,
} from "../services/orders.service";
import type {
  OrderBillingSummary,
  OrderDetail,
  PaymentItem,
  PaymentMethod,
  PricingQuoteResult,
  RefundItem,
} from "../types/orders.types";
import { ReceiptDocket } from "../components/ReceiptDocket";

export interface OrderDetailPageProps {
  ordersService?: OrdersService;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  pickup_scheduled: "Pickup Scheduled",
  picked_up: "Picked Up",
  received: "Received",
  processing: "In Process",
  ready: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  hold: "On Hold",
  cancelled: "Cancelled",
};

const HOLD_REASON_PRESETS = [
  "Stain review & customer approval needed",
  "Fabric care / delicate material inspection",
  "Missing garment button / repair required",
  "Customer requested delivery reschedule",
  "Address / location confirmation pending",
];

const CANCEL_REASON_PRESETS = [
  "Customer requested cancellation",
  "Duplicate order entry",
  "Fabric care / Damaged / Cannot process",
  "Customer unreachable / Address out of service area",
  "Pricing dispute / Order mistakenly created",
];

interface EditableOrderLine {
  id?: number;
  serviceId: number;
  itemId: number | null;
  serviceNameSnapshot: string;
  itemNameSnapshot: string | null;
  pricingBasis: "per_item" | "per_kg";
  quantityPieces: number;
  weightGrams: number;
  unitPricePaise: number;
  notes: string;
}

export function OrderDetailPage({
  ordersService = defaultOrdersService,
}: OrderDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);

  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Billing & Settlement state
  const [billingSummary, setBillingSummary] = useState<OrderBillingSummary | null>(null);
  const [billingActionMessage, setBillingActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Record Payment Modal state
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false);
  const [paymentAmountRupees, setPaymentAmountRupees] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Refund Modal state
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundTargetPayment, setRefundTargetPayment] = useState<PaymentItem | null>(null);
  const [refundAmountRupees, setRefundAmountRupees] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);

  // Hold dialog state
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");

  // Cancel Order dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Receipt Docket Modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  function handlePrintDocket() {
    window.print();
  }

  // Edit Order Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLines, setEditLines] = useState<EditableOrderLine[]>([]);
  const [editInstructions, setEditInstructions] = useState("");
  const [editPromisedDate, setEditPromisedDate] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editQuote, setEditQuote] = useState<PricingQuoteResult | null>(null);
  const [quotingEdit, setQuotingEdit] = useState(false);

  // Catalog items for adding clothes in Edit Modal
  const [catalogServices, setCatalogServices] = useState<
    Array<{ id: number; name: string; defaultPricingBasis: "per_item" | "per_kg" }>
  >([]);
  const [catalogItems, setCatalogItems] = useState<
    Array<{ id: number; name: string; categoryId: number; code: string }>
  >([]);
  const [ratePrices, setRatePrices] = useState<Record<string, number>>({});
  const [selectedAddServiceId, setSelectedAddServiceId] = useState<number>(1);
  const [selectedAddItemId, setSelectedAddItemId] = useState<number>(1);
  const [addQuantityPieces, setAddQuantityPieces] = useState<number>(1);
  const [addWeightKg, setAddWeightKg] = useState<number>(2.0);
  const [addLineNotes, setAddLineNotes] = useState<string>("");

  // Notes state
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Google Calendar state
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [calendarSyncMessage, setCalendarSyncMessage] = useState<string | null>(null);

  function handleOpenRecordPayment() {
    if (!orderDetail) return;
    const balanceDue = billingSummary
      ? billingSummary.balanceDuePaise
      : orderDetail.order.totalAmountPaise;
    const initialRupees =
      balanceDue > 0
        ? (balanceDue / 100).toFixed(2)
        : (orderDetail.order.totalAmountPaise / 100).toFixed(2);
    setPaymentAmountRupees(initialRupees);
    setPaymentMethod("cash");
    setPaymentNotes("");
    setRecordPaymentModalOpen(true);
  }

  async function handleRecordPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderDetail) return;
    const rupees = parseFloat(paymentAmountRupees);
    if (isNaN(rupees) || rupees <= 0) {
      setBillingActionMessage({
        type: "error",
        text: "Please enter a valid payment amount (greater than ₹0).",
      });
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    setRecordingPayment(true);
    setBillingActionMessage(null);
    try {
      const res = await ordersService.recordPayment(orderDetail.order.id, {
        paymentMethod,
        amountPaise,
        notes: paymentNotes.trim() || undefined,
      });
      setBillingSummary(res.billing);
      setRecordPaymentModalOpen(false);
      setBillingActionMessage({
        type: "success",
        text: `Payment of ${formatPaiseToInr(amountPaise)} via ${paymentMethod.replace("_", " ").toUpperCase()} recorded successfully!`,
      });
      setTimeout(() => setBillingActionMessage(null), 5000);
    } catch (err) {
      setBillingActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to record payment.",
      });
    } finally {
      setRecordingPayment(false);
    }
  }

  function handleOpenRefund(payment: PaymentItem) {
    setRefundTargetPayment(payment);
    const maxRefundable = payment.capturedAmountPaise - payment.refundedAmountPaise;
    setRefundAmountRupees((maxRefundable / 100).toFixed(2));
    setRefundReason("");
    setRefundModalOpen(true);
  }

  async function handleProcessRefundSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderDetail || !refundTargetPayment) return;
    const rupees = parseFloat(refundAmountRupees);
    if (isNaN(rupees) || rupees <= 0) {
      setBillingActionMessage({
        type: "error",
        text: "Please enter a valid refund amount.",
      });
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    const maxRefundable =
      refundTargetPayment.capturedAmountPaise -
      refundTargetPayment.refundedAmountPaise;
    if (amountPaise > maxRefundable) {
      setBillingActionMessage({
        type: "error",
        text: `Refund cannot exceed remaining refundable amount of ${formatPaiseToInr(maxRefundable)}.`,
      });
      return;
    }
    if (!refundReason.trim()) {
      setBillingActionMessage({
        type: "error",
        text: "Please specify a reason for this refund.",
      });
      return;
    }

    setProcessingRefund(true);
    setBillingActionMessage(null);
    try {
      await ordersService.processRefund(refundTargetPayment.id, {
        amountPaise,
        reason: refundReason.trim(),
      });
      const updatedBilling = await ordersService.getOrderBilling(orderDetail.order.id);
      setBillingSummary(updatedBilling);
      setRefundModalOpen(false);
      setRefundTargetPayment(null);
      setRefundReason("");
      setBillingActionMessage({
        type: "success",
        text: `Refund of ${formatPaiseToInr(amountPaise)} processed successfully!`,
      });
      setTimeout(() => setBillingActionMessage(null), 5000);
    } catch (err) {
      setBillingActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to process refund.",
      });
    } finally {
      setProcessingRefund(false);
    }
  }

  async function handleSyncCalendar() {
    if (!orderDetail) return;
    setSyncingCalendar(true);
    setCalendarSyncMessage(null);
    try {
      const res = await ordersService.syncCalendarEvent(orderDetail.order.id);
      setOrderDetail((prev) => (prev ? { ...prev, calendarEvent: res } : null));
      setCalendarSyncMessage("Google Calendar shipping event synced successfully!");
      setTimeout(() => setCalendarSyncMessage(null), 4000);
    } catch {
      setCalendarSyncMessage("Failed to sync calendar event");
    } finally {
      setSyncingCalendar(false);
    }
  }

  async function loadOrder() {
    if (!orderId || isNaN(orderId)) {
      setError("Invalid order ID parameter.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await ordersService.getOrder(orderId);
      setOrderDetail(data);
      try {
        const billing = await ordersService.getOrderBilling(orderId);
        setBillingSummary(billing);
      } catch {
        // Non-blocking fallback
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  async function handleStatusChange(toStatus: OrderStatus, reason?: string) {
    if (!orderDetail) return;
    setTransitioning(true);
    setError(null);
    try {
      await ordersService.transitionStatus(orderDetail.order.id, toStatus, reason);
      setHoldDialogOpen(false);
      setHoldReason("");
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleConfirmCancel() {
    if (!orderDetail) return;
    const reason = cancelReason.trim() || "Customer requested cancellation";
    setCancelling(true);
    try {
      await handleStatusChange("cancelled", reason);
      setCancelDialogOpen(false);
      setCancelReason("");
      setBillingActionMessage({
        type: "success",
        text: `Order #${orderDetail.order.orderNumber} has been cancelled successfully.`,
      });
      setTimeout(() => setBillingActionMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  }

  async function loadCatalogForEdit() {
    if (catalogServices.length > 0 && catalogItems.length > 0) return;
    try {
      const [sRes, iRes, rRes] = await Promise.all([
        apiFetch("/api/v1/services"),
        apiFetch("/api/v1/items?limit=100"),
        apiFetch("/api/v1/rate-cards/current/items")
          .catch(() => apiFetch("/api/v1/rate-cards/1/items"))
          .catch(() => null),
      ]);

      if (sRes.ok) {
        const sJson = (await sRes.json()) as {
          data?: Array<{ id: number; name: string; defaultPricingBasis: "per_item" | "per_kg" }>;
        };
        const sList = sJson.data ?? [];
        setCatalogServices(sList);
        if (sList.length > 0) setSelectedAddServiceId(sList[0].id);
      }

      if (iRes.ok) {
        const iJson = (await iRes.json()) as {
          data?:
            | { items?: Array<{ id: number; name: string; categoryId: number; code: string }> }
            | Array<{ id: number; name: string; categoryId: number; code: string }>;
        };
        const iList = Array.isArray(iJson.data) ? iJson.data : iJson.data?.items ?? [];
        setCatalogItems(iList);
        if (iList.length > 0) setSelectedAddItemId(iList[0].id);
      }

      if (rRes && rRes.ok) {
        const rJson = (await rRes.json()) as {
          data?: Array<{ serviceId: number; itemId: number | null; unitPricePaise: number }>;
        };
        const rates = rJson.data ?? [];
        const map: Record<string, number> = {};
        for (const r of rates) {
          map[`${r.serviceId}:${r.itemId ?? "none"}`] = r.unitPricePaise;
        }
        setRatePrices(map);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  function handleOpenEditModal() {
    if (!orderDetail) return;
    setEditLines(
      orderDetail.items.map((it) => ({
        id: it.id,
        serviceId: it.serviceId,
        itemId: it.itemId,
        serviceNameSnapshot: it.serviceNameSnapshot,
        itemNameSnapshot: it.itemNameSnapshot,
        pricingBasis: it.pricingBasis,
        quantityPieces: it.quantityPieces ?? 1,
        weightGrams: it.weightGrams ?? 0,
        unitPricePaise: it.unitPricePaise,
        notes: it.notes ?? "",
      })),
    );
    setEditInstructions(orderDetail.order.specialInstructions ?? "");
    setEditPromisedDate(
      orderDetail.order.promisedDeliveryAt
        ? orderDetail.order.promisedDeliveryAt.slice(0, 16)
        : "",
    );
    setEditError(null);
    setEditModalOpen(true);
    void loadCatalogForEdit();
  }

  // Recalculate quote preview whenever editLines changes
  useEffect(() => {
    if (!editModalOpen || !orderDetail || editLines.length === 0) {
      setEditQuote(null);
      return;
    }
    let active = true;
    setQuotingEdit(true);
    const quotePromise = ordersService.calculateQuote({
      customerId: orderDetail.order.customerId,
      lines: editLines.map((l) => ({
        serviceId: l.serviceId,
        itemId: l.itemId,
        pricingBasis: l.pricingBasis,
        quantityPieces: l.pricingBasis === "per_item" ? l.quantityPieces : undefined,
        weightGrams: l.pricingBasis === "per_kg" ? l.weightGrams : undefined,
        notes: l.notes || undefined,
      })),
    });

    if (quotePromise && typeof quotePromise.then === "function") {
      quotePromise
        .then((q) => {
          if (active) setEditQuote(q);
        })
        .catch(() => {
          if (active) setEditQuote(null);
        })
        .finally(() => {
          if (active) setQuotingEdit(false);
        });
    } else {
      setQuotingEdit(false);
    }

    return () => {
      active = false;
    };
  }, [editModalOpen, editLines, orderDetail, ordersService]);

  function handleAddGarmentToEdit() {
    const service = catalogServices.find((s) => s.id === selectedAddServiceId);
    const item = catalogItems.find((it) => it.id === selectedAddItemId);
    if (!service) return;

    const pricingBasis = service.defaultPricingBasis;
    const unitPrice =
      ratePrices[`${service.id}:${item?.id ?? "none"}`] ??
      ratePrices[`${service.id}:none`] ??
      10000;

    const newLine: EditableOrderLine = {
      serviceId: service.id,
      itemId: pricingBasis === "per_item" ? (item ? item.id : null) : null,
      serviceNameSnapshot: service.name,
      itemNameSnapshot:
        pricingBasis === "per_item" ? (item?.name ?? "Garment") : "Laundry by Weight",
      pricingBasis,
      quantityPieces: pricingBasis === "per_item" ? Math.max(1, addQuantityPieces) : 1,
      weightGrams:
        pricingBasis === "per_kg" ? Math.max(100, Math.round(addWeightKg * 1000)) : 0,
      unitPricePaise: unitPrice,
      notes: addLineNotes.trim(),
    };

    setEditLines((prev) => [...prev, newLine]);
    setAddLineNotes("");
  }

  function handleUpdateLineQty(index: number, delta: number) {
    setEditLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const nextQty = Math.max(1, line.quantityPieces + delta);
        return { ...line, quantityPieces: nextQty };
      }),
    );
  }

  function handleUpdateLineWeight(index: number, kg: number) {
    setEditLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        return { ...line, weightGrams: Math.max(100, Math.round(kg * 1000)) };
      }),
    );
  }

  function handleDeleteLine(index: number) {
    setEditLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleSaveEditedOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!orderDetail) return;
    if (editLines.length === 0) {
      setEditError("Order must contain at least one garment or service line item.");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const updated = await ordersService.updateOrder(orderDetail.order.id, {
        lines: editLines.map((l) => ({
          serviceId: l.serviceId,
          itemId: l.itemId,
          pricingBasis: l.pricingBasis,
          quantityPieces: l.pricingBasis === "per_item" ? l.quantityPieces : undefined,
          weightGrams: l.pricingBasis === "per_kg" ? l.weightGrams : undefined,
          notes: l.notes || undefined,
        })),
        specialInstructions: editInstructions.trim() || null,
        promisedDeliveryAt: editPromisedDate ? new Date(editPromisedDate).toISOString() : null,
      });
      setOrderDetail(updated);
      setEditModalOpen(false);
      setBillingActionMessage({
        type: "success",
        text: "Order clothes and delivery instructions updated successfully!",
      });
      try {
        const updatedBilling = await ordersService.getOrderBilling(orderDetail.order.id);
        setBillingSummary(updatedBilling);
      } catch {
        // Non-blocking
      }
      setTimeout(() => setBillingActionMessage(null), 5000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update order.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim() || !orderDetail) return;
    setAddingNote(true);
    try {
      await ordersService.addNote(orderDetail.order.id, newNote.trim());
      setNewNote("");
      await loadOrder();
    } catch {
      setError("Failed to add note.");
    } finally {
      setAddingNote(false);
    }
  }

  function handleCopyOrderNumber() {
    if (!orderDetail) return;
    void navigator.clipboard.writeText(orderDetail.order.orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="pos-workspace max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 lg:col-span-2 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !orderDetail) {
    return (
      <div className="pos-workspace max-w-4xl mx-auto space-y-4 p-4 sm:p-6">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/orders" />}
          className="rounded-xl border-slate-200"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          <span>Back to Orders</span>
        </Button>
        <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50/70">
          <AlertCircle className="size-5 text-rose-600" />
          <AlertTitle className="text-rose-900 font-bold">Order Unavailable</AlertTitle>
          <AlertDescription className="text-rose-700">{error ?? "Order not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { order, items, statusHistory, notes } = orderDetail;

  // Calculate garment count summary
  const totalPieces = items.reduce(
    (sum, item) => sum + (item.quantityPieces ?? 0),
    0,
  );
  const totalWeightGrams = items.reduce(
    (sum, item) => sum + (item.weightGrams ?? 0),
    0,
  );

  // Authoritative billing breakdown
  const effectiveTotalPaise =
    billingSummary?.totalAmountPaise ?? order.totalAmountPaise;
  const effectiveCapturedPaise =
    billingSummary?.capturedAmountPaise ?? 0;
  const effectiveRefundedPaise =
    billingSummary?.refundedAmountPaise ?? 0;
  const effectiveNetPaidPaise =
    billingSummary?.netPaidAmountPaise ??
    Math.max(0, effectiveCapturedPaise - effectiveRefundedPaise);
  const effectiveBalanceDuePaise =
    billingSummary?.balanceDuePaise ??
    Math.max(0, effectiveTotalPaise - effectiveNetPaidPaise);
  const effectivePaymentStatus =
    billingSummary?.paymentStatus ??
    (effectiveBalanceDuePaise === 0 && effectiveTotalPaise > 0
      ? "paid"
      : effectiveNetPaidPaise > 0
        ? "partially_paid"
        : "unpaid");
  const paymentsList = billingSummary?.payments ?? [];
  const refundsList = billingSummary?.refunds ?? [];

  // Stepper milestones
  const steps: Array<{
    id: OrderStatus;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "confirmed",
      title: "Order Confirmed",
      subtitle: "Received & Tagged",
      icon: <LaundryOrderTagIcon className="size-6" />,
    },
    {
      id: "processing",
      title: "Washing & Care",
      subtitle: "Wash, Press & QC",
      icon: <WashingMachineIcon className="size-6" />,
    },
    {
      id: "out_for_delivery",
      title: "Out for Delivery",
      subtitle: "Dispatched / Ready",
      icon: <LaundryDeliveryVanIcon className="size-6" />,
    },
    {
      id: "delivered",
      title: "Delivered",
      subtitle: "Handed over to Customer",
      icon: <FoldedLaundryStackIcon className="size-6" />,
    },
  ];

  const statusOrder: OrderStatus[] = [
    "confirmed",
    "processing",
    "out_for_delivery",
    "delivered",
  ];
  const currentIndex = statusOrder.indexOf(order.status);

  return (
    <TooltipProvider delay={250}>
      <div className="pos-workspace space-y-6 pb-16 select-none">
        {/* ================= TOP COMMAND & CONTEXT BAR ================= */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-surface p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs no-print">
          {/* Left: Back & Order Identification */}
          <div className="flex items-center gap-3.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-xs"
                    nativeButton={false}
                    render={<Link to="/orders" />}
                    aria-label="Back to Orders"
                    className="size-9 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs cursor-pointer"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>Back to Orders List</TooltipContent>
            </Tooltip>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 font-mono">
                  {order.orderNumber}
                </h1>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleCopyOrderNumber}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-200 rounded-lg transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="size-3 text-emerald-600" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    }
                  />
                  <TooltipContent>Copy Order Number</TooltipContent>
                </Tooltip>

                <StatusBadge
                  status={order.status}
                  label={STATUS_LABELS[order.status] ?? order.status}
                  className="orders-status-pill text-xs shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <span>Created {formatDateTime(order.createdAt)}</span>
                <span>•</span>
                <span className="font-semibold text-blue-700">
                  {order.primaryService || "Laundry Service"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Print Docket Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintDocket}
                    className="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Printer className="size-3.5 text-blue-600" />
                    <span>Print Docket</span>
                  </Button>
                }
              />
              <TooltipContent>Reprint Customer Thermal Receipt & Docket</TooltipContent>
            </Tooltip>

            {/* Edit Order Button (Available when active) */}
            {order.status !== "delivered" && order.status !== "cancelled" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenEditModal}
                className="h-9 px-3 text-xs font-semibold rounded-xl text-blue-700 border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 gap-1.5 shadow-2xs cursor-pointer"
              >
                <Pencil className="size-3.5 text-blue-600" />
                <span>Edit Order</span>
              </Button>
            ) : null}

            {/* Cancel Order Button (Available when active) */}
            {order.status !== "delivered" && order.status !== "cancelled" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCancelReason("");
                  setCancelDialogOpen(true);
                }}
                className="h-9 px-3 text-xs font-semibold rounded-xl text-rose-700 border-rose-200 bg-rose-50/60 hover:bg-rose-100/70 gap-1.5 shadow-2xs cursor-pointer"
              >
                <XCircle className="size-3.5 text-rose-600" />
                <span>Cancel Order</span>
              </Button>
            ) : null}

            {/* Hold Button (Available when not delivered or cancelled) */}
            {order.status !== "delivered" &&
            order.status !== "cancelled" &&
            order.status !== "hold" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHoldDialogOpen(true)}
                className="h-9 px-3 text-xs font-semibold rounded-xl text-amber-700 border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 gap-1.5 shadow-2xs cursor-pointer"
              >
                <AlertTriangle className="size-3.5 text-amber-600" />
                <span>Put on Hold</span>
              </Button>
            ) : null}

            {/* Primary Status Transition Action */}
            {order.status === "confirmed" ? (
              <Button
                size="sm"
                disabled={transitioning}
                onClick={() => handleStatusChange("processing", "Started washing & processing")}
                className="h-9 px-4 text-xs font-bold rounded-xl pos-cta-btn gap-2 shadow-sm cursor-pointer"
              >
                {transitioning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <WashingMachineIcon className="size-4" />
                )}
                <span>Start Processing</span>
              </Button>
            ) : null}

            {order.status === "processing" ? (
              <Button
                size="sm"
                disabled={transitioning}
                onClick={() =>
                  handleStatusChange("out_for_delivery", "Ready, folded & dispatched for delivery")
                }
                className="h-9 px-4 text-xs font-bold rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white gap-2 shadow-sm cursor-pointer"
              >
                {transitioning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LaundryDeliveryVanIcon className="size-4" />
                )}
                <span>Ready & Dispatch</span>
              </Button>
            ) : null}

            {order.status === "out_for_delivery" ? (
              <Button
                size="sm"
                disabled={transitioning}
                onClick={() => handleStatusChange("delivered", "Successfully delivered to customer")}
                className="h-9 px-4 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white gap-2 shadow-sm cursor-pointer"
              >
                {transitioning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                <span>Mark Delivered</span>
              </Button>
            ) : null}

            {order.status === "hold" ? (
              <Button
                size="sm"
                disabled={transitioning}
                onClick={() => handleStatusChange("processing", "Hold resolved. Resumed processing")}
                className="h-9 px-4 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white gap-2 shadow-sm cursor-pointer"
              >
                {transitioning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5 fill-white" />
                )}
                <span>Resume Processing</span>
              </Button>
            ) : null}
          </div>
        </div>

        {/* ================= ON HOLD ALERT BANNER ================= */}
        {order.status === "hold" ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-amber-50 border-1.5 border-amber-300 text-amber-900 shadow-2xs no-print"
          >
            <div className="flex items-center gap-3">
              <LaundryHoldIcon className="size-9 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-amber-950">
                  Order is currently On Hold
                </h2>
                <p className="text-xs text-amber-800 mt-0.5">
                  {statusHistory.find((h) => h.toStatus === "hold")?.reason ||
                    "Pending staff or customer confirmation."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              disabled={transitioning}
              onClick={() => handleStatusChange("processing", "Hold resolved. Resumed processing")}
              className="h-8 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer"
            >
              Resume Order
            </Button>
          </motion.div>
        ) : null}

        {/* ================= CANCELLED ALERT BANNER ================= */}
        {order.status === "cancelled" ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-rose-50 border-1.5 border-rose-300 text-rose-900 shadow-2xs no-print"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0">
                <XCircle className="size-6 text-rose-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-rose-950">
                  This Order is Cancelled
                </h2>
                <p className="text-xs text-rose-800 mt-0.5">
                  Cancellation Reason:{" "}
                  <span className="font-semibold text-rose-950">
                    {statusHistory.find((h) => h.toStatus === "cancelled")?.reason ||
                      "Order was cancelled by store staff."}
                  </span>
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-rose-800 bg-rose-100/90 px-3 py-1 rounded-xl border border-rose-200">
              CANCELLED
            </span>
          </motion.div>
        ) : null}

        {/* ================= MILESTONE LIFECYCLE STEPPER ================= */}
        <div className="order-stepper-container no-print">
          {steps.map((step, idx) => {
            const isCompleted =
              currentIndex > idx || order.status === "delivered";
            const isCurrent =
              order.status === step.id && order.status !== "delivered";
            const isUpcoming = currentIndex < idx && !isCompleted;
            const isHoldActive = order.status === "hold" && idx === 1;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                className={`order-stepper-item ${
                  isHoldActive
                    ? "is-hold"
                    : isCompleted
                      ? "is-completed"
                      : isCurrent
                        ? "is-current"
                        : "is-upcoming"
                }`}
              >
                <div className="shrink-0 p-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  {step.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black tracking-tight text-slate-900 truncate">
                      {step.title}
                    </span>
                    {isCompleted ? (
                      <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {step.subtitle}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ================= MAIN 2-COLUMN WORKSPACE ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ================= LEFT COLUMN: LINE ITEMS & STAFF NOTES (2 COLS) ================= */}
          <div className="lg:col-span-2 space-y-6">
            {/* Garment Line Items Card */}
            <Card className="border-1.5 border-slate-200/90 bg-surface rounded-2xl shadow-2xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 border border-blue-100">
                    <Tag className="size-4 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">
                      Garment Line Items
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tagged items, fabric services, pricing basis & taxes
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="font-bold text-xs bg-slate-50 text-slate-700 border-slate-200 px-2.5 py-0.5 rounded-full"
                  >
                    {items.length} {items.length === 1 ? "Item" : "Items"}
                    {totalPieces > 0 ? ` • ${totalPieces} pcs` : ""}
                    {totalWeightGrams > 0
                      ? ` • ${(totalWeightGrams / 1000).toFixed(2)} kg`
                      : ""}
                  </Badge>

                  {order.status !== "delivered" && order.status !== "cancelled" ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleOpenEditModal}
                      className="h-7 px-2.5 text-xs font-semibold rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50/80 gap-1 cursor-pointer"
                    >
                      <Pencil className="size-3 text-blue-600" />
                      <span>Edit Garments</span>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>

              <div className="overflow-x-auto pos-scroll">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
                      <TableHead className="text-xs font-bold text-slate-700 py-3 pl-4 sm:pl-5">
                        Garment & Service
                      </TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 py-3 text-center">
                        Pricing Basis
                      </TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 py-3 text-center">
                        SAC Code
                      </TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 py-3 text-right">
                        Taxable
                      </TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 py-3 text-right">
                        GST Tax
                      </TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 py-3 text-right pr-4 sm:pr-5">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const itemName = item.itemNameSnapshot || "General Garment";
                      return (
                        <TableRow
                          key={item.id}
                          className="border-b border-slate-100 hover:bg-blue-50/30 transition-colors"
                        >
                          {/* Garment + Service with Flaticon */}
                          <TableCell className="py-3.5 pl-4 sm:pl-5">
                            <div className="flex items-center gap-3">
                              <div className="size-11 shrink-0 p-1 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center">
                                {renderFlaticonGarment(itemName, itemName, "size-9")}
                              </div>
                              <div>
                                <div className="font-bold text-sm text-slate-900">
                                  {itemName}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold mt-0.5">
                                  {renderFlaticonService(item.serviceNameSnapshot, "size-3.5")}
                                  <span>{item.serviceNameSnapshot}</span>
                                </div>
                                {item.notes ? (
                                  <div className="text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded px-1.5 py-0.5 mt-1 inline-block">
                                    {item.notes}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>

                          {/* Pricing Basis & Qty */}
                          <TableCell className="py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200/60">
                              {item.pricingBasis === "per_item" ? (
                                <>
                                  <Package className="size-3 text-slate-500" />
                                  <span>{item.quantityPieces ?? 1} pcs</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="size-3 text-blue-500" />
                                  <span>
                                    {item.weightGrams
                                      ? `${(item.weightGrams / 1000).toFixed(2)} kg`
                                      : "—"}
                                  </span>
                                </>
                              )}
                            </span>
                          </TableCell>

                          {/* SAC Code */}
                          <TableCell className="py-3.5 text-center">
                            <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/50">
                              {item.hsnSacCodeSnapshot || "999712"}
                            </span>
                          </TableCell>

                          {/* Taxable */}
                          <TableCell className="py-3.5 text-right font-medium text-slate-700 text-xs">
                            {formatPaiseToInr(item.taxableAmountPaise)}
                          </TableCell>

                          {/* GST */}
                          <TableCell className="py-3.5 text-right text-xs text-slate-500">
                            {formatPaiseToInr(item.totalTaxPaise)}
                          </TableCell>

                          {/* Total */}
                          <TableCell className="py-3.5 text-right font-black text-slate-900 text-sm pr-4 sm:pr-5">
                            {formatPaiseToInr(item.lineTotalPaise)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Garment Table Summary Footer */}
              <div className="bg-slate-50/60 p-3.5 px-4 sm:px-5 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-4">
                  <span>
                    Total Lines: <strong className="text-slate-900">{items.length}</strong>
                  </span>
                  {totalPieces > 0 ? (
                    <span>
                      Garments Count:{" "}
                      <strong className="text-slate-900">{totalPieces} pcs</strong>
                    </span>
                  ) : null}
                  {totalWeightGrams > 0 ? (
                    <span>
                      Total Weight:{" "}
                      <strong className="text-slate-900">
                        {(totalWeightGrams / 1000).toFixed(2)} kg
                      </strong>
                    </span>
                  ) : null}
                </div>
                <div className="text-slate-500 font-medium">
                  GST SAC Code: <span className="font-mono text-slate-700 font-semibold">999712</span> (Laundry & Dry-Cleaning Services)
                </div>
              </div>
            </Card>

            {/* Internal Staff Notes & Team Chat Card */}
            <Card className="border-1.5 border-slate-200/90 bg-surface rounded-2xl shadow-2xs overflow-hidden no-print">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-50 border border-purple-100">
                    <MessageSquare className="size-4 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">
                      Internal Staff Notes & Activity
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Log care notes, special customer requests, or inspection remarks
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="font-bold text-xs bg-slate-50 text-slate-700 border-slate-200 px-2.5 py-0.5 rounded-full"
                >
                  {notes.length} {notes.length === 1 ? "Note" : "Notes"}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {notes.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-50/60 border border-dashed border-slate-200">
                    <MessageSquare className="size-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">
                      No internal notes logged yet.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Use the quick input below to record any special care notes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pos-scroll pr-1">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/70 text-xs space-y-1.5 transition-colors hover:bg-slate-100/60"
                      >
                        <p className="text-slate-800 font-medium leading-relaxed">
                          {n.note}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock className="size-3" />
                            <span>{formatDateTime(n.createdAt)}</span>
                          </span>
                          <span className="font-semibold text-purple-700 uppercase tracking-wider">
                            Staff Note
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Add Note Form */}
                <form onSubmit={handleAddNote} className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="Type an internal note (e.g., Stain pre-treated, checked pocket)..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="h-10 text-xs rounded-xl border-slate-200 bg-white focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500 flex-1"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={addingNote || !newNote.trim()}
                    className="h-10 px-4 text-xs font-bold rounded-xl pos-cta-btn gap-1.5 cursor-pointer shrink-0"
                  >
                    {addingNote ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    <span>Post Note</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* ================= RIGHT COLUMN: BILLING & DELIVERY SUMMARY (1 COL) ================= */}
          <div className="space-y-6">
            {/* Invoice & GST Breakdown Card */}
            <div className="order-receipt-ticket">
              <div className="order-receipt-header flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <LaundryInvoiceIcon className="size-6 text-white" />
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      Tax Invoice Docket
                    </h3>
                    <p className="text-[11px] text-blue-100">
                      SAC 999712 • GST Compliant
                    </p>
                  </div>
                </div>
                <Badge className="bg-white/20 text-white border-white/30 text-[10px] font-semibold">
                  Official Copy
                </Badge>
              </div>

              <div className="p-4 sm:p-5 space-y-3 text-xs bg-white">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Subtotal:</span>
                  <span className="font-semibold text-slate-900">
                    {formatPaiseToInr(order.subtotalPaise)}
                  </span>
                </div>

                {order.discountPaise > 0 ? (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Discount Applied:</span>
                    <span>-{formatPaiseToInr(order.discountPaise)}</span>
                  </div>
                ) : null}

                <div className="flex justify-between text-slate-600 pt-1.5 border-t border-slate-100">
                  <span>Taxable Value:</span>
                  <span className="font-semibold text-slate-900">
                    {formatPaiseToInr(order.taxableAmountPaise)}
                  </span>
                </div>

                {/* GST Breakdown */}
                {order.taxSupplyType === "exempt" ? (
                  <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/60 text-[11px] text-emerald-800 flex justify-between items-center">
                    <span className="font-medium">GST Supply Status:</span>
                    <span className="font-semibold text-emerald-700">Tax Exempt (0% GST)</span>
                  </div>
                ) : order.taxSupplyType === "intra_state" ? (
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Central GST (CGST 9%):</span>
                      <span className="font-medium text-slate-800">
                        {formatPaiseToInr(order.cgstPaise)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>State GST (SGST 9%):</span>
                      <span className="font-medium text-slate-800">
                        {formatPaiseToInr(order.sgstPaise)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Integrated GST (IGST 18%):</span>
                      <span className="font-medium text-slate-800">
                        {formatPaiseToInr(order.igstPaise)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Total Tax Included:</span>
                  <span className="font-semibold text-slate-700">
                    {formatPaiseToInr(order.totalTaxPaise)}
                  </span>
                </div>

                {/* Dotted Tear Line */}
                <div className="order-receipt-tear my-2" />

                {/* Grand Total */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Grand Total
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {order.taxSupplyType === "exempt"
                        ? "0% GST — Small business exemption"
                        : "Inc. of all applicable GST"}
                    </span>
                  </div>
                  <span className="text-xl font-black text-blue-700 tracking-tight">
                    {formatPaiseToInr(order.totalAmountPaise)}
                  </span>
                </div>

                {/* Reprint Thermal Receipt Actions */}
                <div className="pt-3.5 mt-3 border-t border-slate-100 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReceiptModalOpen(true)}
                    className="flex-1 h-8 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 cursor-pointer"
                  >
                    <Eye className="size-3.5 text-slate-500" />
                    <span>Preview Receipt</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePrintDocket}
                    className="flex-1 h-8 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Printer className="size-3.5 text-white" />
                    <span>Reprint Docket</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* ================= BILLING & PAYMENT SETTLEMENT CARD ================= */}
            <Card className="border-1.5 border-slate-200/90 bg-surface rounded-2xl shadow-2xs overflow-hidden no-print">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="size-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center p-1 shrink-0">
                    <LaundryCashRegisterIcon className="size-8" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Payment & Settlement
                    </CardTitle>
                    <p className="text-[11px] text-slate-500">
                      Authoritative payment tracking & balance due
                    </p>
                  </div>
                </div>

                <StatusBadge
                  status={effectivePaymentStatus}
                  label={
                    effectivePaymentStatus === "paid"
                      ? "Paid in Full"
                      : effectivePaymentStatus === "partially_paid"
                        ? "Partially Paid"
                        : effectivePaymentStatus === "refunded"
                          ? "Refunded"
                          : "Balance Due"
                  }
                  size="sm"
                />
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* 4 Metric Stat Tiles */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Total Billed */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Total Billed
                    </span>
                    <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">
                      {formatPaiseToInr(effectiveTotalPaise)}
                    </span>
                  </div>

                  {/* Amount Paid */}
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                    <span className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                      Amount Paid
                    </span>
                    <span className="text-base font-black font-mono text-emerald-800 mt-0.5 block">
                      {formatPaiseToInr(effectiveCapturedPaise)}
                    </span>
                  </div>

                  {/* Balance Due */}
                  <div
                    className={`p-3 rounded-xl border ${
                      effectiveBalanceDuePaise > 0
                        ? "bg-rose-50/80 border-rose-200/80 text-rose-900"
                        : "bg-slate-50 border-slate-200/70 text-slate-700"
                    }`}
                  >
                    <span
                      className={`block text-[10px] font-bold uppercase tracking-wider ${
                        effectiveBalanceDuePaise > 0 ? "text-rose-700" : "text-slate-400"
                      }`}
                    >
                      Balance Due
                    </span>
                    <span
                      className={`text-base font-black font-mono mt-0.5 block ${
                        effectiveBalanceDuePaise > 0 ? "text-rose-700" : "text-slate-800"
                      }`}
                    >
                      {formatPaiseToInr(effectiveBalanceDuePaise)}
                    </span>
                  </div>

                  {/* Refunded or Net Paid */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {effectiveRefundedPaise > 0 ? "Refunded" : "Net Paid"}
                    </span>
                    <span
                      className={`text-base font-black font-mono mt-0.5 block ${
                        effectiveRefundedPaise > 0 ? "text-purple-700" : "text-slate-900"
                      }`}
                    >
                      {effectiveRefundedPaise > 0
                        ? formatPaiseToInr(effectiveRefundedPaise)
                        : formatPaiseToInr(effectiveNetPaidPaise)}
                    </span>
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-1">
                  {effectiveBalanceDuePaise > 0 ? (
                    <Button
                      type="button"
                      onClick={handleOpenRecordPayment}
                      className="w-full h-11 text-xs font-bold rounded-xl pos-cta-btn gap-2 shadow-2xs cursor-pointer flex items-center justify-center"
                    >
                      <CashPaymentFlaticonIcon className="size-5" />
                      <span>Record Payment ({formatPaiseToInr(effectiveBalanceDuePaise)} Due)</span>
                    </Button>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 font-semibold">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        <span>All dues cleared in full</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleOpenRecordPayment}
                        className="h-7 text-[11px] rounded-lg border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        Add Advance
                      </Button>
                    </div>
                  )}
                </div>

                {/* Feedback message banner if payment/refund succeeded */}
                {billingActionMessage ? (
                  <Alert
                    variant={billingActionMessage.type === "success" ? "default" : "destructive"}
                    className={`rounded-xl p-3 text-xs ${
                      billingActionMessage.type === "success"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-rose-50 border-rose-200 text-rose-800"
                    }`}
                  >
                    <AlertDescription className="font-semibold">
                      {billingActionMessage.text}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {/* Payment Transactions Ledger */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Payment Transactions ({paymentsList.length})
                    </span>
                    {effectiveRefundedPaise > 0 ? (
                      <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        {refundsList.length} Refund{refundsList.length === 1 ? "" : "s"} Issued
                      </span>
                    ) : null}
                  </div>

                  {paymentsList.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No payments recorded yet for this order.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentsList.map((payment) => {
                        const refundablePaise =
                          payment.capturedAmountPaise - payment.refundedAmountPaise;
                        return (
                          <div
                            key={payment.id}
                            className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/70 text-xs space-y-2 hover:bg-slate-100/60 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-800">
                                  {payment.paymentNumber}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase font-bold bg-white text-slate-700 border-slate-200 px-1.5 py-0"
                                >
                                  {payment.paymentMethod.replace("_", " ")}
                                </Badge>
                              </div>
                              <span className="font-mono font-black text-slate-900">
                                {formatPaiseToInr(payment.capturedAmountPaise)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                              <span>{formatDateTime(payment.createdAt)}</span>
                              <div className="flex items-center gap-2">
                                {payment.refundedAmountPaise > 0 ? (
                                  <span className="text-purple-700 font-semibold text-[10px]">
                                    Refunded {formatPaiseToInr(payment.refundedAmountPaise)}
                                  </span>
                                ) : null}
                                {refundablePaise > 0 &&
                                (payment.status === "captured" || payment.status === "partially_refunded") ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRefund(payment)}
                                    className="text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Refund
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {payment.notes ? (
                              <p className="text-[10px] text-slate-500 italic bg-white/70 p-1 rounded border border-slate-200/50">
                                Note: {payment.notes}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Refunds History if present */}
                  {refundsList.length > 0 ? (
                    <div className="pt-2 border-t border-dashed border-slate-200 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider block">
                        Refund Receipts
                      </span>
                      {refundsList.map((ref) => (
                        <div
                          key={ref.id}
                          className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200/70 text-xs flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-bold text-purple-900 block">
                              {ref.refundNumber}
                            </span>
                            <span className="text-[10px] text-purple-600">
                              {ref.reason} • {formatDateTime(ref.createdAt)}
                            </span>
                          </div>
                          <span className="font-mono font-black text-rose-600 text-xs">
                            -{formatPaiseToInr(ref.amountPaise)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Delivery Schedule & Special Instructions Card */}
            <Card className="border-1.5 border-slate-200/90 bg-surface rounded-2xl shadow-2xs overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center gap-3">
                <div className="size-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center p-1">
                  <LaundryClockDeliveryIcon className="size-7" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Delivery & Handling
                  </CardTitle>
                  <p className="text-[11px] text-slate-500">
                    Promised delivery & customer instructions
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Promised Delivery Time
                  </span>
                  <div className="flex items-center gap-2 mt-1 p-2 rounded-xl bg-blue-50/70 border border-blue-200/60 text-blue-900 font-semibold">
                    <Calendar className="size-4 text-blue-600 shrink-0" />
                    <span>{formatDateTime(order.promisedDeliveryAt)}</span>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Special Handling Instructions
                  </span>
                  {order.specialInstructions ? (
                    <div className="mt-1 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 text-amber-900 leading-relaxed font-medium">
                      "{order.specialInstructions}"
                    </div>
                  ) : (
                    <p className="text-slate-400 mt-1 italic">
                      No special instructions provided.
                    </p>
                  )}
                </div>

                {/* Google Calendar Shipping Projection Event */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                      <GoogleCalendarFlaticon className="size-4" />
                      <span>Google Calendar Shipping Event</span>
                    </span>
                    {orderDetail?.calendarEvent?.success ? (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Event Synced
                      </span>
                    ) : (
                      <span className="text-[10px] text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        Scheduled
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Event Summary:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                        📦 Ship Order #{order.orderNumber}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Delivery Date:</span>
                      <span className="font-mono text-slate-700 font-semibold">
                        {formatDateTime(order.promisedDeliveryAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={
                          orderDetail?.calendarEvent?.htmlLink ??
                          `https://calendar.google.com/calendar/r/eventedit?text=Ship+Order+${encodeURIComponent(order.orderNumber)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] transition-colors flex items-center justify-center gap-1.5 shadow-2xs no-underline"
                      >
                        <GoogleCalendarFlaticon className="size-3.5" />
                        <span>Open in Google Calendar ↗</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleSyncCalendar}
                        disabled={syncingCalendar}
                        className="py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                        title="Re-sync event with Google Calendar"
                      >
                        {syncingCalendar ? (
                          <Loader2 className="size-3.5 animate-spin text-blue-600" />
                        ) : (
                          "Sync"
                        )}
                      </button>
                    </div>

                    {calendarSyncMessage ? (
                      <p className="text-[10px] text-emerald-600 font-medium text-center">
                        {calendarSyncMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status Transition Audit Log Card */}
            <Card className="border-1.5 border-slate-200/90 bg-surface rounded-2xl shadow-2xs overflow-hidden no-print">
              <CardHeader className="p-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="size-4 text-slate-500" />
                  <span>Order Status History</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                {statusHistory.map((h) => (
                  <div
                    key={h.id}
                    className="relative pl-5 pb-3 border-l-2 border-slate-200 last:border-0 last:pb-0"
                  >
                    <span className="absolute -left-[5px] top-1 size-2 rounded-full bg-blue-600 ring-4 ring-white" />
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                      {h.fromStatus ? (
                        <span className="text-[10px] font-normal text-slate-400">
                          (from {STATUS_LABELS[h.fromStatus] ?? h.fromStatus})
                        </span>
                      ) : null}
                    </div>
                    {h.reason ? (
                      <p className="text-slate-600 mt-0.5 leading-normal">
                        {h.reason}
                      </p>
                    ) : null}
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {formatDateTime(h.createdAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ================= HOLD MODAL DIALOG ================= */}
        <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
          <DialogPopup className="max-w-md rounded-2xl border-slate-200 p-6 shadow-xl">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertTriangle className="size-5 text-amber-600" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Put Order On Hold
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Order {order.orderNumber} will be paused until hold is resolved.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <label className="block text-xs font-bold text-slate-700">
                Select a reason or type custom details:
              </label>

              {/* Preset Quick Chips */}
              <div className="flex flex-wrap gap-1.5">
                {HOLD_REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHoldReason(preset)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors text-left cursor-pointer ${
                      holdReason === preset
                        ? "bg-amber-100 text-amber-900 border-amber-300 font-bold"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <Input
                placeholder="Specify reason for hold..."
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                className="h-10 text-xs rounded-xl border-slate-200 mt-2"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHoldDialogOpen(false);
                  setHoldReason("");
                }}
                className="rounded-xl border-slate-200 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={transitioning || !holdReason.trim()}
                onClick={() => handleStatusChange("hold", holdReason.trim())}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                {transitioning ? <Loader2 className="size-3.5 animate-spin" /> : null}
                <span>Confirm Hold</span>
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        {/* ================= RECORD PAYMENT MODAL DIALOG ================= */}
        <Dialog open={recordPaymentModalOpen} onOpenChange={setRecordPaymentModalOpen}>
          <DialogPopup className="max-w-md rounded-2xl border-slate-200 p-6 shadow-xl">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 border border-blue-200">
                  <LaundryCashRegisterIcon className="size-6" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Record Customer Payment
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Order #{order.orderNumber} • Total Due: {formatPaiseToInr(effectiveBalanceDuePaise)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-4 py-3">
              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: "cash" as PaymentMethod,
                      label: "Cash",
                      subtext: "Paper currency",
                      icon: <CashPaymentFlaticonIcon className="size-5" />,
                    },
                    {
                      id: "upi" as PaymentMethod,
                      label: "UPI / QR",
                      subtext: "GPay / PhonePe",
                      icon: <UpiPaymentFlaticonIcon className="size-5" />,
                    },
                    {
                      id: "card" as PaymentMethod,
                      label: "Debit / Card",
                      subtext: "Card swipe",
                      icon: <CardPaymentFlaticonIcon className="size-5" />,
                    },
                    {
                      id: "net_banking" as PaymentMethod,
                      label: "Net Banking",
                      subtext: "Direct transfer",
                      icon: <Building className="size-5 text-indigo-600" />,
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        paymentMethod === m.id
                          ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20"
                          : "bg-slate-50/70 border-slate-200/80 hover:bg-slate-100"
                      }`}
                    >
                      <div className="shrink-0">{m.icon}</div>
                      <div>
                        <span className="block text-xs font-bold text-slate-900">
                          {m.label}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {m.subtext}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Amount in INR */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Amount Received (₹):
                  </label>
                  {effectiveBalanceDuePaise > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentAmountRupees((effectiveBalanceDuePaise / 100).toFixed(2))
                      }
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Exact Due: {formatPaiseToInr(effectiveBalanceDuePaise)}
                    </button>
                  ) : null}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                    ₹
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    value={paymentAmountRupees}
                    onChange={(e) => setPaymentAmountRupees(e.target.value)}
                    placeholder="0.00"
                    className="pl-8 h-11 text-base font-black font-mono rounded-xl border-slate-200 bg-white focus-visible:border-blue-500"
                  />
                </div>
              </div>

              {/* Reference / Transaction Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Reference / Staff Note (Optional):
                </label>
                <Input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. UPI Ref #893201 or counter cash collected"
                  className="h-10 text-xs rounded-xl border-slate-200 bg-white"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRecordPaymentModalOpen(false)}
                  className="rounded-xl border-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={recordingPayment || !paymentAmountRupees}
                  className="rounded-xl pos-cta-btn font-bold gap-1.5 cursor-pointer"
                >
                  {recordingPayment ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  <span>Confirm Payment</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= PROCESS REFUND MODAL DIALOG ================= */}
        <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
          <DialogPopup className="max-w-md rounded-2xl border-slate-200 p-6 shadow-xl">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 border border-purple-200">
                  <RefundReturnFlaticonIcon className="size-6" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Process Payment Refund
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    {refundTargetPayment ? (
                      <>
                        Payment #{refundTargetPayment.paymentNumber} • Max Refundable:{" "}
                        <strong className="text-slate-700">
                          {formatPaiseToInr(
                            refundTargetPayment.capturedAmountPaise -
                              refundTargetPayment.refundedAmountPaise,
                          )}
                        </strong>
                      </>
                    ) : null}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleProcessRefundSubmit} className="space-y-4 py-3">
              {/* Refund Amount in INR */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Refund Amount (₹):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                    ₹
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    value={refundAmountRupees}
                    onChange={(e) => setRefundAmountRupees(e.target.value)}
                    placeholder="0.00"
                    className="pl-8 h-11 text-base font-black font-mono rounded-xl border-slate-200 bg-white focus-visible:border-purple-500"
                  />
                </div>
              </div>

              {/* Refund Reason with preset chips */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Refund Reason (Required):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Order Cancellation",
                    "Customer Overpayment",
                    "Damaged / Missing Garment",
                    "Service Quality Issue",
                    "Delivery Delay Goodwill",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRefundReason(preset)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors text-left cursor-pointer ${
                        refundReason === preset
                          ? "bg-purple-100 text-purple-900 border-purple-300 font-bold"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <Input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Specify refund reason..."
                  className="h-10 text-xs rounded-xl border-slate-200 bg-white"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefundModalOpen(false)}
                  className="rounded-xl border-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={processingRefund || !refundAmountRupees || !refundReason.trim()}
                  className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold gap-1.5 cursor-pointer shadow-2xs"
                >
                  {processingRefund ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  <span>Issue Refund</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= CANCEL ORDER DIALOG ================= */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogPopup className="max-w-md rounded-2xl border-slate-200 p-6 shadow-xl">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                  <XCircle className="size-6 text-rose-600" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Cancel Order #{order.orderNumber}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Cancelling will mark this order as cancelled and record an audit log.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <label className="block text-xs font-bold text-slate-700">
                Select or enter cancellation reason:
              </label>

              {/* Preset Chips */}
              <div className="flex flex-wrap gap-1.5">
                {CANCEL_REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCancelReason(preset)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors text-left cursor-pointer ${
                      cancelReason === preset
                        ? "bg-rose-100 text-rose-900 border-rose-300 font-bold"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <Input
                placeholder="Specify reason for cancelling..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="h-10 text-xs rounded-xl border-slate-200 mt-2"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCancelDialogOpen(false);
                  setCancelReason("");
                }}
                className="rounded-xl border-slate-200 text-xs"
              >
                Keep Order
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={cancelling}
                onClick={() => void handleConfirmCancel()}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-xs gap-1.5 cursor-pointer"
              >
                {cancelling ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
                <span>Confirm Cancellation</span>
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        {/* ================= EDIT ORDER MODAL DIALOG ================= */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogPopup className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-slate-200 p-6 shadow-2xl space-y-5">
            <DialogHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200">
                  <FoldedLaundryStackIcon className="size-7" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-slate-900">
                    Edit Order #{order.orderNumber}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Add or remove clothes, change quantities, weights, promised delivery date, and special instructions.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {editError ? (
              <Alert variant="destructive" className="py-2.5 rounded-xl">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-xs font-bold">Error updating order</AlertTitle>
                <AlertDescription className="text-xs">{editError}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSaveEditedOrder} className="space-y-5">
              {/* --- Section 1: Garments Currently in Order --- */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Garments in Order ({editLines.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Use + / - to adjust quantity or trash to remove
                  </span>
                </div>

                {editLines.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-amber-800 text-xs text-center font-medium">
                    No clothes in ticket. Please add at least one garment below.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden">
                    {editLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                            {renderFlaticonGarment(
                              line.itemNameSnapshot || "Garment",
                              line.itemNameSnapshot || "Garment",
                              "size-7",
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {line.itemNameSnapshot || "General Garment"}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-blue-700 font-semibold mt-0.5">
                              <span>{line.serviceNameSnapshot}</span>
                              <span className="text-slate-300">•</span>
                              <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200">
                                {line.pricingBasis === "per_item" ? "Per Piece" : "By Weight (kg)"}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Controls: Quantity or Weight Stepper + Delete */}
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          {line.pricingBasis === "per_item" ? (
                            <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateLineQty(idx, -1)}
                                className="size-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                                title="Decrease"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="w-9 text-center font-bold text-xs font-mono text-slate-900">
                                {line.quantityPieces}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateLineQty(idx, 1)}
                                className="size-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                                title="Increase"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={(line.weightGrams / 1000).toFixed(1)}
                                onChange={(e) =>
                                  handleUpdateLineWeight(idx, parseFloat(e.target.value) || 0.1)
                                }
                                className="w-20 h-8 text-xs font-bold font-mono text-center rounded-lg"
                              />
                              <span className="text-xs font-semibold text-slate-500">kg</span>
                            </div>
                          )}

                          {/* Delete Line Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(idx)}
                            className="size-8 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                            title="Remove from order"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* --- Section 2: Add More Clothes --- */}
              <div className="p-4 rounded-2xl border border-blue-200/80 bg-blue-50/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Plus className="size-4 text-blue-600 font-bold" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-950">
                    Add More Clothes / Services
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Service selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Service:
                    </label>
                    <select
                      value={selectedAddServiceId}
                      onChange={(e) => setSelectedAddServiceId(Number(e.target.value))}
                      className="w-full h-9 px-2.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      {catalogServices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.defaultPricingBasis === "per_item" ? "per item" : "per kg"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Garment item selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Garment / Article:
                    </label>
                    <select
                      value={selectedAddItemId}
                      onChange={(e) => setSelectedAddItemId(Number(e.target.value))}
                      className="w-full h-9 px-2.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      {catalogItems.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity / Weight input */}
                  <div>
                    {catalogServices.find((s) => s.id === selectedAddServiceId)?.defaultPricingBasis ===
                    "per_kg" ? (
                      <>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Weight (kg):
                        </label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={addWeightKg}
                          onChange={(e) => setAddWeightKg(parseFloat(e.target.value) || 0.1)}
                          className="h-9 text-xs rounded-xl bg-white"
                        />
                      </>
                    ) : (
                      <>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Quantity (pcs):
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={addQuantityPieces}
                          onChange={(e) =>
                            setAddQuantityPieces(Math.max(1, parseInt(e.target.value) || 1))
                          }
                          className="h-9 text-xs rounded-xl bg-white"
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="Optional item note (e.g. Silk fabric, delicate button)..."
                    value={addLineNotes}
                    onChange={(e) => setAddLineNotes(e.target.value)}
                    className="h-8 text-xs rounded-xl bg-white flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddGarmentToEdit}
                    className="h-8 px-3 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shrink-0 gap-1 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Add Item</span>
                  </Button>
                </div>
              </div>

              {/* --- Section 3: Delivery Date & Special Instructions --- */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Promised Delivery Date:
                  </label>
                  <Input
                    type="datetime-local"
                    value={editPromisedDate}
                    onChange={(e) => setEditPromisedDate(e.target.value)}
                    className="h-10 text-xs rounded-xl bg-white border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Special Instructions / Notes:
                  </label>
                  <Input
                    type="text"
                    placeholder="Care instructions, customer remarks..."
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                    className="h-10 text-xs rounded-xl bg-white border-slate-200"
                  />
                </div>
              </div>

              {/* --- Section 4: Live Recalculated Financial Quote --- */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Recalculated Order Total
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black font-mono text-white">
                      {editQuote
                        ? formatPaiseToInr(editQuote.totalAmountPaise)
                        : formatPaiseToInr(order.totalAmountPaise)}
                    </span>
                    {quotingEdit ? (
                      <Loader2 className="size-3 animate-spin text-blue-400" />
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-xs space-y-0.5 text-slate-300">
                  <div>
                    Subtotal:{" "}
                    <span className="font-mono text-white">
                      {editQuote
                        ? formatPaiseToInr(editQuote.subtotalPaise)
                        : formatPaiseToInr(order.subtotalPaise)}
                    </span>
                  </div>
                  <div>
                    GST Tax:{" "}
                    <span className="font-mono text-white">
                      {editQuote
                        ? formatPaiseToInr(editQuote.totalTaxPaise)
                        : formatPaiseToInr(order.totalTaxPaise)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-xl border-slate-200 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editSubmitting || editLines.length === 0}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 cursor-pointer shadow-2xs"
                >
                  {editSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  <span>Save Order Changes</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= THERMAL RECEIPT DOCKET PREVIEW MODAL ================= */}
        <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
          <DialogPopup className="max-w-md p-6 bg-slate-50 rounded-3xl">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer className="size-4 text-blue-600" />
                <span>Thermal Receipt Docket Preview</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                80mm thermal receipt format with live tracking & UPI QR code.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto pos-scroll py-2">
              <ReceiptDocket
                order={order}
                items={items}
                paidPaise={effectiveCapturedPaise}
                balanceDuePaise={effectiveBalanceDuePaise}
                refundedPaise={effectiveRefundedPaise}
                paymentMethodLabel={
                  paymentsList.length > 0
                    ? paymentsList[0].paymentMethod.toUpperCase()
                    : undefined
                }
                specialInstructions={order.specialInstructions ?? undefined}
                isReprint={true}
                inlinePreview={true}
              />
            </div>

            <DialogFooter className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReceiptModalOpen(false)}
                className="h-9 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setReceiptModalOpen(false);
                  setTimeout(() => handlePrintDocket(), 150);
                }}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs cursor-pointer"
              >
                <Printer className="size-3.5" />
                <span>Print Thermal Docket</span>
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        {/* ================= ACTIVE PRINT DOCKET (Thermal / Standard ReceiptDocket) ================= */}
        <ReceiptDocket
          order={order}
          items={items}
          paidPaise={effectiveCapturedPaise}
          balanceDuePaise={effectiveBalanceDuePaise}
          refundedPaise={effectiveRefundedPaise}
          paymentMethodLabel={
            paymentsList.length > 0
              ? paymentsList[0].paymentMethod.toUpperCase()
              : undefined
          }
          specialInstructions={order.specialInstructions ?? undefined}
          isReprint={true}
        />
      </div>
    </TooltipProvider>
  );
}
