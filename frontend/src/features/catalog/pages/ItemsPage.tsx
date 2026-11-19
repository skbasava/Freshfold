import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  Edit3,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import {
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
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
import { PaginationBar } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useIsMobile } from "@/hooks";
import { apiFetch } from "@/lib/http/api-client";
import {
  FoldedLaundryStackIcon,
  renderFlaticonGarment,
  renderFlaticonService,
} from "../../orders/components/PosFlaticons";
import { formatPaiseToInr } from "../../orders/services/orders.service";

export interface ItemCategoryRecord {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive?: boolean;
  active?: boolean;
}

export interface CatalogItemRecord {
  id: number;
  categoryId: number;
  code: string;
  name: string;
  description: string | null;
  hsnSacCode: string;
  isActive: boolean;
  active: boolean;
  imageR2Key: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: number;
  categoryId: number;
  code: string;
  name: string;
  defaultPricingBasis: "per_item" | "per_kg";
  turnaroundHours: number;
  isActive?: boolean;
  active?: boolean;
}

export interface RateCardItemRecord {
  id: number;
  rateCardId: number;
  serviceId: number;
  itemId: number | null;
  pricingBasis: "per_item" | "per_kg";
  unitPricePaise: number;
  minQuantity: number | null;
}

export function ItemsPage() {
  const isMobile = useIsMobile();

  const [items, setItems] = useState<CatalogItemRecord[]>([]);
  const [categories, setCategories] = useState<ItemCategoryRecord[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [rateItems, setRateItems] = useState<RateCardItemRecord[]>([]);
  const [rateMap, setRateMap] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filter & Search
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add Item Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<number>(1);
  const [newItemCode, setNewItemCode] = useState("");
  const [newItemSac, setNewItemSac] = useState("999712");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newDryCleanRateRupees, setNewDryCleanRateRupees] = useState("120");
  const [newSteamIronRateRupees, setNewSteamIronRateRupees] = useState("40");
  const [newWashFoldRateRupees, setNewWashFoldRateRupees] = useState("60");
  const [savingNewItem, setSavingNewItem] = useState(false);
  const [addModalError, setAddModalError] = useState<string | null>(null);

  // Edit Item Modal
  const [editingItem, setEditingItem] = useState<CatalogItemRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editSac, setEditSac] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editDryCleanRate, setEditDryCleanRate] = useState("");
  const [editSteamIronRate, setEditSteamIronRate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [iRes, cRes, sRes, rRes] = await Promise.all([
        apiFetch("/api/v1/items?limit=100&includeInactive=true"),
        apiFetch("/api/v1/item-categories?includeInactive=true").catch(() => null),
        apiFetch("/api/v1/services").catch(() => null),
        apiFetch("/api/v1/rate-cards/1/items").catch(() => null),
      ]);

      if (!iRes.ok) throw new Error(`Failed to load items (HTTP ${iRes.status})`);
      const iJson = (await iRes.json()) as {
        data: { items: CatalogItemRecord[] } | CatalogItemRecord[];
      };
      const rawList = Array.isArray(iJson.data) ? iJson.data : iJson.data.items;
      const itemsList: CatalogItemRecord[] = (rawList ?? []).map((it: any) => {
        const isAct =
          it.isActive !== undefined
            ? Boolean(it.isActive)
            : it.active !== undefined
              ? Boolean(it.active)
              : true;
        return {
          ...it,
          isActive: isAct,
          active: isAct,
        };
      });
      setItems(itemsList);

      if (cRes && cRes.ok) {
        const cJson = (await cRes.json()) as { data: ItemCategoryRecord[] };
        const rawCats = cJson.data ?? [];
        setCategories(
          rawCats.map((c: any) => {
            const isAct =
              c.isActive !== undefined
                ? Boolean(c.isActive)
                : c.active !== undefined
                  ? Boolean(c.active)
                  : true;
            return { ...c, isActive: isAct, active: isAct };
          }),
        );
      }

      if (sRes && sRes.ok) {
        const sJson = (await sRes.json()) as { data: ServiceRecord[] };
        const rawServs = sJson.data ?? [];
        setServices(
          rawServs.map((s: any) => {
            const isAct =
              s.isActive !== undefined
                ? Boolean(s.isActive)
                : s.active !== undefined
                  ? Boolean(s.active)
                  : true;
            return { ...s, isActive: isAct, active: isAct };
          }),
        );
      }

      if (rRes && rRes.ok) {
        const rJson = (await rRes.json()) as { data: RateCardItemRecord[] };
        const rates = rJson.data ?? [];
        setRateItems(rates);
        const map: Record<string, number> = {};
        for (const r of rates) {
          map[`${r.serviceId}:${r.itemId ?? "none"}`] = r.unitPricePaise;
        }
        setRateMap(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, statusFilter]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    let list = items;

    if (categoryFilter !== "all") {
      list = list.filter((it) => it.categoryId === categoryFilter);
    }

    if (statusFilter === "active") {
      list = list.filter((it) => it.isActive ?? it.active);
    } else if (statusFilter === "inactive") {
      list = list.filter((it) => !(it.isActive ?? it.active));
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.code.toLowerCase().includes(q) ||
        (it.hsnSacCode && it.hsnSacCode.includes(q)) ||
        (it.description && it.description.toLowerCase().includes(q)),
    );
  }, [items, search, categoryFilter, statusFilter]);

  // Pagination slicing
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safeCurrentPage, pageSize]);

  // Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((it) => it.isActive ?? it.active).length;
    const garments = items.filter((it) => it.categoryId === 1).length;
    const household = items.filter((it) => it.categoryId === 2).length;
    return { total, active, garments, household };
  }, [items]);

  // Toggle Item Active / Inactive
  async function handleToggleItemActive(item: CatalogItemRecord) {
    const currentState = Boolean(item.isActive ?? item.active ?? true);
    const nextState = !currentState;
    try {
      const res = await apiFetch(`/api/v1/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: nextState }),
      });
      if (!res.ok) throw new Error("Failed to update item status");

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, isActive: nextState, active: nextState } : it,
        ),
      );
      setSuccessNotice(`Item "${item.name}" marked as ${nextState ? "Active" : "Inactive"}.`);
      setTimeout(() => setSuccessNotice(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle status");
    }
  }

  // Create New Item & Default Rate Card Entries
  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) {
      setAddModalError("Item name is required.");
      return;
    }
    setSavingNewItem(true);
    setAddModalError(null);

    const generatedCode =
      newItemCode.trim() ||
      `ITM-${newItemName
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10)}-${Date.now().toString().slice(-4)}`;

    try {
      const res = await apiFetch("/api/v1/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categoryId: newItemCategory,
          code: generatedCode,
          name: newItemName.trim(),
          hsnSacCode: newItemSac.trim() || "999712",
          description: newItemDesc.trim() || null,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errJson.message || "Failed to create garment item.");
      }

      const resJson = (await res.json()) as { data: CatalogItemRecord };
      const createdItem = resJson.data;

      // Add rate card entries for Dry Clean and Steam Iron if provided
      const dryCleanService = services.find(
        (s) => s.code.includes("dry") || s.name.toLowerCase().includes("dry clean"),
      );
      const steamIronService = services.find(
        (s) => s.code.includes("iron") || s.name.toLowerCase().includes("iron"),
      );

      const ratePromises: Promise<any>[] = [];
      const nowIso = new Date().toISOString();

      if (dryCleanService && parseFloat(newDryCleanRateRupees) > 0) {
        ratePromises.push(
          apiFetch("/api/v1/rate-cards/1/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              serviceId: dryCleanService.id,
              itemId: createdItem.id,
              taxRateId: 1,
              pricingBasis: "per_item",
              unitPricePaise: Math.round(parseFloat(newDryCleanRateRupees) * 100),
              effectiveFrom: nowIso,
            }),
          }).catch(() => null),
        );
      }

      if (steamIronService && parseFloat(newSteamIronRateRupees) > 0) {
        ratePromises.push(
          apiFetch("/api/v1/rate-cards/1/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              serviceId: steamIronService.id,
              itemId: createdItem.id,
              taxRateId: 1,
              pricingBasis: "per_item",
              unitPricePaise: Math.round(parseFloat(newSteamIronRateRupees) * 100),
              effectiveFrom: nowIso,
            }),
          }).catch(() => null),
        );
      }

      await Promise.all(ratePromises);

      setShowAddModal(false);
      setNewItemName("");
      setNewItemCode("");
      setNewItemDesc("");
      setSuccessNotice(`Item "${createdItem.name}" registered with rate card pricing!`);
      setTimeout(() => setSuccessNotice(null), 4000);
      await loadData();
    } catch (err) {
      setAddModalError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSavingNewItem(false);
    }
  }

  // Open Edit Item Modal
  function openEditModal(item: CatalogItemRecord) {
    setEditingItem(item);
    setEditName(item.name);
    setEditSac(item.hsnSacCode || "999712");
    setEditDesc(item.description || "");
    setEditActive(Boolean(item.isActive ?? item.active ?? true));

    const dcPaise = rateMap[`2:${item.id}`] ?? rateMap[`2:none`] ?? 12000;
    const ironPaise = rateMap[`3:${item.id}`] ?? rateMap[`3:none`] ?? 4000;
    setEditDryCleanRate((dcPaise / 100).toFixed(2));
    setEditSteamIronRate((ironPaise / 100).toFixed(2));

    setEditModalError(null);
  }

  // Save Edit Item & Update D1 Rate Card
  async function handleSaveEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    if (!editName.trim()) {
      setEditModalError("Item name is required.");
      return;
    }

    setSavingEdit(true);
    setEditModalError(null);
    try {
      // 1. Update item in D1 items table
      const res = await apiFetch(`/api/v1/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          hsnSacCode: editSac.trim() || "999712",
          description: editDesc.trim() || null,
          isActive: editActive,
        }),
      });

      if (!res.ok) throw new Error("Failed to update item details");

      // 2. Persist updated rate card prices in D1 rate_card_items table
      const nowIso = new Date().toISOString();
      const dryCleanService =
        services.find(
          (s) => s.code.includes("dry") || s.name.toLowerCase().includes("dry clean"),
        ) || { id: 2 };
      const steamIronService =
        services.find(
          (s) => s.code.includes("iron") || s.name.toLowerCase().includes("iron"),
        ) || { id: 3 };

      const ratePromises: Promise<any>[] = [];
      const newDcPaise = Math.round(parseFloat(editDryCleanRate || "0") * 100);
      const newIronPaise = Math.round(parseFloat(editSteamIronRate || "0") * 100);

      if (newDcPaise > 0) {
        ratePromises.push(
          apiFetch("/api/v1/rate-cards/1/items", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              serviceId: dryCleanService.id,
              itemId: editingItem.id,
              taxRateId: 1,
              pricingBasis: "per_item",
              unitPricePaise: newDcPaise,
              effectiveFrom: nowIso,
            }),
          }).catch(() => null),
        );
      }

      if (newIronPaise > 0) {
        ratePromises.push(
          apiFetch("/api/v1/rate-cards/1/items", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              serviceId: steamIronService.id,
              itemId: editingItem.id,
              taxRateId: 1,
              pricingBasis: "per_item",
              unitPricePaise: newIronPaise,
              effectiveFrom: nowIso,
            }),
          }).catch(() => null),
        );
      }

      await Promise.all(ratePromises);

      // 3. Update local state
      setItems((prev) =>
        prev.map((it) =>
          it.id === editingItem.id
            ? {
                ...it,
                name: editName.trim(),
                hsnSacCode: editSac.trim() || "999712",
                description: editDesc.trim() || null,
                isActive: editActive,
                active: editActive,
              }
            : it,
        ),
      );

      if (newDcPaise > 0 || newIronPaise > 0) {
        setRateMap((prev) => ({
          ...prev,
          ...(newDcPaise > 0 ? { [`2:${editingItem.id}`]: newDcPaise } : {}),
          ...(newIronPaise > 0 ? { [`3:${editingItem.id}`]: newIronPaise } : {}),
        }));
      }

      setEditingItem(null);
      setSuccessNotice(`Item "${editName.trim()}" and D1 rate card updated successfully.`);
      setTimeout(() => setSuccessNotice(null), 3500);
    } catch (err) {
      setEditModalError(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <TooltipProvider delay={200}>
      <div className="pos-workspace space-y-5 pb-16 select-none">
        {/* ================= PAGE HEADER ================= */}
        <PageHeader
          title="Items & Rate Cards"
          subtitle="Manage garment catalog, laundry rate card pricing, SAC codes & service basis"
          icon={<FoldedLaundryStackIcon className="size-8" />}
          badge={
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-xs"
            >
              {items.length} Registered Items
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadData()}
                disabled={loading}
                className="h-9 px-3 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setAddModalError(null);
                  setShowAddModal(true);
                }}
                className="pos-cta-btn h-9 px-4 rounded-xl text-xs font-bold gap-2 shadow-2xs cursor-pointer"
              >
                <Plus className="size-4" />
                <span>Add New Item</span>
              </Button>
            </div>
          }
        />

        {/* ================= SUCCESS BANNER ================= */}
        <AnimatePresence>
          {successNotice ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>{successNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessNotice(null)}
                className="text-emerald-700 hover:text-emerald-900 p-1"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ================= STATS SUMMARY CARDS ================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            label="Total Items"
            value={stats.total}
            icon={<Shirt className="size-5" />}
            colorScheme="blue"
          />
          <MetricCard
            label="Active in POS"
            value={stats.active}
            icon={<Check className="size-5" />}
            colorScheme="emerald"
          />
          <MetricCard
            label="Apparel Garments"
            value={stats.garments}
            icon={<Tag className="size-5" />}
            colorScheme="indigo"
          />
          <MetricCard
            label="Household Items"
            value={stats.household}
            icon={<Sparkles className="size-5" />}
            colorScheme="amber"
          />
        </div>

        {/* ================= SEARCH & CATEGORY FILTER BAR ================= */}
        <Card className="rounded-2xl border-slate-200/80 shadow-2xs bg-white p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search garments by name, code, or SAC (e.g. Shirt, Saree, 999712)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 focus-visible:bg-white"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pos-scroll pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  categoryFilter === "all"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter(1)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  categoryFilter === 1
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                }`}
              >
                Garments ({stats.garments})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter(2)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  categoryFilter === 2
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                }`}
              >
                Household ({stats.household})
              </button>
            </div>
          </div>
        </Card>

        {/* ================= ITEMS & RATES TABLE ================= */}
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs bg-surface overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : error ? (
            <div className="p-6">
              <Alert variant="destructive" className="rounded-xl">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-xs font-bold">Failed to load catalog</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="size-16 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
                <FoldedLaundryStackIcon className="size-9" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {search ? "No matching garments found" : "Catalog is empty"}
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                {search
                  ? `No items found matching "${search}". Try searching for another name or category.`
                  : "Start registering laundry garments and set rate card pricing for Dry Clean, Wash & Fold and Steam Iron."}
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
                  <span>Add First Garment</span>
                </Button>
              )}
            </div>
          ) : isMobile ? (
            /* ================= MOBILE VIEW (Cards) ================= */
            <div className="divide-y divide-slate-100 p-2 space-y-2">
              {paginatedItems.map((item) => {
                const dryCleanPrice = rateMap[`2:${item.id}`] ?? rateMap[`2:none`] ?? 12000;
                const ironPrice = rateMap[`3:${item.id}`] ?? rateMap[`3:none`] ?? 4000;
                const washPrice = rateMap[`1:none`] ?? 6000;

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="size-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          {renderFlaticonGarment(item.name, item.name, "size-8")}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{item.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              {item.code}
                            </span>
                            <Badge className="text-[10px] font-bold py-0 bg-slate-100 text-slate-600 border-slate-200">
                              {item.categoryId === 1 ? "Garment" : "Household"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleToggleItemActive(item)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border transition-colors cursor-pointer ${
                          (item.isActive ?? item.active)
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            (item.isActive ?? item.active) ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                        <span>{(item.isActive ?? item.active) ? "Active" : "Inactive"}</span>
                      </button>
                    </div>

                    {/* Rates preview */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">
                          Dry Clean
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatPaiseToInr(dryCleanPrice)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">
                          Steam Iron
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatPaiseToInr(ironPrice)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">
                          Wash & Fold
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatPaiseToInr(washPrice)}/kg
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-slate-400">
                        SAC: {item.hsnSacCode || "999712"}
                      </span>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openEditModal(item)}
                        className="rounded-lg h-7 px-2.5 text-xs font-semibold gap-1 text-slate-700"
                      >
                        <Pencil className="size-3 text-slate-500" />
                        <span>Edit</span>
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* ================= DESKTOP TABLE VIEW ================= */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 border-b border-slate-200/90">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 pl-5">
                      Garment Item & Code
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5">
                      Category
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-right">
                      Dry Clean Rate
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-right">
                      Steam Iron Rate
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-right">
                      Wash & Fold
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-center">
                      SAC Code
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-center">
                      Status
                    </TableHead>
                    <TableHead className="font-bold text-xs text-slate-600 uppercase tracking-wider py-3.5 text-right pr-5">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((item) => {
                    const dryCleanPrice = rateMap[`2:${item.id}`] ?? rateMap[`2:none`] ?? 12000;
                    const ironPrice = rateMap[`3:${item.id}`] ?? rateMap[`3:none`] ?? 4000;
                    const washPrice = rateMap[`1:none`] ?? 6000;

                    return (
                      <TableRow
                        key={item.id}
                        className="orders-row-interactive border-b border-slate-100 hover:bg-blue-50/30 transition-colors"
                      >
                        {/* Garment Item + Flaticon */}
                        <TableCell className="py-3.5 pl-5">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                              {renderFlaticonGarment(item.name, item.name, "size-7")}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-slate-900">{item.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                                  {item.code}
                                </span>
                                {item.description ? (
                                  <span className="text-[11px] text-slate-400 truncate max-w-xs">
                                    {item.description}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Category */}
                        <TableCell className="py-3.5">
                          <Badge className="text-xs font-semibold bg-slate-100 text-slate-700 border-slate-200">
                            {item.categoryId === 1 ? "Garments / Apparel" : "Household Linen"}
                          </Badge>
                        </TableCell>

                        {/* Dry Clean Unit Rate */}
                        <TableCell className="py-3.5 text-right font-mono font-bold text-xs text-slate-900">
                          <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">
                            {formatPaiseToInr(dryCleanPrice)}
                          </span>
                        </TableCell>

                        {/* Steam Iron Unit Rate */}
                        <TableCell className="py-3.5 text-right font-mono font-bold text-xs text-slate-900">
                          <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
                            {formatPaiseToInr(ironPrice)}
                          </span>
                        </TableCell>

                        {/* Wash & Fold Unit Rate */}
                        <TableCell className="py-3.5 text-right font-mono font-bold text-xs text-slate-900">
                          <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                            {formatPaiseToInr(washPrice)} / kg
                          </span>
                        </TableCell>

                        {/* SAC Code */}
                        <TableCell className="py-3.5 text-center font-mono text-xs text-slate-600">
                          <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/80">
                            {item.hsnSacCode || "999712"}
                          </span>
                        </TableCell>

                        {/* Status Toggle */}
                        <TableCell className="py-3.5 text-center">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  onClick={() => void handleToggleItemActive(item)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                                    (item.isActive ?? item.active)
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                                  }`}
                                  aria-label={
                                    (item.isActive ?? item.active) ? `Deactivate ${item.name}` : `Activate ${item.name}`
                                  }
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${
                                      (item.isActive ?? item.active) ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                  />
                                  <span>{(item.isActive ?? item.active) ? "Active" : "Inactive"}</span>
                                </button>
                              }
                            />
                            <TooltipContent className="text-[11px] py-1 px-2">
                              {(item.isActive ?? item.active) ? "Click to deactivate item" : "Click to activate item"}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3.5 text-right pr-5">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => openEditModal(item)}
                            className="rounded-xl h-8 px-2.5 text-xs font-semibold gap-1 text-slate-700 hover:bg-slate-100 border-slate-200 cursor-pointer shadow-2xs"
                          >
                            <Pencil className="size-3 text-slate-500" />
                            <span>Edit</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Bar */}
          {!loading && !error && filteredItems.length > 0 ? (
            <PaginationBar
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalItems={filteredItems.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 25, 50]}
              label="garment items"
            />
          ) : null}
        </Card>

        {/* ================= MODAL: REGISTER NEW ITEM & RATE CARD ================= */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogPopup className="max-w-xl p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20">
                  <FoldedLaundryStackIcon className="size-7" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    Add Garment Item & Rate Card
                  </h3>
                  <p className="text-xs text-blue-100 mt-0.5">
                    Register a new article and set unit service pricing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="p-6 space-y-4">
              {addModalError ? (
                <Alert variant="destructive" className="py-2.5 rounded-xl">
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-xs font-bold">Error creating item</AlertTitle>
                  <AlertDescription className="text-xs">{addModalError}</AlertDescription>
                </Alert>
              ) : null}

              {/* Item Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Garment / Article Name <span className="text-rose-500">*</span>:
                  </label>
                  <Input
                    placeholder="e.g. Silk Kurta, Blazer 2-Piece, Bedsheet Double..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="h-10 text-xs rounded-xl border-slate-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category:
                  </label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(Number(e.target.value))}
                    className="w-full h-10 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value={1}>Garments / Apparel</option>
                    <option value={2}>Household Linen</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    GST SAC Code:
                  </label>
                  <Input
                    placeholder="999712"
                    value={newItemSac}
                    onChange={(e) => setNewItemSac(e.target.value)}
                    className="h-10 text-xs rounded-xl border-slate-200 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Description / Fabric Care Notes (Optional):
                  </label>
                  <Input
                    placeholder="e.g. Delicate handwash, dry-clean recommended"
                    value={newItemDesc}
                    onChange={(e) => setNewItemDesc(e.target.value)}
                    className="h-10 text-xs rounded-xl border-slate-200"
                  />
                </div>
              </div>

              {/* Rate Card Pricing Setup */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200/80 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                  <Tag className="size-3.5 text-blue-600" />
                  <span>Rate Card Service Pricing</span>
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Dry Clean Rate (₹ / pc):
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={newDryCleanRateRupees}
                      onChange={(e) => setNewDryCleanRateRupees(e.target.value)}
                      className="h-9 text-xs rounded-xl bg-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Steam Iron Rate (₹ / pc):
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={newSteamIronRateRupees}
                      onChange={(e) => setNewSteamIronRateRupees(e.target.value)}
                      className="h-9 text-xs rounded-xl bg-white font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border-slate-200 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingNewItem || !newItemName.trim()}
                  className="pos-cta-btn rounded-xl font-bold text-xs gap-1.5 cursor-pointer shadow-2xs"
                >
                  {savingNewItem ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  <span>Register Garment Item</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        {/* ================= MODAL: EDIT ITEM DETAILS ================= */}
        <Dialog
          open={Boolean(editingItem)}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
        >
          <DialogPopup className="max-w-md p-0 rounded-3xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20">
                  <Pencil className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    Edit Garment Details
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {editingItem?.code} • {editingItem?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem} className="p-6 space-y-4">
              {editModalError ? (
                <Alert variant="destructive" className="py-2.5 rounded-xl">
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-xs font-bold">Error updating item</AlertTitle>
                  <AlertDescription className="text-xs">{editModalError}</AlertDescription>
                </Alert>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Item Name:
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 text-xs rounded-xl border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  GST SAC Code:
                </label>
                <Input
                  value={editSac}
                  onChange={(e) => setEditSac(e.target.value)}
                  className="h-10 text-xs rounded-xl border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Care Notes:
                </label>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-10 text-xs rounded-xl border-slate-200"
                />
              </div>

              {/* Rate Card Pricing */}
              <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 space-y-3">
                <div>
                  <span className="text-xs font-bold text-blue-900 block">
                    Rate Card Pricing (D1 Database)
                  </span>
                  <span className="text-[11px] text-blue-700/80">
                    Set default unit rates applied to this garment in the POS rate card
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dry Clean (₹ / pc):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">₹</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={editDryCleanRate}
                        onChange={(e) => setEditDryCleanRate(e.target.value)}
                        className="h-8 pl-6 text-xs rounded-xl border-slate-200 bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Steam Iron (₹ / pc):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">₹</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={editSteamIronRate}
                        onChange={(e) => setEditSteamIronRate(e.target.value)}
                        className="h-8 pl-6 text-xs rounded-xl border-slate-200 bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Item Status in POS</span>
                  <span className="text-[11px] text-slate-500">Enable or disable this garment at counter checkout</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditActive(!editActive)}
                  className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                    editActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  {editActive ? "Active" : "Inactive"}
                </button>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border-slate-200 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit || !editName.trim()}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-1.5 cursor-pointer shadow-2xs"
                >
                  {savingEdit ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  <span>Save Changes</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
