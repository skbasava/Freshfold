import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { OrderStatus } from "@laundry/contracts";
import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  Phone,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { PaginationBar } from "@/components/ui/pagination";
import { useIsMobile } from "@/hooks";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import {
  defaultOrdersService,
  formatDateTime,
  formatPaiseToInr,
  type OrdersService,
} from "../services/orders.service";
import type { OrderListItem } from "../types/orders.types";
import {
  FoldedLaundryStackIcon,
  LaundryBasketEmptyIllustration,
  LaundryDeliveryVanIcon,
  LaundryOrderTagIcon,
  renderFlaticonService,
  SteamIronIcon,
} from "../components/PosFlaticons";

export interface OrdersPageProps {
  ordersService?: OrdersService;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: "Confirmed",
  processing: "In Process",
  hold: "On Hold",
  out_for_delivery: "Delivering",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Masks a mobile number for customer privacy (e.g. +91 98••• ••210)
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length <= 4) {
    return trimmed;
  }

  // Handle standard 12-digit Indian number with +91 or 91 prefix (e.g. +919876543210)
  if (digits.length === 12 && digits.startsWith("91")) {
    const main = digits.slice(2);
    return `+91 ${main.slice(0, 2)}••• ••${main.slice(7)}`;
  }

  // Handle standard 10-digit Indian number (e.g. 9876543210)
  if (digits.length === 10) {
    return `${digits.slice(0, 2)}••• ••${digits.slice(7)}`;
  }

  // Generic fallback: keep first 2 and last 2, mask middle with bullets
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const start = digits.slice(0, 2);
  const end = digits.slice(-2);
  return `${prefix}${start}••••••${end}`;
}

