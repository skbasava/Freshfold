import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Minus,
  Phone,
  Plus,
  Printer,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/http/api-client";
import {
  CashPaymentFlaticonIcon,
  CardPaymentFlaticonIcon,
  FoldedLaundryStackIcon,
  renderFlaticonGarment,
  renderFlaticonService,
  SmsMessageFlaticonIcon,
  UpiPaymentFlaticonIcon,
  WhatsAppFlaticonIcon,
} from "../components/PosFlaticons";
import {
  defaultOrdersService,
  formatDateTime,
  formatPaiseToInr,
  type OrdersService,
} from "../services/orders.service";
import type {
  CreateOrderLineInput,
  OrderBillingSummary,
  OrderDetail,
  PaymentMethod,
  PricingQuoteResult,
} from "../types/orders.types";
import { ReceiptDocket } from "../components/ReceiptDocket";

function GoogleCalendarFlaticonIcon({ className }: { className?: string }) {
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

interface CustomerOption {
  id: number;
  customerCode: string;
  fullName: string;
  phone: string;
  email?: string | null;
}

interface ServiceOption {
  id: number;
  code: string;
  name: string;
  defaultPricingBasis?: "per_item" | "per_kg";
  turnaroundHours?: number;
}

interface ItemOption {
  id: number;
  categoryId: number;
  code: string;
  name: string;
}

interface RateCardItemLookup {
  serviceId: number;
  itemId: number | null;
  pricingBasis: "per_item" | "per_kg";
  unitPricePaise: number;
}

export interface CreateOrderPageProps {
  ordersService?: OrdersService;
}

export function CreateOrderPage({
  ordersService = defaultOrdersService,
}: CreateOrderPageProps) {
  const navigate = useNavigate();

  // Catalogs
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [ratePrices, setRatePrices] = useState<Record<string, number>>({});
  const [loadingLookups, setLoadingLookups] = useState(true);

  // POS State
  const [activeServiceId, setActiveServiceId] = useState<number>(0);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const selectedCustomerId = selectedCustomer?.id ?? null;
  const [isChangingCustomer, setIsChangingCustomer] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerOption[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const [garmentSearch, setGarmentSearch] = useState("");
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<"ALL" | "GARMENTS" | "HOUSEHOLD">("ALL");

  // Order Ticket (Lines) - All per_item / pieces
  const [lines, setLines] = useState<CreateOrderLineInput[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState("");

  // Live Pricing Quote Engine
  const [quote, setQuote] = useState<PricingQuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);

  // 3-Step Checkout Flow
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "payment" | "complete">("cart");

  // Step 2: Payment Settlement State
  const [paymentType, setPaymentType] = useState<"full" | "delivery" | "advance">("full");
  const [customAdvanceRupees, setCustomAdvanceRupees] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Step 3: Complete State & Created Order Reference
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<OrderDetail | null>(null);
  const [createdBilling, setCreatedBilling] = useState<OrderBillingSummary | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<{
    whatsapp?: boolean;
    sms?: boolean;
  }>({});
  const [copiedOrderNumber, setCopiedOrderNumber] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);

  // Quick Customer Modal
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustSubmitting, setNewCustSubmitting] = useState(false);
  const [newCustError, setNewCustError] = useState<string | null>(null);

  // Quick Garment Modal
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<1 | 2>(1);
  const [newItemBasePrice, setNewItemBasePrice] = useState("100");
  const [newItemSubmitting, setNewItemSubmitting] = useState(false);
  const [newItemError, setNewItemError] = useState<string | null>(null);

  function handleSelectCustomer(customer: CustomerOption) {
    setSelectedCustomer(customer);
    setIsChangingCustomer(false);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
    setError(null);
  }

  // Click outside to dismiss customer search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        customerSearchRef.current &&
        !customerSearchRef.current.contains(event.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Debounced Lazy Search after 3+ digits/characters
  useEffect(() => {
    const trimmed = customerSearchQuery.trim();
    if (trimmed.length < 3) {
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    let active = true;
    setIsSearchingCustomer(true);
    const timer = setTimeout(() => {
      apiFetch(`/api/v1/customers?search=${encodeURIComponent(trimmed)}&limit=15`)
        .then(async (res) => {
          if (!res.ok) return [];
          const json = (await res.json()) as {
            data?: { items?: CustomerOption[] } | CustomerOption[];
          };
          const list = Array.isArray(json.data)
            ? json.data
            : json.data?.items ?? [];
          return list;
        })
        .then((results) => {
          if (active) {
            setCustomerSearchResults(results);
            setShowCustomerDropdown(true);
            setIsSearchingCustomer(false);
          }
        })
        .catch(() => {
          if (active) {
            setCustomerSearchResults([]);
            setIsSearchingCustomer(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerSearchQuery]);

  // Load Initial Database Data
  async function loadInitialData() {
    setLoadingLookups(true);
    try {
      const [cRes, sRes, iRes, rRes] = await Promise.all([
        apiFetch("/api/v1/customers?limit=100").catch(() => null),
        apiFetch("/api/v1/services").catch(() => null),
        apiFetch("/api/v1/items?limit=100&includeInactive=true").catch(() => null),
        apiFetch("/api/v1/rate-cards/1/items").catch(() => null),
      ]);

      if (cRes && cRes.ok) {
        const cJson = (await cRes.json()) as {
          data?: { items?: CustomerOption[] } | CustomerOption[];
        };
        const rawCusts = Array.isArray(cJson.data)
          ? cJson.data
          : cJson.data?.items ?? [];
        setCustomers(
          rawCusts.map((c: any) => ({
            id: c.id,
            customerCode: c.customerCode,
            fullName: c.fullName,
            phone: c.phone,
            email: c.email,
          })),
        );
      }

      let servs: ServiceOption[] = [];
      if (sRes && sRes.ok) {
        const sJson = (await sRes.json()) as {
          data?: { items?: ServiceOption[] } | ServiceOption[];
        };
        servs = Array.isArray(sJson.data)
          ? sJson.data
          : sJson.data?.items ?? [];
        setServices(servs);
        if (servs.length > 0 && activeServiceId === 0) {
          setActiveServiceId(servs[0].id);
        }
      }

      let itemsList: ItemOption[] = [];
      if (iRes && iRes.ok) {
        const iJson = (await iRes.json()) as {
          data?: { items?: ItemOption[] } | ItemOption[];
        };
        itemsList = Array.isArray(iJson.data)
          ? iJson.data
          : iJson.data?.items ?? [];

        // Ensure all items are active
        const inactiveItems = itemsList.filter(
          (it: any) => it.isActive === false || it.active === false,
        );
        if (inactiveItems.length > 0) {
          void Promise.all(
            inactiveItems.map((it) =>
              apiFetch(`/api/v1/items/${it.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ isActive: true }),
              }).catch(() => null),
            ),
          );
        }

        itemsList = itemsList.map((it: any) => ({
          ...it,
          isActive: true,
          active: true,
        }));
        setItems(itemsList);
      }

      if (rRes && rRes.ok) {
        const rJson = (await rRes.json()) as {
          data?: RateCardItemLookup[];
        };
        const rates = rJson.data ?? [];
        const map: Record<string, number> = {};
        for (const r of rates) {
          const key = `${r.serviceId}:${r.itemId ?? "none"}`;
          map[key] = r.unitPricePaise;
        }
        setRatePrices(map);
      }
    } catch {
      setError("Could not load laundry catalog. Please refresh the page.");
    } finally {
      setLoadingLookups(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  // Default delivery to +48 hours
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setPromisedDeliveryDate(d.toISOString().slice(0, 16));
  }, []);

  function setTurnaroundPreset(hours: number) {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    setPromisedDeliveryDate(d.toISOString().slice(0, 16));
  }

  // Active Service Record
  const activeService = useMemo(() => {
    return services.find((s) => s.id === activeServiceId) ?? services[0];
  }, [services, activeServiceId]);

  // Filtered Garments
  const filteredGarments = useMemo(() => {
    return items.filter((it) => {
      if (selectedCategoryTab === "GARMENTS" && it.categoryId !== 1) return false;
      if (selectedCategoryTab === "HOUSEHOLD" && it.categoryId !== 2) return false;
      if (
        garmentSearch.trim() &&
        !it.name.toLowerCase().includes(garmentSearch.toLowerCase()) &&
        !it.code.toLowerCase().includes(garmentSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [items, selectedCategoryTab, garmentSearch]);

  // Total items in ticket (all per piece)
  const totalTicketPieces = useMemo(() => {
    return lines.reduce((acc, line) => {
      return acc + (line.quantityPieces ?? 1);
    }, 0);
  }, [lines]);

  // Payment settlement calculations for Step 2
  const totalPayablePaise = quote?.totalAmountPaise ?? 0;
  const advancePaise = Math.round((parseFloat(customAdvanceRupees) || 0) * 100);
  const collectNowPaise =
    paymentType === "full"
      ? totalPayablePaise
      : paymentType === "delivery"
        ? 0
        : Math.min(totalPayablePaise, advancePaise);
  const balanceDuePaise = Math.max(0, totalPayablePaise - collectNowPaise);

  // Live Quote Engine
  useEffect(() => {
    if (!selectedCustomerId) {
      setQuote(null);
      return;
    }

    const validLines = lines.filter((l) => {
      return l.serviceId > 0 && typeof l.itemId === "number" && l.itemId > 0;
    });

    if (validLines.length === 0) {
      setQuote(null);
      return;
    }

    let isMounted = true;
    setQuoting(true);

    ordersService
      .calculateQuote({
        customerId: selectedCustomerId,
        lines: validLines,
      })
      .then((res) => {
        if (isMounted) setQuote(res);
      })
      .catch(() => {
        if (isMounted) setQuote(null);
      })
      .finally(() => {
        if (isMounted) setQuoting(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCustomerId, lines, ordersService]);

  // Add garment to ticket (Always per piece)
  function handleAddGarmentToTicket(item: ItemOption) {
    if (!activeService) return;
    setError(null);

    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (l) => l.serviceId === activeService.id && l.itemId === item.id,
      );

      if (existingIdx >= 0) {
        const copy = [...prev];
        const currentQty = copy[existingIdx].quantityPieces ?? 1;
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantityPieces: currentQty + 1,
        };
        return copy;
      }

      return [
        ...prev,
        {
          serviceId: activeService.id,
          itemId: item.id,
          pricingBasis: "per_item",
          quantityPieces: 1,
          discountPaise: 0,
        },
      ];
    });
  }

  // Adjust line quantities in ticket (per piece)
  function handleUpdateQuantity(index: number, delta: number) {
    setLines((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;

      const nextQty = (target.quantityPieces ?? 1) + delta;
      if (nextQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      copy[index] = { ...target, quantityPieces: nextQty };
      return copy;
    });
  }

  function handleRemoveLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClearTicket() {
    setLines([]);
    setQuote(null);
    setError(null);
  }

  // Quick Customer Creation
  async function handleCreateCustomerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      setNewCustError("Name and Phone are required.");
      return;
    }

    setNewCustSubmitting(true);
    setNewCustError(null);

    try {
      const res = await apiFetch("/api/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: newCustName.trim(),
          phone: newCustPhone.trim(),
          email: newCustEmail.trim() || null,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errJson?.message ?? "Failed to create customer profile.");
      }

      const json = (await res.json()) as { data: CustomerOption };
      const created = json.data;

      setCustomers((prev) => [created, ...prev]);
      handleSelectCustomer(created);
      setShowNewCustomerModal(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNotice(`Customer ${created.fullName} created and selected!`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setNewCustError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setNewCustSubmitting(false);
    }
  }

  // Quick Garment Creation
  async function handleCreateItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) {
      setNewItemError("Item name is required.");
      return;
    }

    setNewItemSubmitting(true);
    setNewItemError(null);

    const generatedCode = `ITM-${newItemName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8)}-${Date.now().toString().slice(-4)}`;

    try {
      const res = await apiFetch("/api/v1/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categoryId: newItemCategory,
          code: generatedCode,
          name: newItemName.trim(),
          hsnSacCode: "999712",
          isActive: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create garment item in catalog.");
      }

      const json = (await res.json()) as { data: ItemOption };
      const createdItem = json.data;

      // Add rate card entries in database for each service (all per piece)
      const basePaise = Math.round((parseFloat(newItemBasePrice) || 100) * 100);
      const nowIso = new Date().toISOString();
      const rateUpdates: Record<string, number> = {};

      const ratePromises = services.map((svc) => {
        let svcPricePaise = basePaise;
        if (svc.code.includes("dry") || svc.name.toLowerCase().includes("dry clean")) {
          svcPricePaise = Math.round(basePaise * 1.5);
        } else if (svc.code.includes("iron") || svc.name.toLowerCase().includes("iron")) {
          svcPricePaise = Math.max(2000, Math.round(basePaise * 0.4));
        } else if (svc.code.includes("fold") || svc.name.toLowerCase().includes("wash & fold")) {
          svcPricePaise = Math.max(3000, Math.round(basePaise * 0.6));
        }

        rateUpdates[`${svc.id}:${createdItem.id}`] = svcPricePaise;

        return apiFetch("/api/v1/rate-cards/1/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            serviceId: svc.id,
            itemId: createdItem.id,
            taxRateId: 1,
            pricingBasis: "per_item",
            unitPricePaise: svcPricePaise,
            effectiveFrom: nowIso,
          }),
        }).catch(() => null);
      });

      await Promise.all(ratePromises);

      setRatePrices((prev) => ({ ...prev, ...rateUpdates }));
      setItems((prev) => [...prev, createdItem]);
      setShowNewItemModal(false);
      setNewItemName("");

      handleAddGarmentToTicket(createdItem);

      setNotice(`Garment "${createdItem.name}" added to catalog with live rates!`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setNewItemError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setNewItemSubmitting(false);
    }
  }

  // Workflow Handlers
  function handleProceedToPayment() {
    if (!selectedCustomerId) {
      setError("Please search and select a customer before proceeding.");
      return;
    }
    if (lines.length === 0) {
      setError("Order ticket is empty. Select garments to add.");
      return;
    }
    setError(null);
    setPaymentType("full");
    setPaymentMethod("cash");
    setCustomAdvanceRupees("");
    setPaymentNotes("");
    setCheckoutStep("payment");
  }

  async function handleConfirmAndPlaceOrder() {
    if (!selectedCustomerId || lines.length === 0) {
      setError("Please select a customer and add at least one garment.");
      setCheckoutStep("cart");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await ordersService.createOrder({
        customerId: selectedCustomerId,
        promisedDeliveryAt: promisedDeliveryDate
          ? new Date(promisedDeliveryDate).toISOString()
          : null,
        specialInstructions: specialInstructions.trim() || null,
        lines: lines.map((l) => ({
          serviceId: l.serviceId,
          itemId: l.itemId,
          pricingBasis: "per_item",
          quantityPieces: l.quantityPieces ?? 1,
          discountPaise: l.discountPaise ?? 0,
        })),
      });

      let billingSummary: OrderBillingSummary | null = null;

      if (collectNowPaise > 0) {
        try {
          const payRes = await ordersService.recordPayment(created.order.id, {
            paymentMethod,
            amountPaise: collectNowPaise,
            notes: paymentNotes.trim() || undefined,
          });
          billingSummary = payRes.billing;
        } catch {
          billingSummary = await ordersService.getOrderBilling(created.order.id).catch(() => null);
        }
      } else {
        billingSummary = await ordersService.getOrderBilling(created.order.id).catch(() => null);
      }

      setCreatedOrder(created);
      setCreatedBilling(billingSummary);
      setNotificationStatus({});
      setCheckoutStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order.");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePrintDocket() {
    window.print();
  }

  function handleCopyOrderNumber() {
    if (!createdOrder) return;
    void navigator.clipboard.writeText(createdOrder.order.orderNumber);
    setCopiedOrderNumber(true);
    setTimeout(() => setCopiedOrderNumber(false), 2000);
  }

  async function handleSendWhatsApp() {
    if (!createdOrder) return;
    const phone = createdOrder.order.customerPhone ?? selectedCustomer?.phone ?? "";
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const totalFormatted = formatPaiseToInr(createdOrder.order.totalAmountPaise);
    const paidFormatted = formatPaiseToInr(
      createdBilling?.capturedAmountPaise ??
        (paymentType === "full" ? createdOrder.order.totalAmountPaise : 0),
    );
    const dueFormatted = formatPaiseToInr(
      createdBilling?.balanceDuePaise ??
        (paymentType === "delivery" ? createdOrder.order.totalAmountPaise : 0),
    );
    const deliveryFormatted = formatDateTime(createdOrder.order.promisedDeliveryAt);
    const primarySvc = createdOrder.order.primaryService || "Laundry Services";

    const message = `🧺 *FreshFold Laundry Order Confirmation*
Order #: *${createdOrder.order.orderNumber}*
Customer: *${createdOrder.order.customerName}*
Service: ${primarySvc}
Items: ${createdOrder.items.length} pcs
Total Amount: ${totalFormatted}
Amount Paid: ${paidFormatted}
Balance Due: ${dueFormatted}
Promised Delivery: ${deliveryFormatted}

Thank you for choosing FreshFold!`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${targetPhone}?text=${encoded}`, "_blank");

    try {
      if (ordersService.sendNotification) {
        await ordersService.sendNotification(createdOrder.order.id, {
          channel: "whatsapp",
          recipientPhone: phone,
          message,
        });
      }
      setNotificationStatus((prev) => ({ ...prev, whatsapp: true }));
      setNotificationNotice("WhatsApp confirmation dispatched!");
      setTimeout(() => setNotificationNotice(null), 3000);
    } catch {
      setNotificationStatus((prev) => ({ ...prev, whatsapp: true }));
    }
  }

  async function handleSendSms() {
    if (!createdOrder) return;
    const phone = createdOrder.order.customerPhone ?? selectedCustomer?.phone ?? "";
    const totalFormatted = formatPaiseToInr(createdOrder.order.totalAmountPaise);

    const message = `FreshFold: Your laundry order #${createdOrder.order.orderNumber} for ${totalFormatted} is confirmed! Estimated ready date: ${formatDateTime(createdOrder.order.promisedDeliveryAt)}.`;

    try {
      if (ordersService.sendNotification) {
        await ordersService.sendNotification(createdOrder.order.id, {
          channel: "sms",
          recipientPhone: phone,
          message,
        });
      }
      setNotificationStatus((prev) => ({ ...prev, sms: true }));
      setNotificationNotice("SMS notification triggered via provider!");
      setTimeout(() => setNotificationNotice(null), 3000);
    } catch {
      setNotificationStatus((prev) => ({ ...prev, sms: true }));
    }
  }

  function handleStartNewOrder() {
    setLines([]);
    setQuote(null);
    setSelectedCustomer(null);
    setCreatedOrder(null);
    setCreatedBilling(null);
    setNotificationStatus({});
    setSpecialInstructions("");
    setError(null);
    setNotice(null);
    setCheckoutStep("cart");
  }

  return (
    <TooltipProvider delay={250}>
      <div className="pos-workspace pb-6 select-none max-w-[1700px] mx-auto px-2 sm:px-4">
        {/* ================= HEADER BAR ================= */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-xs"
                    nativeButton={false}
                    render={<Link to="/orders" />}
                    aria-label="Back to orders"
                    className="size-8 rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>Back to orders list</TooltipContent>
            </Tooltip>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                  Laundry Counter POS
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                High-velocity counter checkout & docket generation (Per-Piece Services)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewCustomerModal(true)}
              className="h-8 gap-1.5 text-xs font-semibold rounded-xl border-slate-200 hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700 transition-colors"
            >
              <UserPlus className="size-3.5 text-blue-600" />
              <span>New Customer</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewItemModal(true)}
              className="h-8 gap-1.5 text-xs font-semibold rounded-xl border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-colors"
            >
              <Tag className="size-3.5 text-indigo-600" />
              <span>New Garment</span>
            </Button>
          </div>
        </div>

        {/* Global Notifications */}
        {error ? (
          <Alert variant="destructive" className="mb-4 py-2.5 rounded-xl shadow-xs">
            <AlertCircle className="size-4" />
            <AlertTitle className="text-xs font-bold">POS Warning</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}

        {notice ? (
          <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-blue-600" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-blue-500 hover:text-blue-700 text-sm font-bold"
            >
              ×
            </button>
          </div>
        ) : null}

        {/* ================= MAIN SPLIT VIEW (Catalog Left + Fixed Order Ticket Right) ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ================= LEFT COLUMN: Services & Catalog (7 cols) ================= */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* 1. Service Ribbon (All Per Piece) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {services.map((svc) => {
                const isActive = svc.id === activeService?.id;

                // Dynamic minimum starting price per piece from rate card
                const serviceRates = Object.entries(ratePrices)
                  .filter(
                    ([key, val]) =>
                      key.startsWith(`${svc.id}:`) &&
                      !key.endsWith(":none") &&
                      val > 0,
                  )
                  .map(([, val]) => val);

                let priceHint = "Per Piece";
                if (serviceRates.length > 0) {
                  const minRate = Math.min(...serviceRates);
                  priceHint = `From ${formatPaiseToInr(minRate)}/pc`;
                } else if (ratePrices[`${svc.id}:none`]) {
                  priceHint = `${formatPaiseToInr(ratePrices[`${svc.id}:none`])}/pc`;
                }

                return (
                  <motion.button
                    key={svc.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveServiceId(svc.id)}
                    className={`pos-service-card p-3 rounded-2xl flex flex-col justify-between min-h-[92px] ${
                      isActive ? "pos-service-card-active" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-1 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                        {renderFlaticonService(svc.code, "size-7")}
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {priceHint}
                      </span>
                    </div>

                    <div className="text-left mt-2">
                      <div className="font-bold text-xs text-slate-900 truncate">
                        {svc.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {svc.turnaroundHours ? `~${svc.turnaroundHours}h turnaround` : "Standard delivery"}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* 2. Garment Search & Category Filter Pills */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search garments by name or code (e.g. Shirt, Saree, Suit)..."
                  value={garmentSearch}
                  onChange={(e) => setGarmentSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl border-slate-200 bg-slate-50/70 focus-visible:bg-white"
                />
                {garmentSearch ? (
                  <button
                    type="button"
                    onClick={() => setGarmentSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto overflow-x-auto pos-scroll">
                {(["ALL", "GARMENTS", "HOUSEHOLD"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSelectedCategoryTab(tab)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedCategoryTab === tab
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tab === "ALL" ? "All" : tab === "GARMENTS" ? "Apparel" : "Linen"}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Garment Item Grid (All Per Piece) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredGarments.map((item) => {
                const serviceRateKey = `${activeService?.id}:${item.id}`;
                const fallbackRateKey = `${activeService?.id}:none`;
                const pricePaise =
                  ratePrices[serviceRateKey] ?? ratePrices[fallbackRateKey] ?? 5000;

                const inTicketLine = lines.find(
                  (l) => l.serviceId === activeService?.id && l.itemId === item.id,
                );
                const currentQty = inTicketLine?.quantityPieces ?? 0;

                // Available rates for other services for this item
                const otherRates = services
                  .filter((s) => s.id !== activeService?.id)
                  .map((s) => {
                    const price = ratePrices[`${s.id}:${item.id}`] ?? ratePrices[`${s.id}:none`];
                    return {
                      serviceName: s.name,
                      serviceCode: s.code,
                      unitPricePaise: price,
                    };
                  })
                  .filter((r) => r.unitPricePaise && r.unitPricePaise > 0);

                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    layout
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleAddGarmentToTicket(item)}
                    className={`pos-garment-card p-3 rounded-2xl flex flex-col justify-between cursor-pointer border transition-all text-left w-full ${
                      currentQty > 0
                        ? "border-blue-500 bg-blue-50/20 shadow-xs"
                        : "border-slate-200 hover:border-blue-300 hover:shadow-xs"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5 mb-2">
                        <div className="size-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                          {renderFlaticonGarment(item.name, item.code, "size-8")}
                        </div>

                        {currentQty > 0 ? (
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-2xs">
                            {currentQty} pcs
                          </span>
                        ) : null}
                      </div>

                      <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{item.name}</h4>
                      <p className="font-mono text-[10px] text-slate-400 mt-0.5">{item.code}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100">
                      {/* Active Service Rate */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-blue-700 truncate max-w-[80px]">
                          {activeService?.name || "Service"}
                        </span>
                        <span className="font-mono font-bold text-xs text-slate-900">
                          {formatPaiseToInr(pricePaise)}/pc
                        </span>
                      </div>

                      {/* Stepper or Add Prompt */}
                      {currentQty > 0 ? (
                        <div
                          className="flex items-center justify-between bg-white rounded-lg border border-blue-200 p-0.5 shadow-2xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const idx = lines.findIndex(
                                (l) =>
                                  l.serviceId === activeService?.id &&
                                  l.itemId === item.id,
                              );
                              if (idx >= 0) handleUpdateQuantity(idx, -1);
                            }}
                            className="size-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer select-none"
                          >
                            <Minus className="size-3" />
                          </span>

                          <span className="font-mono text-xs font-bold text-slate-900">
                            {currentQty}
                          </span>

                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const idx = lines.findIndex(
                                (l) =>
                                  l.serviceId === activeService?.id &&
                                  l.itemId === item.id,
                              );
                              if (idx >= 0) handleUpdateQuantity(idx, 1);
                            }}
                            className="size-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center cursor-pointer select-none"
                          >
                            <Plus className="size-3" />
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors">
                          <Plus className="size-3 mr-1" />
                          <span>Add to Cart</span>
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* ================= RIGHT COLUMN: Fixed Desktop Order Ticket (5 cols) ================= */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-3 lg:h-[calc(100vh-15rem)] flex flex-col">
            <Card className="flex flex-col h-full rounded-2xl shadow-sm bg-slate-50 overflow-hidden">
              {/* FIXED TICKET HEADER */}
              <CardHeader className="shrink-0 p-3.5 bg-slate-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-black text-slate-900">
                      Order Summary
                    </CardTitle>
                    {lines.length > 0 ? (
                      <Badge className="bg-blue-600 text-white font-mono text-[10px] px-1.5 py-0">
                        {totalTicketPieces} pcs
                      </Badge>
                    ) : null}
                  </div>

                  {lines.length > 0 && checkoutStep === "cart" ? (
                    <button
                      type="button"
                      onClick={handleClearTicket}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                {/* 3-Step Navigation Pills */}
                <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutStep !== "complete") setCheckoutStep("cart");
                    }}
                    className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      checkoutStep === "cart"
                        ? "bg-white text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    1. Cart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (lines.length > 0 && selectedCustomerId && checkoutStep !== "complete") {
                        handleProceedToPayment();
                      }
                    }}
                    disabled={lines.length === 0 || !selectedCustomerId || checkoutStep === "complete"}
                    className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${
                      checkoutStep === "payment"
                        ? "bg-white text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    2. Payment
                  </button>
                  <span
                    className={`py-1 rounded-lg text-xs font-bold ${
                      checkoutStep === "complete"
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "text-slate-400"
                    }`}
                  >
                    3. Print
                  </span>
                </div>
              </CardHeader>

              {/* SCROLLABLE CENTER BODY (Internal Scroll) */}
              <CardContent className="flex-1 min-h-0 overflow-y-auto pos-scroll p-4 space-y-3.5 bg-white">
                <AnimatePresence mode="wait">
                  {/* ================= STEP 1: CART VIEW ================= */}
                  {checkoutStep === "cart" && (
                    <motion.div
                      key="cart-step"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3.5"
                    >
                      {/* Customer Selection Card */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                          <span>Customer Profile *</span>
                          {selectedCustomer ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsChangingCustomer(true);
                                setCustomerSearchQuery("");
                                setShowCustomerDropdown(false);
                                setTimeout(() => customerInputRef.current?.focus(), 50);
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              Change
                            </button>
                          ) : null}
                        </Label>

                        {selectedCustomer && !isChangingCustomer ? (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/50 border border-blue-200">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="size-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                {selectedCustomer.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {selectedCustomer.fullName}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                                    {selectedCustomer.customerCode}
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone className="size-2.5 text-blue-600" />
                                  <span>{selectedCustomer.phone}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div ref={customerSearchRef} className="relative">
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                              <Input
                                ref={customerInputRef}
                                type="tel"
                                placeholder="Search mobile number (e.g. 9876)..."
                                value={customerSearchQuery}
                                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                onFocus={() => {
                                  if (customerSearchResults.length > 0) setShowCustomerDropdown(true);
                                }}
                                className="pl-9 h-9 text-xs font-mono rounded-xl border-slate-200"
                              />
                              {isSearchingCustomer ? (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-blue-600" />
                              ) : null}
                            </div>

                            {/* Lazy search prompt */}
                            {customerSearchQuery.trim().replace(/\D/g, "").length === 1 && (
                              <p className="text-[11px] text-slate-500 mt-1 pl-1">
                                Type 2 more digits to search...
                              </p>
                            )}
                            {customerSearchQuery.trim().replace(/\D/g, "").length === 2 && (
                              <p className="text-[11px] text-slate-500 mt-1 pl-1">
                                Type 1 more digit to search...
                              </p>
                            )}

                            {/* Autocomplete Dropdown */}
                            {showCustomerDropdown && customerSearchResults.length > 0 ? (
                              <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100">
                                {customerSearchResults.map((cust) => (
                                  <button
                                    key={cust.id}
                                    type="button"
                                    onClick={() => handleSelectCustomer(cust)}
                                    className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between cursor-pointer"
                                  >
                                    <div>
                                      <div className="font-bold text-xs text-slate-900">
                                        {cust.fullName}
                                      </div>
                                      <div className="font-mono text-[11px] text-slate-500">
                                        {cust.phone} • {cust.customerCode}
                                      </div>
                                    </div>
                                    <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                      Select
                                    </Badge>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* Ticket Lines List (All Per Piece) */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">
                          Garment Items ({lines.length})
                        </Label>

                        {lines.length === 0 ? (
                          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
                            <FoldedLaundryStackIcon className="size-7 mx-auto mb-1.5 opacity-60" />
                            <p className="text-xs font-bold text-slate-700">Cart is empty</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Click any garment on the left to add
                            </p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 max-h-92 overflow-y-auto pos-scroll pr-1">
                            {lines.map((line, idx) => {
                              const itm = items.find((i) => i.id === line.itemId);
                              const svc = services.find((s) => s.id === line.serviceId);
                              const quotedLine = quote?.lines?.[idx];
                              const unitRatePaise =
                                ratePrices[`${line.serviceId}:${line.itemId ?? "none"}`];
                              const calculatedFallback = unitRatePaise
                                ? unitRatePaise * (line.quantityPieces ?? 1)
                                : 0;

                              return (
                                <div
                                  key={idx}
                                  className="py-2 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs text-slate-900 truncate">
                                      {itm?.name ?? "Garment"}
                                    </div>
                                    <div className="text-[10px] text-blue-700 font-semibold flex items-center gap-1.5">
                                      <span>{svc?.name}</span>
                                      {unitRatePaise ? (
                                        <span className="text-slate-400 font-mono font-normal">
                                          ({formatPaiseToInr(unitRatePaise)}/pc)
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {/* Stepper */}
                                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateQuantity(idx, -1)}
                                        className="size-5 rounded flex items-center justify-center text-slate-600 hover:bg-white cursor-pointer"
                                      >
                                        <Minus className="size-2.5" />
                                      </button>
                                      <span className="w-6 text-center font-bold text-xs font-mono text-slate-900">
                                        {line.quantityPieces ?? 1}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateQuantity(idx, 1)}
                                        className="size-5 rounded flex items-center justify-center text-slate-600 hover:bg-white cursor-pointer"
                                      >
                                        <Plus className="size-2.5" />
                                      </button>
                                    </div>

                                    <span className="w-14 text-right font-mono font-bold text-xs text-slate-900">
                                      {quotedLine
                                        ? formatPaiseToInr(quotedLine.lineTotalPaise)
                                        : calculatedFallback > 0
                                          ? formatPaiseToInr(calculatedFallback)
                                          : "—"}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveLine(idx)}
                                      className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Turnaround & Delivery Presets */}
                      <div className="space-y-1 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Clock className="size-3 text-blue-600" />
                            <span>Promised Ready Date</span>
                          </Label>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setTurnaroundPreset(24)}
                              className="font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              +24h
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                              type="button"
                              onClick={() => setTurnaroundPreset(48)}
                              className="font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              +48h
                            </button>
                          </div>
                        </div>
                        <Input
                          type="datetime-local"
                          value={promisedDeliveryDate}
                          onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                          className="h-8 text-xs font-mono rounded-xl border-slate-200"
                        />
                      </div>

                      {/* Special Instructions Note */}
                      <div className="space-y-1 pt-1">
                        <Label className="text-xs font-bold text-slate-700">
                          Care Instructions / Starch Notes
                        </Label>
                        <Input
                          type="text"
                          placeholder="e.g. Extra starch on collars, stain on left sleeve..."
                          value={specialInstructions}
                          onChange={(e) => setSpecialInstructions(e.target.value)}
                          className="h-8 text-xs rounded-xl border-slate-200"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* ================= STEP 2: PAYMENT SETTLEMENT ================= */}
                  {checkoutStep === "payment" && (
                    <motion.div
                      key="payment-step"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3.5"
                    >
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/70 border border-blue-200">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                            Step 2: Payment Settlement
                          </span>
                          <span className="font-bold text-xs text-slate-900 block truncate">
                            {selectedCustomer?.fullName}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Total Payable
                          </span>
                          <span className="text-sm font-black font-mono text-blue-700">
                            {formatPaiseToInr(totalPayablePaise)}
                          </span>
                        </div>
                      </div>

                      {/* Collection Mode */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-800">
                          Collection Mode *
                        </Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPaymentType("full")}
                            className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              paymentType === "full"
                                ? "border-blue-600 bg-blue-50/60 shadow-2xs"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">Pay in Full</span>
                              {paymentType === "full" ? (
                                <CheckCircle2 className="size-3 text-blue-600" />
                              ) : null}
                            </div>
                            <span className="text-[10px] text-slate-500 mt-0.5">100% upfront</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPaymentType("delivery")}
                            className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              paymentType === "delivery"
                                ? "border-blue-600 bg-blue-50/60 shadow-2xs"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">On Delivery</span>
                              {paymentType === "delivery" ? (
                                <CheckCircle2 className="size-3 text-blue-600" />
                              ) : null}
                            </div>
                            <span className="text-[10px] text-slate-500 mt-0.5">Pay on pickup</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPaymentType("advance")}
                            className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              paymentType === "advance"
                                ? "border-blue-600 bg-blue-50/60 shadow-2xs"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">Advance</span>
                              {paymentType === "advance" ? (
                                <CheckCircle2 className="size-3 text-blue-600" />
                              ) : null}
                            </div>
                            <span className="text-[10px] text-slate-500 mt-0.5">Partial deposit</span>
                          </button>
                        </div>

                        {paymentType === "advance" && (
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 mt-1.5">
                            <Label className="text-xs font-bold text-slate-700">
                              Advance Amount (₹)
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              max={Math.floor(totalPayablePaise / 100)}
                              value={customAdvanceRupees}
                              onChange={(e) => setCustomAdvanceRupees(e.target.value)}
                              placeholder="Enter advance deposit amount..."
                              className="h-8 text-xs font-mono font-bold rounded-lg bg-white"
                            />
                          </div>
                        )}
                      </div>

                      {/* Payment Method Selector */}
                      {collectNowPaise > 0 ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-800">
                            Payment Method *
                          </Label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPaymentMethod("cash")}
                              className={`p-2 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
                                paymentMethod === "cash"
                                  ? "border-emerald-600 bg-emerald-50/60 shadow-2xs"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <CashPaymentFlaticonIcon className="size-4 shrink-0" />
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">Cash</span>
                                <span className="text-[10px] text-slate-500">Counter Cash</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPaymentMethod("upi")}
                              className={`p-2 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
                                paymentMethod === "upi"
                                  ? "border-blue-600 bg-blue-50/60 shadow-2xs"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <UpiPaymentFlaticonIcon className="size-4 shrink-0" />
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">UPI / QR</span>
                                <span className="text-[10px] text-slate-500">GPay, PhonePe</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPaymentMethod("card")}
                              className={`p-2 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
                                paymentMethod === "card"
                                  ? "border-indigo-600 bg-indigo-50/60 shadow-2xs"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <CardPaymentFlaticonIcon className="size-4 shrink-0" />
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">Card</span>
                                <span className="text-[10px] text-slate-500">POS Swipe</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPaymentMethod("net_banking")}
                              className={`p-2 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
                                paymentMethod === "net_banking"
                                  ? "border-purple-600 bg-purple-50/60 shadow-2xs"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <Building className="size-4 shrink-0 text-purple-600" />
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">Bank Trf</span>
                                <span className="text-[10px] text-slate-500">NEFT / IMPS</span>
                              </div>
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* Payment Notes */}
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-slate-700">
                          Payment Reference / Remarks
                        </Label>
                        <Input
                          type="text"
                          placeholder="e.g. UPI ref #12345 or Counter Note..."
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          className="h-8 text-xs rounded-xl border-slate-200"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* ================= STEP 3: PRINT & COMPLETE ================= */}
                  {checkoutStep === "complete" && createdOrder && (
                    <motion.div
                      key="complete-step"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3.5"
                    >
                      <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-center space-y-1">
                        <CheckCircle2 className="size-7 text-emerald-600 mx-auto" />
                        <h3 className="text-sm font-black tracking-tight">
                          Step 3: Confirmed & Tagged
                        </h3>
                        <div className="font-mono text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5 mt-0.5">
                          <span>Order #{createdOrder.order.orderNumber}</span>
                          <button
                            type="button"
                            onClick={handleCopyOrderNumber}
                            className="hover:text-emerald-950 p-0.5 rounded cursor-pointer"
                            title="Copy order number"
                          >
                            {copiedOrderNumber ? (
                              <Check className="size-3 text-emerald-700" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Settlement Slip */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div className="flex justify-between text-slate-600">
                          <span>Customer:</span>
                          <span className="font-bold text-slate-900">{createdOrder.order.customerName}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Promised Ready:</span>
                          <span>{formatDateTime(createdOrder.order.promisedDeliveryAt)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                          <span>Total Billed:</span>
                          <span className="font-mono">{formatPaiseToInr(createdOrder.order.totalAmountPaise)}</span>
                        </div>
                      </div>

                      {/* Customer Notification Buttons */}
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-slate-700">
                          Customer Notifications
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSendWhatsApp}
                            className="h-8 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <WhatsAppFlaticonIcon className="size-3.5" />
                            <span>{notificationStatus.whatsapp ? "WhatsApp Sent ✓" : "WhatsApp"}</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSendSms}
                            className="h-8 border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100/70 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <SmsMessageFlaticonIcon className="size-3.5" />
                            <span>{notificationStatus.sms ? "SMS Sent ✓" : "SMS"}</span>
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>

              {/* ================= FIXED BOTTOM FOOTER (Always Visible On Desktop) ================= */}
              <div className="shrink-0 bg-slate-50/95 p-3.5 space-y-2.5 shadow-xs">
                {checkoutStep === "cart" && (
                  <>
                    {/* Live Financial Summary */}
                    <div className="p-3 rounded-xl bg-slate-900 text-white space-y-1 shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>Subtotal:</span>
                        <span className="font-mono text-white">
                          {quote ? formatPaiseToInr(quote.subtotalPaise) : "₹0"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>
                          {quote?.taxSupplyType === "exempt" ? "GST Tax (Exempt):" : "GST Tax (18%):"}
                        </span>
                        <span className="font-mono text-white">
                          {quote ? formatPaiseToInr(quote.totalTaxPaise) : "₹0"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-sm font-bold">
                        <span>TOTAL:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-black font-mono text-white">
                            {quote ? formatPaiseToInr(quote.totalAmountPaise) : "₹0"}
                          </span>
                          {quoting ? <Loader2 className="size-3 animate-spin text-blue-400" /> : null}
                        </div>
                      </div>
                    </div>

                    {/* CTA: Proceed to Payment */}
                    <Button
                      type="button"
                      disabled={lines.length === 0 || !selectedCustomerId}
                      onClick={handleProceedToPayment}
                      className="w-full h-11 pos-cta-btn rounded-xl font-bold text-xs gap-2 shadow-sm cursor-pointer"
                    >
                      <span>Proceed to Payment</span>
                      <ArrowRight className="size-4" />
                    </Button>
                  </>
                )}

                {checkoutStep === "payment" && (
                  <>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                      <div className="flex justify-between text-emerald-700 font-bold">
                        <span>Collecting Now:</span>
                        <span className="font-mono">{formatPaiseToInr(collectNowPaise)}</span>
                      </div>
                      <div className="flex justify-between text-amber-700 font-bold pt-0.5 border-t border-slate-100">
                        <span>Balance Due on Delivery:</span>
                        <span className="font-mono">{formatPaiseToInr(balanceDuePaise)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCheckoutStep("cart")}
                        className="h-10 px-3 rounded-xl text-xs font-bold border-slate-200 cursor-pointer"
                      >
                        ← Back
                      </Button>

                      <Button
                        type="button"
                        disabled={submitting}
                        onClick={handleConfirmAndPlaceOrder}
                        className="flex-1 h-10 pos-cta-btn rounded-xl font-bold text-xs gap-1.5 shadow-sm cursor-pointer"
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        <span>Place Order & Collect</span>
                      </Button>
                    </div>
                  </>
                )}

                {checkoutStep === "complete" && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      onClick={handlePrintDocket}
                      className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer text-xs"
                    >
                      <Printer className="size-3.5" />
                      <span>Print Receipt</span>
                    </Button>

                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* ================= MODAL: REGISTER NEW CUSTOMER ================= */}
        <Dialog open={showNewCustomerModal} onOpenChange={setShowNewCustomerModal}>
          <DialogPopup className="max-w-md p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="size-5" />
                <h3 className="text-base font-black tracking-tight text-white">
                  Register New Customer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-6 space-y-4">
              {newCustError ? (
                <Alert variant="destructive" className="py-2 rounded-xl text-xs">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{newCustError}</AlertDescription>
                </Alert>
              ) : null}

              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1 block">
                  Full Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. Anand Kumar"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1 block">
                  Mobile Number <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="h-10 text-xs font-mono rounded-xl"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1 block">
                  Email Address (Optional)
                </Label>
                <Input
                  type="email"
                  placeholder="anand@example.com"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={newCustSubmitting}
                  className="pos-cta-btn rounded-xl text-xs font-bold cursor-pointer"
                >
                  {newCustSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  <span>Save & Select Customer</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= MODAL: REGISTER NEW GARMENT ================= */}
        <Dialog open={showNewItemModal} onOpenChange={setShowNewItemModal}>
          <DialogPopup className="max-w-md p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="bg-gradient-to-r from-slate-900 to-blue-950 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Tag className="size-5" />
                <h3 className="text-base font-black tracking-tight text-white">
                  Add Garment to Catalog
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewItemModal(false)}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItemSubmit} className="p-6 space-y-4">
              {newItemError ? (
                <Alert variant="destructive" className="py-2 rounded-xl text-xs">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{newItemError}</AlertDescription>
                </Alert>
              ) : null}

              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1 block">
                  Garment Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. Silk Kurta, Blazer, Woolen Blanket..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1 block">
                  Category
                </Label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(Number(e.target.value) as 1 | 2)}
                  className="w-full h-10 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={1}>Garments / Apparel</option>
                  <option value={2}>Household Linen</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1 block">
                  Base Price (₹ / piece)
                </Label>
                <Input
                  type="number"
                  min="10"
                  step="5"
                  placeholder="100"
                  value={newItemBasePrice}
                  onChange={(e) => setNewItemBasePrice(e.target.value)}
                  className="h-10 text-xs font-mono rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewItemModal(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={newItemSubmitting}
                  className="pos-cta-btn rounded-xl text-xs font-bold cursor-pointer"
                >
                  {newItemSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  <span>Add to Catalog</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= PRINT DOCKET (Hidden from screen, active during window.print) ================= */}
        {createdOrder && (
  <ReceiptDocket
    order={createdOrder.order}
    items={createdOrder.items}
    paidPaise={
      createdBilling?.capturedAmountPaise ??
      (paymentType === "full" ? createdOrder.order.totalAmountPaise : collectNowPaise)
    }
    balanceDuePaise={
      createdBilling?.balanceDuePaise ??
      Math.max(0, createdOrder.order.totalAmountPaise - collectNowPaise)
    }
    paymentMethodLabel={collectNowPaise > 0 ? paymentMethod.toUpperCase() : undefined}
    specialInstructions={specialInstructions}
  />
)}
      </div>
    </TooltipProvider>
  );
}
