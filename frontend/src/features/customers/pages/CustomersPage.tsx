import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUpRight,
  Ban,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  History,
  Loader2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Power,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  User,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { PaginationBar } from "@/components/ui/pagination";
import { useIsMobile } from "@/hooks";
import { apiFetch } from "@/lib/http/api-client";
import {
  FoldedLaundryStackIcon,
  LaundryBasketEmptyIllustration,
  LaundryCustomerProfileIcon,
  LaundryDeliveryVanIcon,
  LaundryOrderTagIcon,
  renderFlaticonService,
  SteamIronIcon,
  WashingMachineIcon,
} from "@/features/orders/components/PosFlaticons";
import {
  formatDateTime,
  formatPaiseToInr,
} from "@/features/orders/services/orders.service";
import type {
  CustomerBillingSummary,
  OrderListItem,
} from "@/features/orders/types/orders.types";

// ============================================================================
// FLATICON-STYLE CUSTOM ILLUSTRATIONS
// ============================================================================

interface FlaticonProps {
  className?: string;
}

/** Flaticon-style Colorful Customer Directory Rolodex Icon */
export function CustomerDirectoryFlaticonIcon({ className = "size-8" }: FlaticonProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="8" y="12" width="48" height="42" rx="8" fill="#3B82F6" />
      <rect x="11" y="15" width="42" height="36" rx="6" fill="#FFFFFF" />
      <path d="M18 8C18 6.89543 18.8954 6 20 6H34C35.1046 6 36 6.89543 36 8V12H18V8Z" fill="#1D4ED8" />
      <circle cx="24" cy="28" r="7" fill="#60A5FA" />
      <circle cx="24" cy="26" r="3.5" fill="#FFFFFF" />
      <path d="M19 33C19 30.5 21 29 24 29C27 29 29 30.5 29 33" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="35" y="23" width="14" height="3" rx="1.5" fill="#1E293B" />
      <rect x="35" y="29" width="11" height="2.5" rx="1" fill="#64748B" />
      <rect x="16" y="39" width="32" height="2.5" rx="1" fill="#E2E8F0" />
      <rect x="16" y="44" width="22" height="2.5" rx="1" fill="#E2E8F0" />
      <circle cx="48" cy="45" r="7" fill="#10B981" />
      <path d="M45 45L47 47L51 43" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Flaticon-style Colorful B2B Commercial Enterprise Icon */
export function B2BCustomerFlaticonIcon({ className = "size-8" }: FlaticonProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="12" y="10" width="40" height="46" rx="6" fill="#4F46E5" />
      <rect x="15" y="13" width="34" height="40" rx="4" fill="#EEF2FF" />
      <rect x="20" y="18" width="5" height="5" rx="1" fill="#6366F1" />
      <rect x="29" y="18" width="5" height="5" rx="1" fill="#6366F1" />
      <rect x="38" y="18" width="5" height="5" rx="1" fill="#6366F1" />
      <rect x="20" y="27" width="5" height="5" rx="1" fill="#6366F1" />
      <rect x="29" y="27" width="5" height="5" rx="1" fill="#6366F1" />
      <rect x="38" y="27" width="5" height="5" rx="1" fill="#6366F1" />
      <rect x="27" y="39" width="10" height="14" rx="2" fill="#312E81" />
      <circle cx="48" cy="18" r="8" fill="#F59E0B" />
      <path d="M45 15H51M45 17.5H50M45 15V22M48 17.5C49.5 17.5 50.5 18.5 50 20L45 22" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Flaticon-style Colorful Retail Individual Client Icon */
export function RetailCustomerFlaticonIcon({ className = "size-8" }: FlaticonProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="32" cy="32" r="26" fill="#F0F9FF" stroke="#BAE6FD" strokeWidth="2" />
      <circle cx="32" cy="22" r="8" fill="#0284C7" />
      <circle cx="32" cy="20" r="4" fill="#E0F2FE" />
      <path d="M20 46C20 38 25 34 32 34C39 34 44 38 44 46" fill="#0369A1" />
      <path d="M26 40H38L40 52H24L26 40Z" fill="#38BDF8" />
      <polygon points="29,40 35,40 32,45" fill="#FFFFFF" />
      <path d="M48 16L49.5 20L53.5 21.5L49.5 23L48 27L46.5 23L42.5 21.5L46.5 20L48 16Z" fill="#F59E0B" />
    </svg>
  );
}

/** Flaticon-style Register New Customer Modal Icon */
export function AddCustomerFlaticonIcon({ className = "size-8" }: FlaticonProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="28" cy="32" r="22" fill="#EFF6FF" stroke="#93C5FD" strokeWidth="2" />
      <circle cx="28" cy="24" r="7" fill="#2563EB" />
      <path d="M16 46C16 38 21 35 28 35C35 35 40 38 40 46" fill="#1D4ED8" />
      <circle cx="48" cy="24" r="10" fill="#10B981" />
      <line x1="48" y1="18" x2="48" y2="30" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="42" y1="24" x2="54" y2="24" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Flaticon-style Empty Directory Search Illustration */
export function EmptyCustomerIllustration({ className = "size-20" }: FlaticonProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="48" cy="48" r="42" stroke="#CBD5E1" strokeWidth="2.5" strokeDasharray="6 6" fill="#F8FAFC" />
      <path d="M24 44L28 72C28.5 75 31 77 34 77H62C65 77 67.5 75 68 72L72 44H24Z" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="3" />
      <rect x="20" y="38" width="56" height="8" rx="4" fill="#2563EB" />
      <line x1="36" y1="46" x2="38" y2="72" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="48" y1="46" x2="48" y2="72" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="60" y1="46" x2="58" y2="72" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="56" cy="34" r="14" fill="#FFFFFF" stroke="#F59E0B" strokeWidth="3.5" />
      <circle cx="56" cy="34" r="9" fill="#FEF3C7" />
      <line x1="66" y1="44" x2="76" y2="54" stroke="#D97706" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="56" cy="31" r="3" fill="#D97706" />
      <path d="M51 39C51 36 53 35 56 35C59 35 61 36 61 39" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// DATA TYPES & HELPERS
// ============================================================================

export interface CustomerRecord {
  id: number;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  stateCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerAddressRecord {
  id: number;
  customerId: number;
  addressType: string;
  label: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  isDefaultPickup: boolean;
  isDefaultDelivery: boolean;
  createdAt: string;
}

export interface CustomerPreferenceRecord {
  customerId: number;
  detergentPreference?: string | null;
  starchLevel?: string | null;
  foldOrHanger?: string | null;
  fragranceFree?: boolean;
  specialInstructions?: string | null;
}

/**
 * Masks a mobile number for staff privacy (e.g. +91 98••• ••210)
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length <= 4) {
    return trimmed;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    const main = digits.slice(2);
    return `+91 ${main.slice(0, 2)}••• ••${main.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 2)}••• ••${digits.slice(7)}`;
  }

  const prefix = trimmed.startsWith("+") ? "+" : "";
  const start = digits.slice(0, 2);
  const end = digits.slice(-2);
  return `${prefix}${start}••••••${end}`;
}

/** Extract customer initials for avatar */
function getCustomerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic vibrant pastel avatar palette */
const AVATAR_PALETTES = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
  { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
];

function getAvatarPalette(id: number) {
  return AVATAR_PALETTES[Math.abs(id) % AVATAR_PALETTES.length];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CustomersPage() {
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "b2b" | "inactive">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal / Form state for Add Customer
  const [showAddModal, setShowAddModal] = useState(false);
  const [formFullName, setFormFullName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formGstin, setFormGstin] = useState("");
  const [formStateCode, setFormStateCode] = useState("29");
  const [formAddressLine1, setFormAddressLine1] = useState("");
  const [formCity, setFormCity] = useState("Bangalore");
  const [formState, setFormState] = useState("Karnataka");
  const [formPostalCode, setFormPostalCode] = useState("560001");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal / Form state for Edit Customer
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editGstin, setEditGstin] = useState("");
  const [editStateCode, setEditStateCode] = useState("29");
  const [editIsActive, setEditIsActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Customer Full Details & History Drawer / Modal
  const [selectedDetailCustomer, setSelectedDetailCustomer] = useState<CustomerRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAddresses, setDetailAddresses] = useState<CustomerAddressRecord[]>([]);
  const [detailPreferences, setDetailPreferences] = useState<CustomerPreferenceRecord | null>(null);
  const [detailOrders, setDetailOrders] = useState<OrderListItem[]>([]);
  const [detailOrdersLoading, setDetailOrdersLoading] = useState(false);
  const [customerBilling, setCustomerBilling] = useState<CustomerBillingSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "orders">("overview");

  async function loadCustomers() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/customers?limit=100&includeInactive=true");
      if (!res.ok) {
        throw new Error(`Failed to load customers (HTTP ${res.status})`);
      }
      const json = (await res.json()) as {
        data: { items: CustomerRecord[] };
      };
      setCustomers(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  // Copy helper
  function copyToClipboard(text: string, identifier: string) {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedId(identifier);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  }

  // Calculate statistics
  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.isActive).length;
    const b2b = customers.filter((c) => Boolean(c.gstin && c.gstin.trim())).length;
    const retail = total - b2b;
    const inactive = total - active;
    return { total, active, b2b, retail, inactive };
  }, [customers]);

  // Reset page when search or tab filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterTab]);

  // Search and Tab filtering
  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (filterTab === "active") {
      list = list.filter((c) => c.isActive);
    } else if (filterTab === "b2b") {
      list = list.filter((c) => Boolean(c.gstin && c.gstin.trim()));
    } else if (filterTab === "inactive") {
      list = list.filter((c) => !c.isActive);
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;

    const rawQueryDigits = q.replace(/\D/g, "");

    return list.filter((c) => {
      const matchName = c.fullName.toLowerCase().includes(q);
      const matchCode = c.customerCode.toLowerCase().includes(q);
      const matchEmail = Boolean(c.email && c.email.toLowerCase().includes(q));
      const matchGstin = Boolean(c.gstin && c.gstin.toLowerCase().includes(q));
      const matchPhone =
        c.phone.includes(q) ||
        (rawQueryDigits.length >= 3 &&
          c.phone.replace(/\D/g, "").includes(rawQueryDigits));

      return matchName || matchCode || matchEmail || matchGstin || matchPhone;
    });
  }, [customers, search, filterTab]);

  const totalPages = Math.ceil(filteredCustomers.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedCustomers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, safeCurrentPage, pageSize]);

  // 1. Create New Customer
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!formFullName.trim() || !formPhone.trim()) {
      setFormError("Full Name and Phone Number are required.");
      return;
    }

    setSavingCustomer(true);
    setFormError(null);

    try {
      const custCode = `CUST-${Date.now().toString().slice(-4)}`;
      const res = await apiFetch("/api/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerCode: custCode,
          fullName: formFullName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || null,
          gstin: formGstin.trim() || null,
          stateCode: formStateCode.trim() || "29",
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to create customer");
      }

      const created = (await res.json()) as { data: CustomerRecord };

      if (formAddressLine1.trim()) {
        await apiFetch(`/api/v1/customers/${created.data.id}/addresses`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            addressType: "home",
            line1: formAddressLine1.trim(),
            city: formCity.trim() || "Bangalore",
            state: formState.trim() || "Karnataka",
            stateCode: formStateCode.trim() || "29",
            postalCode: formPostalCode.trim() || "560001",
            isDefaultPickup: true,
            isDefaultDelivery: true,
          }),
        }).catch(() => undefined);
      }

      setShowAddModal(false);
      setFormFullName("");
      setFormPhone("");
      setFormEmail("");
      setFormGstin("");
      setFormAddressLine1("");
      setSuccessNotice(`Customer "${created.data.fullName}" (${created.data.customerCode}) created successfully!`);
      setTimeout(() => setSuccessNotice(null), 4000);
      await loadCustomers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  }

  // 2. Open Edit Customer Modal
  function openEditCustomer(cust: CustomerRecord) {
    setEditingCustomer(cust);
    setEditFullName(cust.fullName);
    setEditPhone(cust.phone);
    setEditEmail(cust.email ?? "");
    setEditGstin(cust.gstin ?? "");
    setEditStateCode(cust.stateCode ?? "29");
    setEditIsActive(cust.isActive);
    setEditError(null);
  }

  // 3. Save Edit Customer
  async function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!editFullName.trim() || !editPhone.trim()) {
      setEditError("Full Name and Phone Number are required.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    try {
      const res = await apiFetch(`/api/v1/customers/${editingCustomer.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || null,
          gstin: editGstin.trim() || null,
          stateCode: editStateCode.trim() || "29",
          isActive: editIsActive,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to update customer");
      }

      const updated = (await res.json()) as { data: CustomerRecord };

      // Update local state in-place
      setCustomers((prev) =>
        prev.map((c) => (c.id === updated.data.id ? updated.data : c)),
      );
      if (selectedDetailCustomer?.id === updated.data.id) {
        setSelectedDetailCustomer(updated.data);
      }

      setEditingCustomer(null);
      setSuccessNotice(`Customer "${updated.data.fullName}" updated successfully!`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setSavingEdit(false);
    }
  }

  // 4. Quick Toggle Active / Inactive
  async function handleToggleActive(cust: CustomerRecord) {
    const nextState = !cust.isActive;
    try {
      const res = await apiFetch(`/api/v1/customers/${cust.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isActive: nextState,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update customer status (HTTP ${res.status})`);
      }

      const updated = (await res.json()) as { data: CustomerRecord };

      setCustomers((prev) =>
        prev.map((c) => (c.id === cust.id ? { ...c, isActive: nextState } : c)),
      );

      if (selectedDetailCustomer?.id === cust.id) {
        setSelectedDetailCustomer({ ...selectedDetailCustomer, isActive: nextState });
      }

      setSuccessNotice(
        `Customer "${cust.fullName}" marked as ${nextState ? "Active" : "Inactive"}.`,
      );
      setTimeout(() => setSuccessNotice(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  // 5. Open Customer Full Details & History Drawer/Modal
  async function openCustomerFullDetails(cust: CustomerRecord) {
    setSelectedDetailCustomer(cust);
    setDetailTab("overview");
    setDetailLoading(true);
    setDetailOrdersLoading(true);

    // Fetch customer details (addresses + preferences)
    try {
      const res = await apiFetch(`/api/v1/customers/${cust.id}`);
      if (res.ok) {
        const json = (await res.json()) as {
          data: {
            customer: CustomerRecord;
            addresses: CustomerAddressRecord[];
            preferences: CustomerPreferenceRecord | null;
          };
        };
        setDetailAddresses(json.data.addresses ?? []);
        setDetailPreferences(json.data.preferences ?? null);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setDetailLoading(false);
    }

    // Fetch customer order history
    try {
      const oRes = await apiFetch(`/api/v1/orders?customerId=${cust.id}&limit=100`);
      if (oRes.ok) {
        const oJson = (await oRes.json()) as {
          data: { items: OrderListItem[] };
        };
        setDetailOrders(oJson.data.items ?? []);
      }
    } catch {
      setDetailOrders([]);
    } finally {
      setDetailOrdersLoading(false);
    }

    // Fetch customer lifetime billing summary
    try {
      const bRes = await apiFetch(`/api/v1/customers/${cust.id}/billing`);
      if (bRes.ok) {
        const bJson = (await bRes.json()) as { data: CustomerBillingSummary };
        setCustomerBilling(bJson.data);
      }
    } catch {
      setCustomerBilling(null);
    }
  }

  const filterTabs = [
    { id: "all", label: "All Customers", count: stats.total },
    { id: "active", label: "Active", count: stats.active },
    { id: "b2b", label: "B2B / GSTIN", count: stats.b2b },
    { id: "inactive", label: "Inactive", count: stats.inactive },
  ] as const;

  // Order history statistics for the selected customer
  const customerOrderStats = useMemo(() => {
    const totalCount = detailOrders.length;
    const totalSpent = detailOrders.reduce((sum, o) => sum + (o.totalAmountPaise || 0), 0);
    const activeCount = detailOrders.filter((o) =>
      ["confirmed", "processing", "out_for_delivery", "hold"].includes(o.status),
    ).length;
    const completedCount = detailOrders.filter((o) => o.status === "delivered").length;
    return { totalCount, totalSpent, activeCount, completedCount };
  }, [detailOrders]);

  return (
    <TooltipProvider delay={250}>
      <div className="pos-workspace space-y-5 pb-16 select-none">
        {/* ================= PAGE HEADER ================= */}
        <PageHeader
          title="Customer Directory"
          subtitle="Manage customer profiles, order history, GSTIN credentials, and account activation."
          icon={<CustomerDirectoryFlaticonIcon className="size-8" />}
          badge={
            <Badge
              variant="outline"
              className="text-xs font-bold text-blue-700 bg-blue-50/70 border-blue-200 px-2.5 py-0.5 rounded-full"
            >
              {customers.length} Profiles
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void loadCustomers()}
                className="h-9 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </Button>

              <Button
                onClick={() => setShowAddModal(true)}
                className="pos-cta-btn h-9 px-4 gap-1.5 text-xs font-bold shadow-sm"
              >
                <Plus className="size-4" />
                <span>Add Customer</span>
              </Button>
            </div>
          }
        />

        {/* Success Alert Banner */}
        {successNotice ? (
          <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/90 text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <AlertDescription className="text-xs font-semibold">
                {successNotice}
              </AlertDescription>
            </div>
            <button
              type="button"
              onClick={() => setSuccessNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1"
            >
              <X className="size-3.5" />
            </button>
          </Alert>
        ) : null}

        {/* Error Alert */}
        {error ? (
          <Alert variant="destructive" className="rounded-2xl">
            <AlertCircle className="size-4" />
            <AlertTitle className="text-xs font-bold">Directory Error</AlertTitle>
            <AlertDescription className="flex items-center justify-between text-xs mt-1">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadCustomers()}
                className="h-7 text-xs bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              >
                <RefreshCw className="mr-1.5 size-3" />
                <span>Retry</span>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* ================= FLATICON QUICK STATS KPI ROW ================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Total Profiles"
            value={stats.total}
            icon={<CustomerDirectoryFlaticonIcon className="size-7" />}
            colorScheme="blue"
          />
          <MetricCard
            label="Active Accounts"
            value={stats.active}
            icon={<LaundryCustomerProfileIcon className="size-7" />}
            colorScheme="emerald"
          />
          <MetricCard
            label="B2B & GSTIN"
            value={stats.b2b}
            icon={<B2BCustomerFlaticonIcon className="size-7" />}
            colorScheme="indigo"
          />
          <MetricCard
            label="Inactive Accounts"
            value={stats.inactive}
            icon={<UserX className="size-6 text-slate-500" />}
            colorScheme="slate"
          />
        </div>

        {/* ================= FILTER TABS & SEARCH COMMAND ROW ================= */}
        <div className="bg-surface p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 pos-scroll">
              {filterTabs.map((tab) => {
                const isActive = filterTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive
                          ? "bg-blue-700/80 text-white"
                          : "bg-slate-200/80 text-slate-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Live Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search name, phone, code, GSTIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs rounded-xl border-slate-200 bg-white focus-visible:ring-2 focus-visible:ring-blue-500 shadow-2xs"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear Search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {search ? (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
              <span>
                Matching <strong className="text-slate-800">{filteredCustomers.length}</strong> of{" "}
                {customers.length} customers
              </span>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-blue-600 hover:underline font-semibold"
              >
                Reset search
              </button>
            </div>
          ) : null}
        </div>

        {/* ================= CUSTOMERS LISTING / TABLE CARD ================= */}
        <Card className="border border-slate-200/90 bg-surface rounded-2xl shadow-2xs overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48 rounded" />
                    <Skeleton className="h-3 w-28 rounded" />
                  </div>
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200/80 mb-3 flex items-center justify-center">
                <EmptyCustomerIllustration className="size-20" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {search ? "No matching customers found" : "No customers in your directory"}
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                {search
                  ? `We couldn't find any customer profiles matching "${search}". Check phone digits or spelling.`
                  : "Start creating customer profiles to enable instant POS order dispatching and GST invoicing."}
              </p>
              {search ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 rounded-xl text-xs"
                  onClick={() => setSearch("")}
                >
                  <RefreshCw className="mr-1.5 size-3.5" />
                  <span>Clear Search Filter</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="pos-cta-btn mt-4 text-xs font-bold rounded-xl"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="mr-1.5 size-4" />
                  <span>Register First Customer</span>
                </Button>
              )}
            </div>
          ) : isMobile ? (
            /* ================= MOBILE TOUCH CARDS ================= */
            <div className="divide-y divide-slate-100 p-2 space-y-2">
              {paginatedCustomers.map((cust) => {
                const palette = getAvatarPalette(cust.id);
                const initials = getCustomerInitials(cust.fullName);

                return (
                  <motion.div
                    key={cust.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => void openCustomerFullDetails(cust)}
                      >
                        <div
                          className={`size-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${palette.bg} ${palette.text} ${palette.border}`}
                        >
                          {initials}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 leading-tight hover:text-blue-600 transition-colors">
                            {cust.fullName}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              {cust.customerCode}
                            </span>
                            {cust.gstin ? (
                              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold py-0">
                                B2B
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Status Toggle Switch / Badge */}
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(cust)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border transition-colors cursor-pointer ${
                          cust.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                            : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                        }`}
                        title={cust.isActive ? "Click to Deactivate" : "Click to Activate"}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            cust.isActive ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                        <span>{cust.isActive ? "Active" : "Inactive"}</span>
                      </button>
                    </div>

                    {/* Contact & GST details */}
                    <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-700">
                        <div className="flex items-center gap-2">
                          <Phone className="size-3.5 text-blue-600 shrink-0" />
                          <span className="font-mono font-semibold">
                            {maskPhoneNumber(cust.phone)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(cust.phone, `phone-${cust.id}`)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Copy Phone"
                          >
                            {copiedId === `phone-${cust.id}` ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                          <a
                            href={`tel:${cust.phone}`}
                            className="p-1 text-blue-600 hover:text-blue-800 rounded"
                            title="Call Customer"
                          >
                            <PhoneCall className="size-3" />
                          </a>
                        </div>
                      </div>

                      {cust.email ? (
                        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                          <Mail className="size-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{cust.email}</span>
                        </div>
                      ) : null}

                      {cust.gstin ? (
                        <div className="flex items-center gap-2 text-[11px] text-indigo-700 pt-1 border-t border-slate-200/50">
                          <Building className="size-3.5 text-indigo-500 shrink-0" />
                          <span className="font-mono font-semibold">
                            GSTIN: {cust.gstin}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void openCustomerFullDetails(cust)}
                        className="flex-1 h-8 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 gap-1"
                      >
                        <Eye className="size-3.5 text-slate-500" />
                        <span>History</span>
                      </Button>

                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openEditCustomer(cust)}
                        className="h-8 px-2.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-700"
                        title="Edit Customer"
                      >
                        <Pencil className="size-3.5" />
                      </Button>

                      <Button
                        size="xs"
                        nativeButton={false}
                        render={<Link to={`/orders/new?customerId=${cust.id}`} />}
                        className="pos-cta-btn flex-1 h-8 text-xs font-bold rounded-xl justify-center"
                      >
                        <Plus className="mr-1 size-3.5" />
                        <span>New Order</span>
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* ================= DESKTOP FLUID DATA TABLE ================= */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/70 border-b border-slate-200/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[280px] font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 pl-5">
                      Customer Profile
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5">
                      Phone Number
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5">
                      Email Address
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5">
                      Account Type / GSTIN
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-center">
                      Status / Inactive
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-right pr-5">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCustomers.map((cust) => {
                    const palette = getAvatarPalette(cust.id);
                    const initials = getCustomerInitials(cust.fullName);

                    return (
                      <TableRow
                        key={cust.id}
                        className="orders-row-interactive border-b border-slate-100 hover:bg-blue-50/30 transition-colors"
                      >
                        {/* Profile & Avatar */}
                        <TableCell className="py-3.5 pl-5">
                          <div
                            className="flex items-center gap-3 cursor-pointer group"
                            onClick={() => void openCustomerFullDetails(cust)}
                            title="Click to view full details and order history"
                          >
                            <div
                              className={`size-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 border shadow-2xs ${palette.bg} ${palette.text} ${palette.border}`}
                            >
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 group-hover:text-blue-600 transition-colors">
                                <span>{cust.fullName}</span>
                                <Eye className="size-3 text-slate-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                                  {cust.customerCode}
                                </span>
                                {cust.stateCode ? (
                                  <span className="text-[10px] text-slate-400">
                                    State: {cust.stateCode}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Phone with Mask & Copy */}
                        <TableCell className="py-3.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-800">
                              {maskPhoneNumber(cust.phone)}
                            </span>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(cust.phone, `phone-${cust.id}`)}
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                    aria-label="Copy phone number"
                                  >
                                    {copiedId === `phone-${cust.id}` ? (
                                      <Check className="size-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="size-3.5" />
                                    )}
                                  </button>
                                }
                              />
                              <TooltipContent className="text-[11px] py-1 px-2">
                                {copiedId === `phone-${cust.id}`
                                  ? "Copied to clipboard!"
                                  : "Copy phone number"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>

                        {/* Email */}
                        <TableCell className="py-3.5 text-xs text-slate-600">
                          {cust.email ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="size-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[180px]">{cust.email}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-mono">—</span>
                          )}
                        </TableCell>

                        {/* Type & GSTIN */}
                        <TableCell className="py-3.5 text-xs">
                          {cust.gstin ? (
                            <div className="space-y-0.5">
                              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                                B2B Corporate
                              </Badge>
                              <div className="font-mono text-[11px] font-semibold text-indigo-900">
                                {cust.gstin}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-slate-500">
                              <span className="inline-block size-1.5 rounded-full bg-slate-300" />
                              <span>Retail Client</span>
                            </div>
                          )}
                        </TableCell>

                        {/* Active / Inactive Toggle Status Button */}
                        <TableCell className="py-3.5 text-center">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  onClick={() => void handleToggleActive(cust)}
                                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 border transition-all cursor-pointer ${
                                    cust.isActive
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                                  }`}
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${
                                      cust.isActive ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                  />
                                  <span>{cust.isActive ? "Active" : "Inactive"}</span>
                                </button>
                              }
                            />
                            <TooltipContent className="text-[11px] py-1 px-2">
                              {cust.isActive
                                ? "Click to inactivate customer"
                                : "Click to activate customer"}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        {/* Actions: View Details / Edit / New Order */}
                        <TableCell className="py-3.5 text-right pr-5">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {/* View Full Details & Order History Button */}
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    size="icon-xs"
                                    variant="outline"
                                    onClick={() => void openCustomerFullDetails(cust)}
                                    className="size-8 rounded-xl border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 cursor-pointer"
                                    aria-label="View Details & Order History"
                                  >
                                    <Eye className="size-3.5" />
                                  </Button>
                                }
                              />
                              <TooltipContent className="text-[11px]">
                                View Profile & Order History
                              </TooltipContent>
                            </Tooltip>

                            {/* Edit Customer Button */}
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    size="icon-xs"
                                    variant="outline"
                                    onClick={() => openEditCustomer(cust)}
                                    className="size-8 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                                    aria-label="Edit Customer"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                }
                              />
                              <TooltipContent className="text-[11px]">
                                Edit Customer
                              </TooltipContent>
                            </Tooltip>

                            {/* New Order CTA */}
                            <Button
                              size="xs"
                              variant="outline"
                              nativeButton={false}
                              render={<Link to={`/orders/new?customerId=${cust.id}`} />}
                              className="h-8 px-2.5 text-xs font-bold rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50/80 hover:border-blue-300 gap-1 cursor-pointer shadow-2xs"
                            >
                              <Plus className="size-3.5" />
                              <span>Order</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Bar */}
          {!loading && !error && filteredCustomers.length > 0 ? (
            <PaginationBar
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalItems={filteredCustomers.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 25, 50]}
              label="customers"
            />
          ) : null}
        </Card>

        {/* ================= MODAL: REGISTER NEW CUSTOMER ================= */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogPopup className="max-w-xl p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20">
                  <AddCustomerFlaticonIcon className="size-7" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    New Customer Registration
                  </h3>
                  <p className="text-xs text-blue-100 mt-0.5">
                    Create profile for instant POS invoicing & delivery scheduling
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4 bg-white">
              {formError ? (
                <Alert variant="destructive" className="py-2.5 text-xs rounded-xl">
                  <AlertCircle className="size-4" />
                  <AlertDescription className="font-medium">{formError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <User className="size-3.5 text-blue-600" />
                  <span>Personal & Contact Info</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Full Name *</Label>
                    <Input
                      required
                      placeholder="e.g. Rajesh Kumar"
                      value={formFullName}
                      onChange={(e) => setFormFullName(e.target.value)}
                      className="h-9 text-xs rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Phone Number *</Label>
                    <Input
                      required
                      placeholder="e.g. +919876543210"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="h-9 text-xs font-mono rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Email Address (Optional)</Label>
                    <Input
                      type="email"
                      placeholder="customer@example.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="h-9 text-xs rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">GSTIN (Optional, B2B Accounts)</Label>
                    <Input
                      placeholder="29AAAAA0000A1Z5"
                      maxLength={15}
                      value={formGstin}
                      onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                      className="h-9 text-xs font-mono rounded-xl border-slate-200 uppercase focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Address Details */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <MapPin className="size-3.5 text-blue-600" />
                  <span>Default Delivery Address (Optional)</span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Address Line 1</Label>
                    <Input
                      placeholder="e.g. Flat 302, Palm Heights, 100ft Road, Indiranagar"
                      value={formAddressLine1}
                      onChange={(e) => setFormAddressLine1(e.target.value)}
                      className="h-9 text-xs rounded-xl border-slate-200"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-slate-600">City</Label>
                      <Input
                        placeholder="Bangalore"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                        className="h-9 text-xs rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-slate-600">State</Label>
                      <Input
                        placeholder="Karnataka"
                        value={formState}
                        onChange={(e) => setFormState(e.target.value)}
                        className="h-9 text-xs rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-slate-600">GST State Code</Label>
                      <Input
                        placeholder="29"
                        maxLength={2}
                        value={formStateCode}
                        onChange={(e) => setFormStateCode(e.target.value)}
                        className="h-9 text-xs font-mono rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-slate-600">Postal Code</Label>
                      <Input
                        placeholder="560001"
                        maxLength={6}
                        value={formPostalCode}
                        onChange={(e) => setFormPostalCode(e.target.value)}
                        className="h-9 text-xs font-mono rounded-xl border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="h-9 px-4 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingCustomer}
                  className="pos-cta-btn h-9 px-5 text-xs font-bold rounded-xl gap-1.5"
                >
                  {savingCustomer ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5" />
                      <span>Save Customer</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= MODAL: EDIT CUSTOMER ================= */}
        <Dialog open={Boolean(editingCustomer)} onOpenChange={(open) => !open && setEditingCustomer(null)}>
          <DialogPopup className="max-w-lg p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="bg-gradient-to-r from-slate-900 to-blue-900 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20">
                  <Pencil className="size-6 text-blue-200" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    Edit Customer Profile
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Update profile credentials and account status for {editingCustomer?.customerCode}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleEditCustomer} className="p-6 space-y-4 bg-white">
              {editError ? (
                <Alert variant="destructive" className="py-2.5 text-xs rounded-xl">
                  <AlertCircle className="size-4" />
                  <AlertDescription className="font-medium">{editError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Full Name *</Label>
                    <Input
                      required
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      className="h-9 text-xs rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Phone Number *</Label>
                    <Input
                      required
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="h-9 text-xs font-mono rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Email Address</Label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="h-9 text-xs rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">GSTIN (B2B)</Label>
                    <Input
                      placeholder="29AAAAA0000A1Z5"
                      maxLength={15}
                      value={editGstin}
                      onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                      className="h-9 text-xs font-mono rounded-xl border-slate-200 uppercase focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">GST State Code</Label>
                    <Input
                      maxLength={2}
                      value={editStateCode}
                      onChange={(e) => setEditStateCode(e.target.value)}
                      className="h-9 text-xs font-mono rounded-xl border-slate-200"
                    />
                  </div>

                  {/* Active / Inactive Switch */}
                  <div className="space-y-1 flex flex-col justify-end">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div>
                        <Label className="text-xs font-bold text-slate-800">Account Status</Label>
                        <p className="text-[10px] text-slate-500">
                          {editIsActive ? "Active (Can place orders)" : "Inactive (Archived)"}
                        </p>
                      </div>
                      <Switch
                        checked={editIsActive}
                        onCheckedChange={setEditIsActive}
                        aria-label="Toggle Customer Active Status"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingCustomer(null)}
                  className="h-9 px-4 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingEdit}
                  className="pos-cta-btn h-9 px-5 text-xs font-bold rounded-xl gap-1.5"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5" />
                      <span>Update Customer</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= MODAL: CUSTOMER FULL DETAILS & ORDER HISTORY ================= */}
        <Dialog
          open={Boolean(selectedDetailCustomer)}
          onOpenChange={(open) => !open && setSelectedDetailCustomer(null)}
        >
          <DialogPopup className="max-w-3xl p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            {selectedDetailCustomer ? (
              <div className="flex flex-col max-h-[85vh]">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 p-5 sm:p-6 text-white shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="size-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-black text-xl text-white shadow-inner shrink-0">
                        {getCustomerInitials(selectedDetailCustomer.fullName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                            {selectedDetailCustomer.fullName}
                          </h2>
                          <Badge
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              selectedDetailCustomer.isActive
                                ? "bg-emerald-400/20 text-emerald-200 border-emerald-400/30"
                                : "bg-rose-400/20 text-rose-200 border-rose-400/30"
                            }`}
                          >
                            {selectedDetailCustomer.isActive ? "Active Account" : "Inactive / Archived"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-blue-100 mt-1 flex-wrap">
                          <span className="font-mono font-semibold bg-white/10 px-2 py-0.5 rounded">
                            {selectedDetailCustomer.customerCode}
                          </span>
                          <span>•</span>
                          <span>Member since {formatDateTime(selectedDetailCustomer.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Command Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditCustomer(selectedDetailCustomer)}
                        className="h-8 px-3 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl"
                      >
                        <Pencil className="mr-1.5 size-3.5" />
                        <span>Edit</span>
                      </Button>

                      {/* Inactive / Active button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleToggleActive(selectedDetailCustomer)}
                        className={`h-8 px-3 text-xs font-semibold rounded-xl border-white/20 ${
                          selectedDetailCustomer.isActive
                            ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-100"
                            : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                        }`}
                      >
                        {selectedDetailCustomer.isActive ? (
                          <>
                            <UserX className="mr-1.5 size-3.5" />
                            <span>Inactivate</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-1.5 size-3.5" />
                            <span>Activate</span>
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        nativeButton={false}
                        render={<Link to={`/orders/new?customerId=${selectedDetailCustomer.id}`} />}
                        className="h-8 px-3.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 rounded-xl shadow-xs"
                      >
                        <Plus className="mr-1 size-3.5" />
                        <span>New Order</span>
                      </Button>
                    </div>
                  </div>

                  {/* Navigation Tabs */}
                  <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/15">
                    <button
                      type="button"
                      onClick={() => setDetailTab("overview")}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        detailTab === "overview"
                          ? "bg-white text-blue-900 shadow-xs"
                          : "text-blue-100 hover:bg-white/10"
                      }`}
                    >
                      Profile & Addresses
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab("orders")}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        detailTab === "orders"
                          ? "bg-white text-blue-900 shadow-xs"
                          : "text-blue-100 hover:bg-white/10"
                      }`}
                    >
                      <History className="size-3.5" />
                      <span>Entire Order History</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          detailTab === "orders"
                            ? "bg-blue-100 text-blue-900"
                            : "bg-white/20 text-white"
                        }`}
                      >
                        {detailOrders.length}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Tab Content Container */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
                  {detailTab === "overview" ? (
                    /* ================= TAB 1: OVERVIEW & ADDRESSES ================= */
                    <div className="space-y-5">
                      {/* Contact & Business Info Grid */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Contact details */}
                        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Phone className="size-3.5 text-blue-600" />
                            <span>Contact Credentials</span>
                          </h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Phone Number:</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-800">
                                  {maskPhoneNumber(selectedDetailCustomer.phone)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyToClipboard(
                                      selectedDetailCustomer.phone,
                                      `detail-phone-${selectedDetailCustomer.id}`,
                                    )
                                  }
                                  className="text-slate-400 hover:text-slate-700 p-1 rounded"
                                  title="Copy Phone"
                                >
                                  {copiedId === `detail-phone-${selectedDetailCustomer.id}` ? (
                                    <Check className="size-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="size-3.5" />
                                  )}
                                </button>
                                <a
                                  href={`tel:${selectedDetailCustomer.phone}`}
                                  className="text-blue-600 hover:text-blue-800 p-1"
                                  title="Call Customer"
                                >
                                  <PhoneCall className="size-3.5" />
                                </a>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-500">Email Address:</span>
                              <span className="font-medium text-slate-800">
                                {selectedDetailCustomer.email ?? "Not provided"}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-500">GST State Code:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {selectedDetailCustomer.stateCode ?? "29"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Tax & GST details */}
                        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Building className="size-3.5 text-indigo-600" />
                            <span>Tax Classification</span>
                          </h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Account Type:</span>
                              {selectedDetailCustomer.gstin ? (
                                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold text-[10px]">
                                  B2B Corporate Account
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  Direct Retail Individual
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-500">GSTIN Identifier:</span>
                              <span className="font-mono font-bold text-indigo-900">
                                {selectedDetailCustomer.gstin ?? "—"}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-500">Invoice Classification:</span>
                              <span className="text-slate-700 font-medium">
                                {selectedDetailCustomer.gstin
                                  ? "GST Tax Invoice (B2B Eligible)"
                                  : "Retail Cash Docket"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Delivery Addresses Section */}
                      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="size-3.5 text-blue-600" />
                            <span>Delivery & Pickup Locations</span>
                          </h4>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {detailAddresses.length} Registered
                          </Badge>
                        </div>

                        {detailLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-10 w-full rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                          </div>
                        ) : detailAddresses.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 text-xs">
                            <MapPin className="size-8 mx-auto mb-1.5 text-slate-300" />
                            <span>No saved delivery addresses. Counter pickup by default.</span>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {detailAddresses.map((addr) => (
                              <div
                                key={addr.id}
                                className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs flex items-start justify-between gap-3"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800 capitalize">
                                      {addr.label ?? addr.addressType}
                                    </span>
                                    {addr.isDefaultDelivery ? (
                                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] py-0">
                                        Default Delivery
                                      </Badge>
                                    ) : null}
                                    {addr.isDefaultPickup ? (
                                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] py-0">
                                        Default Pickup
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="text-slate-600 leading-snug">
                                    {addr.line1}
                                    {addr.line2 ? `, ${addr.line2}` : ""}
                                    {addr.landmark ? ` (Near ${addr.landmark})` : ""}
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-mono">
                                    {addr.city}, {addr.state} - {addr.postalCode}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Care Preferences Section */}
                      {detailPreferences ? (
                        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-amber-500" />
                            <span>Laundry Care Preferences</span>
                          </h4>
                          <div className="grid gap-2 sm:grid-cols-3 text-xs pt-1">
                            {detailPreferences.detergentPreference ? (
                              <div className="p-2 rounded-xl bg-slate-50">
                                <span className="block text-[10px] text-slate-400">Detergent:</span>
                                <span className="font-semibold text-slate-800">
                                  {detailPreferences.detergentPreference}
                                </span>
                              </div>
                            ) : null}
                            {detailPreferences.starchLevel ? (
                              <div className="p-2 rounded-xl bg-slate-50">
                                <span className="block text-[10px] text-slate-400">Starch Level:</span>
                                <span className="font-semibold text-slate-800">
                                  {detailPreferences.starchLevel}
                                </span>
                              </div>
                            ) : null}
                            {detailPreferences.foldOrHanger ? (
                              <div className="p-2 rounded-xl bg-slate-50">
                                <span className="block text-[10px] text-slate-400">Packaging:</span>
                                <span className="font-semibold text-slate-800">
                                  {detailPreferences.foldOrHanger}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          {detailPreferences.specialInstructions ? (
                            <p className="text-xs text-slate-600 bg-amber-50/70 p-2.5 rounded-xl border border-amber-100 mt-2">
                              <strong>Special Instruction:</strong> {detailPreferences.specialInstructions}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    /* ================= TAB 2: ENTIRE ORDER HISTORY ================= */
                    <div className="space-y-4">
                      {/* Customer Lifetime Billing & Order Statistics Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Total Orders
                          </span>
                          <div className="text-xl font-black font-mono text-slate-900 mt-0.5">
                            {customerBilling?.totalOrdersCount ?? customerOrderStats.totalCount}
                          </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Total Billed
                          </span>
                          <div className="text-xl font-black font-mono text-blue-700 mt-0.5">
                            {formatPaiseToInr(
                              customerBilling?.totalBilledPaise ?? customerOrderStats.totalSpent,
                            )}
                          </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                            Amount Paid
                          </span>
                          <div className="text-xl font-black font-mono text-emerald-700 mt-0.5">
                            {formatPaiseToInr(customerBilling?.capturedAmountPaise ?? 0)}
                          </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              (customerBilling?.outstandingDuePaise ?? 0) > 0
                                ? "text-rose-600"
                                : "text-slate-400"
                            }`}
                          >
                            Outstanding Due
                          </span>
                          <div
                            className={`text-xl font-black font-mono mt-0.5 ${
                              (customerBilling?.outstandingDuePaise ?? 0) > 0
                                ? "text-rose-600"
                                : "text-emerald-700"
                            }`}
                          >
                            {formatPaiseToInr(customerBilling?.outstandingDuePaise ?? 0)}
                          </div>
                        </div>
                      </div>

                      {/* Lifetime Refunds notice if present */}
                      {customerBilling && customerBilling.refundedAmountPaise > 0 ? (
                        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center justify-between">
                          <span className="font-semibold">Lifetime Processed Refunds:</span>
                          <span className="font-mono font-black text-purple-800">
                            {formatPaiseToInr(customerBilling.refundedAmountPaise)}
                          </span>
                        </div>
                      ) : null}

                      {/* Orders Listing Table */}
                      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                        {detailOrdersLoading ? (
                          <div className="p-6 space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <Skeleton key={i} className="h-10 w-full rounded-xl" />
                            ))}
                          </div>
                        ) : detailOrders.length === 0 ? (
                          <div className="p-8 text-center space-y-3">
                            <LaundryBasketEmptyIllustration className="size-16 mx-auto opacity-70" />
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">
                                No past orders found
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                This customer has not placed any laundry orders yet.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              nativeButton={false}
                              render={<Link to={`/orders/new?customerId=${selectedDetailCustomer.id}`} />}
                              className="pos-cta-btn text-xs font-bold rounded-xl"
                            >
                              <Plus className="mr-1.5 size-3.5" />
                              <span>Create First Order</span>
                            </Button>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader className="bg-slate-50/70 border-b border-slate-200/70">
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="font-bold text-xs text-slate-600 py-3 pl-4">
                                    Order Number
                                  </TableHead>
                                  <TableHead className="font-bold text-xs text-slate-600 py-3">
                                    Service
                                  </TableHead>
                                  <TableHead className="font-bold text-xs text-slate-600 py-3 text-center">
                                    Status
                                  </TableHead>
                                  <TableHead className="font-bold text-xs text-slate-600 py-3">
                                    Placed Date
                                  </TableHead>
                                  <TableHead className="font-bold text-xs text-slate-600 py-3 text-right">
                                    Total Amount
                                  </TableHead>
                                  <TableHead className="font-bold text-xs text-slate-600 py-3 text-right pr-4">
                                    Docket
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {detailOrders.map((ord) => (
                                  <TableRow
                                    key={ord.id}
                                    className="hover:bg-blue-50/30 transition-colors border-b border-slate-100"
                                  >
                                    <TableCell className="py-3 pl-4 font-mono text-xs font-bold text-slate-900">
                                      {ord.orderNumber}
                                    </TableCell>
                                    <TableCell className="py-3 text-xs">
                                      <div className="flex items-center gap-2">
                                        {renderFlaticonService(ord.primaryService, "size-5")}
                                        <span className="font-semibold text-slate-700">
                                          {ord.primaryService}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-3 text-center">
                                      <span
                                        className="orders-status-pill text-[11px]"
                                        data-status={ord.status}
                                      >
                                        <span className="size-1.5 rounded-full bg-current" />
                                        <span className="capitalize">
                                          {ord.status.replace(/_/g, " ")}
                                        </span>
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-3 text-xs text-slate-500">
                                      {formatDateTime(ord.createdAt)}
                                    </TableCell>
                                    <TableCell className="py-3 text-xs font-black font-mono text-slate-900 text-right">
                                      {formatPaiseToInr(ord.totalAmountPaise)}
                                    </TableCell>
                                    <TableCell className="py-3 text-right pr-4">
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        nativeButton={false}
                                        render={<Link to={`/orders/${ord.id}`} />}
                                        className="h-7 px-2.5 text-xs font-bold rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50"
                                      >
                                        <span>View</span>
                                        <ArrowUpRight className="ml-1 size-3" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Bar */}
                <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
                  <span className="text-xs text-slate-400">
                    FreshFold Customer Registry • ID #{selectedDetailCustomer.id}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDetailCustomer(null)}
                    className="h-9 px-4 text-xs font-semibold rounded-xl"
                  >
                    Close Profile
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogPopup>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