export function OrdersPage({ ordersService = defaultOrdersService }: OrdersPageProps) {
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function loadOrders() {
    setLoading(true);
    setError(null); 

    try {
      const data = await ordersService.listOrders({
        status: filter === "all" ? undefined : (filter as OrderStatus),
      });
      setOrders(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
    setCurrentPage(1);
  }, [filter]);

  // Reset pagination on search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Search filtering
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q)) ||
        (o.primaryService && o.primaryService.toLowerCase().includes(q)),
    );
  }, [orders, search]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, safeCurrentPage, pageSize]);

  // Quick stats calculation
  const stats = useMemo(() => {
    const total = orders.length;
    const confirmed = orders.filter((o) => o.status === "confirmed").length;
    const processing = orders.filter((o) => o.status === "processing").length;
    const delivering = orders.filter((o) => o.status === "out_for_delivery").length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const totalRevenuePaise = orders.reduce((sum, o) => sum + o.totalAmountPaise, 0);

    return { total, confirmed, processing, delivering, delivered, totalRevenuePaise };
  }, [orders]);

  const filterTabs = [
    { id: "all", label: "All Orders", count: orders.length },
    { id: "confirmed", label: "Confirmed", count: stats.confirmed },
    { id: "processing", label: "In Process", count: stats.processing },
    { id: "out_for_delivery", label: "Delivering", count: stats.delivering },
    { id: "hold", label: "On Hold", count: orders.filter((o) => o.status === "hold").length },
    { id: "delivered", label: "Delivered", count: stats.delivered },
  ];

  return (
    <div className="pos-workspace space-y-5 pb-12 select-none">
      {/* ================= PAGE HEADER ================= */}
      <PageHeader
        title="Orders"
        subtitle="Manage customer laundry orders, processing stages, and scheduled deliveries."
        badge={
          <Badge
            variant="outline"
            className="text-xs font-bold text-blue-700 bg-blue-50/70 border-blue-200 px-2.5 py-0.5 rounded-full"
          >
            {orders.length} Total
          </Badge>
        }
        actions={
          <Button
            nativeButton={false}
            render={<Link to="/orders/new" />}
            className="pos-cta-btn h-9 px-3.5 gap-1.5 text-xs font-bold shadow-sm"
          >
            <Plus className="size-4" />
            <span>New Order</span>
          </Button>
        }
      />

      {/* ================= FLATICON-POWERED QUICK STATS KPI ROW ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="In Process"
          value={stats.processing}
          icon={<SteamIronIcon className="size-7" />}
          colorScheme="amber"
        />
        <MetricCard
          label="Delivering"
          value={stats.delivering}
          icon={<LaundryDeliveryVanIcon className="size-7" />}
          colorScheme="blue"
        />
        <MetricCard
          label="Completed"
          value={stats.delivered}
          icon={<FoldedLaundryStackIcon className="size-7" />}
          colorScheme="emerald"
        />
        <MetricCard
          label="Total Volume"
          value={formatPaiseToInr(stats.totalRevenuePaise)}
          icon={<LaundryOrderTagIcon className="size-7" />}
          colorScheme="indigo"
        />
      </div>

      {/* Error Alert */}
      {error ? (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircle className="size-4" />
          <AlertTitle className="text-xs font-bold">Error loading orders</AlertTitle>
          <AlertDescription className="flex items-center justify-between text-xs mt-1">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadOrders()}
              className="h-7 text-xs px-2.5 bg-white text-slate-800"
            >
              <RefreshCw className="mr-1 size-3" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ================= MAIN ORDERS CARD ================= */}
      <Card className="overflow-hidden border border-slate-200/90 bg-surface shadow-xs rounded-2xl">
        {/* Controls: Search & Status Filter Tabs */}
        <div className="border-b border-slate-200/80 p-4 space-y-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search orders, customers, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl border-slate-200 bg-white"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            {/* Filter Tabs Ribbon */}
            <div className="flex items-center gap-1 overflow-x-auto p-1 bg-slate-100 rounded-xl max-w-full">
              {filterTabs.map((tab) => {
                const isActive = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`relative px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "bg-white text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 ? (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content: Skeleton vs Flaticon Empty State vs Mobile vs Table */}
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          /* ================= FLATICON-POWERED EMPTY STATE ================= */
          <div className="flex flex-col items-center justify-center p-14 text-center">
            <div className="p-4 mb-2 flex items-center justify-center">
              <LaundryBasketEmptyIllustration className="size-28" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              No orders found
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              {search
                ? `No orders matching "${search}". Try clearing your search.`
                : "No orders in this view. Create a new order to get started."}
            </p>
            {!search ? (
              <Button
                size="sm"
                className="mt-4 pos-cta-btn h-9 gap-1.5 text-xs font-bold"
                nativeButton={false}
                render={<Link to="/orders/new" />}
              >
                <Plus className="size-4" />
                <span>Create Order</span>
              </Button>
            ) : null}
          </div>
        ) : isMobile ? (
          /* ================= MOBILE VIEWPORT (Cards) ================= */
          <div className="p-3 space-y-3">
            <AnimatePresence initial={false}>
              {paginatedOrders.map((order) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl border border-slate-200/90 bg-surface p-4 shadow-2xs space-y-3"
                >
                  {/* Top Bar: Order ID + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono font-bold text-xs text-blue-700 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="size-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center">
                          {(order.customerName || "C").charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-xs text-slate-900">
                          {order.customerName || "Walk-in Customer"}
                        </span>
                      </div>
                    </div>

                    <StatusBadge
                      status={order.status}
                      label={STATUS_LABELS[order.status] ?? order.status}
                      className="orders-status-pill"
                    />
                  </div>

                  {/* Middle Info with Flaticon Service */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Service
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="p-1 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                          {renderFlaticonService(order.primaryService, "size-5")}
                        </div>
                        <span className="font-semibold text-slate-800 truncate">
                          {order.primaryService || "General Service"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Amount
                      </span>
                      <span className="font-mono font-black text-sm text-slate-900 mt-0.5 block">
                        {formatPaiseToInr(order.totalAmountPaise)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Promised delivery & CTA */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                      <Clock className="size-3 text-slate-400" />
                      <span>{formatDateTime(order.promisedDeliveryAt)}</span>
                    </span>

                    <Link
                      to={`/orders/${order.id}`}
                      className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800"
                    >
                      <span>View details</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* ================= DESKTOP & TABLET VIEWPORT (Interactive Table) ================= */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/70 border-b border-slate-200/80">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-bold text-xs text-slate-700 h-11">
                    Order Number
                  </TableHead>
                  <TableHead className="font-bold text-xs text-slate-700">
                    Customer
                  </TableHead>
                  <TableHead className="font-bold text-xs text-slate-700">
                    Service
                  </TableHead>
                  <TableHead className="font-bold text-xs text-slate-700">
                    Status
                  </TableHead>
                  <TableHead className="font-bold text-xs text-slate-700">
                    Promised Delivery
                  </TableHead>
                  <TableHead className="font-bold text-xs text-slate-700 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="w-24 text-right font-bold text-xs text-slate-700">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="orders-row-interactive border-b border-slate-100"
                  >
                    {/* Order Number */}
                    <TableCell className="py-3.5">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono font-bold text-xs text-blue-700 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {order.customerName || "Walk-in Customer"}
                          </span>
                          {order.customerPhone ? (
                            <span
                              className="text-[11px] font-mono text-slate-500 flex items-center gap-1"
                              title={order.customerPhone}
                            >
                              <span>{maskPhoneNumber(order.customerPhone)}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    {/* Primary Service with Flaticon illustration */}
                    <TableCell className="py-3.5">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/80">
                        {renderFlaticonService(order.primaryService, "size-5")}
                        <span className="font-semibold text-xs text-slate-800">
                          {order.primaryService || "General Service"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Status Pill */}
                    <TableCell className="py-3.5">
                      <StatusBadge
                        status={order.status}
                        label={STATUS_LABELS[order.status] ?? order.status}
                        className="orders-status-pill"
                      />
                    </TableCell>

                    {/* Promised Delivery */}
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                        <Clock className="size-3.5 text-slate-400" />
                        <span>{formatDateTime(order.promisedDeliveryAt)}</span>
                      </div>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="py-3.5 text-right font-mono font-black text-sm text-slate-900">
                      {formatPaiseToInr(order.totalAmountPaise)}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-bold text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-xl"
                        nativeButton={false}
                        render={<Link to={`/orders/${order.id}`} />}
                      >
                        <span>Open</span>
                        <ArrowUpRight className="ml-1 size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && !error && filteredOrders.length > 0 ? (
          <PaginationBar
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filteredOrders.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 25, 50]}
            label="orders"
          />
        ) : null}
      </Card>
    </div>
  );
}
