import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
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
import { useOptionalAuth } from "@/features/auth";

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
import { FloatingInput } from "../components/FloatingInput";


const COLLECTION_MODES = [
  { value: "full", title: "Pay in full", hint: "100% now" },
  { value: "delivery", title: "On delivery", hint: "Pay on pickup" },
  { value: "advance", title: "Advance", hint: "Partial deposit" },
] as const;

const PAYMENT_METHODS: {
  value: PaymentMethod;
  title: string;
  hint: string;
  icon: React.ReactNode;
  activeClass: string;
  refLabel: string;
}[] = [
    {
      value: "cash",
      title: "Cash",
      hint: "Counter cash",
      icon: <CashPaymentFlaticonIcon className="size-5" />,
      activeClass: "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600/20",
      refLabel: "Remarks (optional)",
    },
    {
      value: "upi",
      title: "UPI / QR",
      hint: "GPay, PhonePe",
      icon: <UpiPaymentFlaticonIcon className="size-5" />,
      activeClass: "border-blue-600 bg-blue-50/70 ring-1 ring-blue-600/20",
      refLabel: "UPI transaction ID",
    },
    {
      value: "card",
      title: "Card",
      hint: "POS swipe",
      icon: <CardPaymentFlaticonIcon className="size-5" />,
      activeClass: "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600/20",
      refLabel: "Approval code / last 4 digits",
    },
    {
      value: "net_banking",
      title: "Bank transfer",
      hint: "NEFT / IMPS",
      icon: <Building className="size-5 text-purple-600" />,
      activeClass: "border-purple-600 bg-purple-50/70 ring-1 ring-purple-600/20",
      refLabel: "UTR / reference number",
    },
  ];

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
  const auth = useOptionalAuth();
  const activeHubName = auth?.session?.user.hubName ?? "Main Branch";
  const [activeRateCardId, setActiveRateCardId] = useState<number>(1);

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
  const [cashReceivedRupees, setCashReceivedRupees] = useState("");

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
        apiFetch("/api/v1/rate-cards/current/items")
          .catch(() => apiFetch("/api/v1/rate-cards/1/items"))
          .catch(() => null),
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
          rateCard?: { id: number };
        };
        if (rJson.rateCard?.id) {
          setActiveRateCardId(rJson.rateCard.id);
        }
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

  function toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Default delivery to +48 hours
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setPromisedDeliveryDate(toLocalInputValue(d));
  }, []);

  function setTurnaroundPreset(hours: number) {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    setPromisedDeliveryDate(toLocalInputValue(d));
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
  const advanceError =
    paymentType === "advance" && customAdvanceRupees !== ""
      ? advancePaise <= 0
        ? "Enter an amount greater than ₹0"
        : advancePaise > totalPayablePaise
          ? `Advance can't exceed ${formatPaiseToInr(totalPayablePaise)}`
          : null
      : null;

  const advanceInvalid =
    paymentType === "advance" && (advancePaise <= 0 || advancePaise > totalPayablePaise);

  const cashReceivedPaise = Math.round((parseFloat(cashReceivedRupees) || 0) * 100);
  const changeDuePaise = Math.max(0, cashReceivedPaise - collectNowPaise);
  const activeMethod = PAYMENT_METHODS.find((m) => m.value === paymentMethod);

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

        return apiFetch(`/api/v1/rate-cards/${activeRateCardId}/items`, {
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
    setCashReceivedRupees("");
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
      await ordersService.sendNotification?.(createdOrder.order.id, {
        channel: "whatsapp",
        recipientPhone: phone,
        message,
      });
      setNotificationNotice("WhatsApp message opened and logged.");
    } catch {
      setNotificationNotice("WhatsApp opened, but the send could not be logged.");
    }
    setNotificationStatus((prev) => ({ ...prev, whatsapp: true }));
    setTimeout(() => setNotificationNotice(null), 3000);
  }

  async function handleSendSms() {
    if (!createdOrder) return;
    const phone = createdOrder.order.customerPhone ?? selectedCustomer?.phone ?? "";
    const totalFormatted = formatPaiseToInr(createdOrder.order.totalAmountPaise);

    const message = `FreshFold: Your laundry order #${createdOrder.order.orderNumber} for ${totalFormatted} is confirmed! Estimated ready date: ${formatDateTime(createdOrder.order.promisedDeliveryAt)}.`;

    try {
      if (!ordersService.sendNotification) {
        throw new Error("SMS is not configured");
      }
      await ordersService.sendNotification(createdOrder.order.id, {
        channel: "sms",
        recipientPhone: phone,
        message,
      });
      setNotificationStatus((prev) => ({ ...prev, sms: true }));
      setNotificationNotice("SMS sent to customer.");
    } catch {
      setNotificationNotice("Could not send SMS. Please try again.");
    }
    setTimeout(() => setNotificationNotice(null), 3000);
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


  const settledPaidPaise = createdOrder
    ? (createdBilling?.capturedAmountPaise ??
      (paymentType === "full" ? createdOrder.order.totalAmountPaise : collectNowPaise))
    : 0;

  const settledDuePaise = createdOrder
    ? (createdBilling?.balanceDuePaise ??
      Math.max(0, createdOrder.order.totalAmountPaise - settledPaidPaise))
    : 0;

  const settledPieces = createdOrder
    ? createdOrder.items.reduce((a: number, it: any) => a + (it.quantityPieces ?? 1), 0)
    : 0;

  const proceedHint = !selectedCustomerId
    ? "Select a customer to continue"
    : lines.length === 0
      ? "Add at least one item to continue"
      : null;

  const placeOrderLabel = submitting
    ? "Placing order…"
    : collectNowPaise > 0
      ? `Place order · Collect ${formatPaiseToInr(collectNowPaise)}`
      : "Place order";

  const placeOrderHint = advanceInvalid ? "Enter a valid advance amount" : null;

  return (
    <TooltipProvider delay={250}>
      <div className="pos-workspace pb-6 select-none px-2 sm:px-4">
        {/* ================= HEADER BAR ================= */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl">
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
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <Building2 className="size-3 text-blue-600" />
                  {activeHubName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                High-velocity counter checkout & docket generation (Per-Piece Services)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowNewCustomerModal(true)}
              className="h-8 gap-1.5 p-5 font-semibold rounded-xl border-slate-200 hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700 transition-colors"
            >
              <UserPlus className="size-3.5 text-blue-600" />
              <span>+ New Customer</span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowNewItemModal(true)}
              className="h-8 gap-1.5 p-5 font-semibold rounded-xl border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-colors"
            >
              <Tag className="size-3.5 text-indigo-600" />
              <span>+ New Garment</span>
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
                    className={`pos-service-card p-3 rounded-2xl flex flex-col justify-between min-h-[92px] ${isActive ? "pos-service-card-active" : ""
                      }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-1 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                        {renderFlaticonService(svc.code, "size-7")}
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isActive
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search garments by name or code (e.g. Shirt, Saree, Suit)..."
                  value={garmentSearch}
                  onChange={(e) => setGarmentSearch(e.target.value)}
                  className="pl-9 h-10 text-xs rounded-xl border-slate-200 bg-slate-50/70 focus-visible:bg-white"
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedCategoryTab === tab
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
                    className={`pos-garment-card p-3 rounded-2xl flex flex-col justify-between cursor-pointer border transition-all text-left w-full ${currentQty > 0
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
              <CardHeader className="shrink-0 bg-slate-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Order Ticket</span>
                </div>

                {/* 3-Step Navigation Pills */}
                <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-2 rounded-xl text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutStep !== "complete") setCheckoutStep("cart");
                    }}
                    className={`py-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${checkoutStep === "cart"
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
                    className={`py-3 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${checkoutStep === "payment"
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    2. Payment
                  </button>
                  <span
                    className={`py-3 rounded-lg text-xs font-bold ${checkoutStep === "complete"
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
                      className="space-y-4"
                    >
                      {/* ============ CUSTOMER ============ */}
                      <div>
                        {selectedCustomer && !isChangingCustomer ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/50 p-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-2xs">
                                {selectedCustomer.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-bold text-slate-900">
                                    {selectedCustomer.fullName}
                                  </span>
                                  <span className="rounded border border-slate-200 bg-white px-1.5 text-[10px] font-mono text-slate-500">
                                    {selectedCustomer.customerCode}
                                  </span>
                                </div>
                                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-mono text-slate-500">
                                  <Phone className="size-2.5 text-blue-600" />
                                  {selectedCustomer.phone}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setIsChangingCustomer(true);
                                setCustomerSearchQuery("");
                                setShowCustomerDropdown(false);
                                setTimeout(() => customerInputRef.current?.focus(), 50);
                              }}
                              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-100 cursor-pointer"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <div ref={customerSearchRef} className="relative">
                            <FloatingInput
                              ref={customerInputRef}
                              type="tel"
                              label="Customer mobile number *"
                              placeholder="Search mobile number (e.g. 98765 43210)..."
                              icon={<Phone className="size-3.5" />}
                              value={customerSearchQuery}
                              onChange={(e) => setCustomerSearchQuery(e.target.value)}
                              onFocus={() => {
                                if (customerSearchResults.length > 0) setShowCustomerDropdown(true);
                              }}
                              className="font-mono"
                              trailing={
                                isSearchingCustomer ? (
                                  <Loader2 className="size-3.5 animate-spin text-blue-600" />
                                ) : selectedCustomer ? (
                                  <button
                                    type="button"
                                    aria-label="Cancel changing customer"
                                    onClick={() => {
                                      setIsChangingCustomer(false);
                                      setCustomerSearchQuery("");
                                      setShowCustomerDropdown(false);
                                    }}
                                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                ) : null
                              }
                            />

                            {/* Lazy search hint */}
                            {(() => {
                              const digits = customerSearchQuery.replace(/\D/g, "").length;
                              if (digits === 0 || digits >= 3) return null;
                              return (
                                <p className="mt-1 pl-1 text-[11px] text-slate-500">
                                  Type {3 - digits} more digit{3 - digits > 1 ? "s" : ""} to search...
                                </p>
                              );
                            })()}

                            {/* Results dropdown */}
                            {showCustomerDropdown && customerSearchResults.length > 0 ? (
                              <div className="absolute left-0 right-0 z-30 mt-1 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                                {customerSearchResults.map((cust) => (
                                  <button
                                    key={cust.id}
                                    type="button"
                                    onClick={() => handleSelectCustomer(cust)}
                                    className="flex w-full items-center justify-between p-2.5 text-left transition-colors hover:bg-blue-50 cursor-pointer"
                                  >
                                    <div>
                                      <div className="text-xs font-bold text-slate-900">{cust.fullName}</div>
                                      <div className="font-mono text-[11px] text-slate-500">
                                        {cust.phone} • {cust.customerCode}
                                      </div>
                                    </div>
                                    <Badge className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                                      Select
                                    </Badge>
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            {/* Not found state */}
                            {customerSearchQuery.trim().length >= 3 &&
                              !isSearchingCustomer &&
                              customerSearchResults.length === 0 ? (
                              <div className="mt-1.5 flex items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2.5">
                                <span className="text-[11px] text-slate-600">No customer found</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewCustPhone(customerSearchQuery.trim());
                                    setShowNewCustomerModal(true);
                                  }}
                                  className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                                >
                                  <UserPlus className="size-3" />
                                  Register new
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* ============ CART ITEMS ============ */}
                      <div className="space-y-1.5">
                        <Label className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span>Cart Items ({lines.length})</span>
                        </Label>

                        {lines.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                            <FoldedLaundryStackIcon className="mx-auto mb-1.5 size-7 opacity-60" />
                            <p className="text-xs font-bold text-slate-700">Cart is empty</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">Tap any garment to add it</p>
                          </div>
                        ) : (
                          <div className="rounded-xl px-4 border border-dashed border-slate-200 bg-slate-50/60">

                            <div className="pos-scroll max-h-92 divide-y divide-slate-100 overflow-y-auto pr-1">
                              {lines.map((line, idx) => {
                                const itm = items.find((i) => i.id === line.itemId);
                                const svc = services.find((s) => s.id === line.serviceId);
                                const quotedLine = quote?.lines?.[idx];
                                const unitRatePaise = ratePrices[`${line.serviceId}:${line.itemId ?? "none"}`];
                                const fallbackTotal = unitRatePaise
                                  ? unitRatePaise * (line.quantityPieces ?? 1)
                                  : 0;

                                return (
                                  <div
                                    key={`${line.serviceId}-${line.itemId}`}
                                    className="flex items-center justify-between gap-2 py-2.5"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-bold text-slate-900">
                                        {itm?.name ?? "Garment"}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-700">
                                        <span>{svc?.name}</span>
                                        {unitRatePaise ? (
                                          <span className="font-mono font-normal text-slate-400">
                                            ({formatPaiseToInr(unitRatePaise)}/pc)
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                        <button
                                          type="button"
                                          aria-label="Decrease quantity"
                                          onClick={() => handleUpdateQuantity(idx, -1)}
                                          className="flex size-7 items-center justify-center rounded text-slate-600 hover:bg-white active:scale-95 cursor-pointer"
                                        >
                                          <Minus className="size-3" />
                                        </button>
                                        <span className="w-6 text-center font-mono text-xs font-bold text-slate-900">
                                          {line.quantityPieces ?? 1}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label="Increase quantity"
                                          onClick={() => handleUpdateQuantity(idx, 1)}
                                          className="flex size-7 items-center justify-center rounded text-slate-600 hover:bg-white active:scale-95 cursor-pointer"
                                        >
                                          <Plus className="size-3" />
                                        </button>
                                      </div>

                                      <span className="w-14 text-right font-mono text-xs font-bold text-slate-900">
                                        {quotedLine
                                          ? formatPaiseToInr(quotedLine.lineTotalPaise)
                                          : fallbackTotal > 0
                                            ? formatPaiseToInr(fallbackTotal)
                                            : "—"}
                                      </span>

                                      <button
                                        type="button"
                                        aria-label="Remove item"
                                        onClick={() => handleRemoveLine(idx)}
                                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ============ PROMISED DATE ============ */}
                      <div className="space-y-1.5 border-t border-slate-100 pt-5">
                        <FloatingInput
                          type="datetime-local"
                          label="Promised ready date"
                          alwaysFloat
                          icon={<Clock className="size-3.5" />}
                          value={promisedDeliveryDate}
                          onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                          className="font-mono"
                        />
                        <div className="flex items-center gap-2 pt-1">
                          {[24, 48, 72].map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setTurnaroundPreset(h)}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-blue-100 hover:text-blue-700 cursor-pointer"
                            >
                              +{h}h
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ============ NOTES ============ */}
                      <FloatingInput
                        type="text"
                        label="Care instructions / starch notes"
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                      />
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
                      className="space-y-4"
                    >
                      {/* ============ SUMMARY HERO ============ */}
                      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-3.5 text-white shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
                              {selectedCustomer?.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">
                                Payment
                              </p>
                              <p className="truncate text-xs font-bold">{selectedCustomer?.fullName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">
                              Total payable
                            </p>
                            <p className="font-mono text-lg font-black leading-tight">
                              {formatPaiseToInr(totalPayablePaise)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-2 text-[11px] text-blue-100">
                          <span>{totalTicketPieces} pcs</span>
                          <span>
                            Collect now:{" "}
                            <b className="font-mono text-white">{formatPaiseToInr(collectNowPaise)}</b>
                          </span>
                        </div>
                      </div>

                      {/* ============ COLLECTION MODE ============ */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-800">When will the customer pay?</Label>
                        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
                          {COLLECTION_MODES.map((mode) => {
                            const active = paymentType === mode.value;
                            return (
                              <button
                                key={mode.value}
                                type="button"
                                onClick={() => setPaymentType(mode.value)}
                                className={`rounded-lg px-2 py-2 text-left transition-all cursor-pointer ${active
                                  ? "bg-white shadow-xs ring-1 ring-blue-600/30"
                                  : "hover:bg-white/60"
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-xs font-bold ${active ? "text-blue-700" : "text-slate-700"}`}
                                  >
                                    {mode.title}
                                  </span>
                                  {active ? <CheckCircle2 className="size-3.5 text-blue-600" /> : null}
                                </div>
                                <span className="text-[10px] text-slate-500">{mode.hint}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Advance amount */}
                        {paymentType === "advance" && (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                            <FloatingInput
                              type="number"
                              inputMode="decimal"
                              min={1}
                              max={Math.floor(totalPayablePaise / 100)}
                              label="Advance amount"
                              icon={<span className="text-xs font-bold">₹</span>}
                              value={customAdvanceRupees}
                              onChange={(e) => setCustomAdvanceRupees(e.target.value)}
                              className={`font-mono font-bold ${advanceError ? "border-rose-400 focus-visible:border-rose-500" : ""
                                }`}
                            />
                            {advanceError ? (
                              <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                                <AlertCircle className="size-3" />
                                {advanceError}
                              </p>
                            ) : null}
                            <div className="flex items-center gap-1.5">
                              {[25, 50, 75].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() =>
                                    setCustomAdvanceRupees(
                                      String(Math.round((totalPayablePaise * pct) / 100) / 100),
                                    )
                                  }
                                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-200 cursor-pointer"
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {paymentType === "delivery" && (
                          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                            Nothing is collected now. The full amount is due when the customer picks up.
                          </p>
                        )}
                      </div>

                      {/* ============ PAYMENT METHOD ============ */}
                      {collectNowPaise > 0 ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-800">Payment method</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {PAYMENT_METHODS.map((m) => {
                              const active = paymentMethod === m.value;
                              return (
                                <button
                                  key={m.value}
                                  type="button"
                                  onClick={() => setPaymentMethod(m.value)}
                                  className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${active
                                    ? m.activeClass
                                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                >
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-2xs ring-1 ring-slate-100">
                                    {m.icon}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-bold text-slate-900">
                                      {m.title}
                                    </span>
                                    <span className="block truncate text-[10px] text-slate-500">{m.hint}</span>
                                  </span>
                                  {active ? (
                                    <CheckCircle2 className="absolute right-1.5 top-1.5 size-3.5 text-slate-700" />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>

                          {/* Cash helper: amount received & change */}
                          {paymentMethod === "cash" && (
                            <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
                              <FloatingInput
                                type="number"
                                inputMode="decimal"
                                min={0}
                                label="Cash received (optional)"
                                icon={<span className="text-xs font-bold">₹</span>}
                                value={cashReceivedRupees}
                                onChange={(e) => setCashReceivedRupees(e.target.value)}
                                className="font-mono font-bold"
                              />
                              {cashReceivedPaise > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  {cashReceivedPaise >= collectNowPaise ? (
                                    <>
                                      <span className="font-semibold text-emerald-800">Return change</span>
                                      <span className="font-mono text-sm font-black text-emerald-700">
                                        {formatPaiseToInr(changeDuePaise)}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-semibold text-rose-700">Short by</span>
                                      <span className="font-mono text-sm font-black text-rose-600">
                                        {formatPaiseToInr(collectNowPaise - cashReceivedPaise)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* ============ REFERENCE / NOTES ============ */}
                      <FloatingInput
                        type="text"
                        label={collectNowPaise > 0 ? (activeMethod?.refLabel ?? "Remarks") : "Remarks (optional)"}
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                      />
                    </motion.div>
                  )}

                  {/* ================= STEP 3: PRINT & COMPLETE ================= */}
                  {checkoutStep === "complete" && createdOrder && (
                    <motion.div
                      key="complete-step"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      {/* ============ SUCCESS HERO ============ */}
                      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-center text-white shadow-sm">
                        <motion.div
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 260, damping: 16 }}
                          className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/20"
                        >
                          <CheckCircle2 className="size-7" />
                        </motion.div>
                        <h3 className="mt-2 text-sm font-black tracking-tight">Order placed</h3>
                        <p className="text-[11px] text-emerald-100">Tag the garments, then print the receipt</p>

                        <button
                          type="button"
                          onClick={handleCopyOrderNumber}
                          className="mx-auto mt-2.5 flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-mono text-xs font-bold hover:bg-white/25 cursor-pointer"
                          title="Copy order number"
                        >
                          <span>#{createdOrder.order.orderNumber}</span>
                          {copiedOrderNumber ? <Check className="size-3" /> : <Copy className="size-3" />}
                        </button>
                      </div>

                      {/* ============ SETTLEMENT SLIP ============ */}
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="space-y-1.5 p-3 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Customer</span>
                            <span className="truncate font-bold text-slate-900">
                              {createdOrder.order.customerName}
                            </span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="flex items-center gap-1 text-slate-500">
                              <Clock className="size-3" /> Ready by
                            </span>
                            <span className="font-semibold text-slate-900">
                              {formatDateTime(createdOrder.order.promisedDeliveryAt)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Items</span>
                            <span className="font-semibold text-slate-900">{settledPieces} pcs</span>
                          </div>
                        </div>

                        {/* Items list */}
                        <div className="pos-scroll max-h-28 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 bg-slate-50/60 px-3">
                          {createdOrder.items.map((it: any, i: number) => (
                            <div key={it.id ?? i} className="flex justify-between gap-2 py-1.5 text-[11px]">
                              <span className="truncate text-slate-700">
                                {it.itemNameSnapshot || "Garment"}{" "}
                                <span className="font-mono text-slate-400">× {it.quantityPieces ?? 1}</span>
                              </span>
                              <span className="shrink-0 font-mono text-slate-700">
                                {formatPaiseToInr(it.lineTotalPaise)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Totals */}
                        <div className="space-y-1 border-t border-dashed border-slate-300 p-3 text-xs">
                          <div className="flex justify-between font-bold text-slate-900">
                            <span>Total billed</span>
                            <span className="font-mono">
                              {formatPaiseToInr(createdOrder.order.totalAmountPaise)}
                            </span>
                          </div>
                          <div className="flex justify-between text-emerald-700">
                            <span>Paid{collectNowPaise > 0 ? ` (${paymentMethod.toUpperCase()})` : ""}</span>
                            <span className="font-mono font-bold">{formatPaiseToInr(settledPaidPaise)}</span>
                          </div>
                          <div
                            className={`flex justify-between ${settledDuePaise > 0 ? "text-amber-700" : "text-slate-400"
                              }`}
                          >
                            <span>Balance due</span>
                            <span className="font-mono font-bold">{formatPaiseToInr(settledDuePaise)}</span>
                          </div>
                        </div>

                        {/* Status strip */}
                        <div
                          className={`flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold ${settledDuePaise <= 0
                              ? "bg-emerald-50 text-emerald-700"
                              : settledPaidPaise > 0
                                ? "bg-amber-50 text-amber-800"
                                : "bg-amber-50 text-amber-800"
                            }`}
                        >
                          {settledDuePaise <= 0 ? (
                            <>
                              <CheckCircle2 className="size-3.5" /> Paid in full
                            </>
                          ) : settledPaidPaise > 0 ? (
                            <>
                              <AlertCircle className="size-3.5" /> Partially paid · collect{" "}
                              {formatPaiseToInr(settledDuePaise)} on pickup
                            </>
                          ) : (
                            <>
                              <AlertCircle className="size-3.5" /> Payment pending · collect on pickup
                            </>
                          )}
                        </div>
                      </div>

                      {/* ============ NOTIFICATIONS ============ */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Send confirmation to customer</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleSendWhatsApp}
                            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${notificationStatus.whatsapp
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                              }`}
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-100">
                              <WhatsAppFlaticonIcon className="size-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900">WhatsApp</span>
                              <span className="block text-[10px] text-slate-500">
                                {notificationStatus.whatsapp ? "Sent · tap to resend" : "Order summary"}
                              </span>
                            </span>
                            {notificationStatus.whatsapp ? (
                              <Check className="ml-auto size-4 shrink-0 text-emerald-600" />
                            ) : null}
                          </button>

                          <button
                            type="button"
                            onClick={handleSendSms}
                            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${notificationStatus.sms
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                              }`}
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-100">
                              <SmsMessageFlaticonIcon className="size-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900">SMS</span>
                              <span className="block text-[10px] text-slate-500">
                                {notificationStatus.sms ? "Sent · tap to resend" : "Short message"}
                              </span>
                            </span>
                            {notificationStatus.sms ? (
                              <Check className="ml-auto size-4 shrink-0 text-blue-600" />
                            ) : null}
                          </button>
                        </div>

                        {notificationNotice ? (
                          <p className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                            {notificationNotice}
                          </p>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>

              {/* ================= FOOTER ================= */}
              <div className="shrink-0 space-y-2.5 bg-slate-50/95 p-3.5">
                {checkoutStep === "cart" && (
                  <>
                    {/* Live summary */}
                    <div className="space-y-1 rounded-xl bg-slate-900 p-3 text-white shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>Subtotal{totalTicketPieces > 0 ? ` · ${totalTicketPieces} pcs` : ""}</span>
                        <span className="font-mono text-white">
                          {quote ? formatPaiseToInr(quote.subtotalPaise) : "₹0"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>{quote?.taxSupplyType === "exempt" ? "GST (exempt)" : "GST (18%)"}</span>
                        <span className="font-mono text-white">
                          {quote ? formatPaiseToInr(quote.totalTaxPaise) : "₹0"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-700 pt-1.5 text-sm font-bold">
                        <span>Total</span>
                        <div className="flex items-center gap-1.5">
                          {quoting ? <Loader2 className="size-3 animate-spin text-blue-400" /> : null}
                          <span className="font-mono text-base font-black">
                            {quote ? formatPaiseToInr(quote.totalAmountPaise) : "₹0"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      disabled={lines.length === 0 || !selectedCustomerId}
                      onClick={handleProceedToPayment}
                      className="pos-cta-btn h-11 w-full cursor-pointer gap-2 rounded-xl text-xs font-bold shadow-sm"
                    >
                      <span>Continue to payment</span>
                      <ArrowRight className="size-4" />
                    </Button>

                    {proceedHint ? (
                      <p className="text-center text-[11px] font-medium text-slate-500">{proceedHint}</p>
                    ) : null}
                  </>
                )}

                {checkoutStep === "payment" && (
                  <>
                    <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-2.5 text-xs">
                      <div className="flex justify-between font-bold text-emerald-700">
                        <span>Collect now</span>
                        <span className="font-mono">{formatPaiseToInr(collectNowPaise)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-amber-700">
                        <span>Due at pickup</span>
                        <span className="font-mono">{formatPaiseToInr(balanceDuePaise)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => setCheckoutStep("cart")}
                        className="h-10 cursor-pointer gap-1.5 rounded-xl border-slate-200 px-3 text-xs font-bold"
                      >
                        <ArrowLeft className="size-3.5" />
                        <span>Back</span>
                      </Button>

                      <Button
                        type="button"
                        disabled={submitting || advanceInvalid}
                        onClick={handleConfirmAndPlaceOrder}
                        className="pos-cta-btn h-10 min-w-0 flex-1 cursor-pointer gap-1.5 rounded-xl text-xs font-bold shadow-sm"
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" />
                        ) : (
                          <Check className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">{placeOrderLabel}</span>
                      </Button>
                    </div>

                    {placeOrderHint ? (
                      <p className="text-center text-[11px] font-medium text-rose-600">{placeOrderHint}</p>
                    ) : null}
                  </>
                )}

                {checkoutStep === "complete" && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      onClick={handlePrintDocket}
                      className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
                    >
                      <Printer className="size-4" />
                      <span>Print receipt</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleStartNewOrder}
                      className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-slate-200 text-xs font-bold"
                    >
                      <Plus className="size-3.5" />
                      <span>New order</span>
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
