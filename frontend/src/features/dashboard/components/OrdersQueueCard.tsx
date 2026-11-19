import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { OrderStatus } from "@laundry/contracts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Inbox,
  MoreVertical,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks";
import type {
  DashboardKpiSummary,
  DashboardOrder,
  DashboardOrderFilter,
} from "../types/dashboard.types";
import "../styles/orders-table.css";

export interface OrdersQueueCardProps {
  orders: DashboardOrder[];
  totalCount: number;
  summary: DashboardKpiSummary;
  filter: DashboardOrderFilter;
  loading?: boolean;
  onFilterChange: (filter: DashboardOrderFilter) => void;
}

type SortKey =
  | "crnId"
  | "customerName"
  | "serviceType"
  | "status"
  | "deliverySlotLabel";
type SortDirection = "asc" | "desc";

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: "Confirmed",
  processing: "In Process",
  hold: "On Hold",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_RANK: Record<OrderStatus, number> = {
  hold: 0,
  confirmed: 1,
  processing: 2,
  out_for_delivery: 3,
  delivered: 4,
  cancelled: 5,
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function compareOrders(a: DashboardOrder, b: DashboardOrder, key: SortKey): number {
  if (key === "status") {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  return a[key].localeCompare(b[key], undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) {
    return <ArrowUpDown aria-hidden="true" className="ff-ot-sort-icon" />;
  }
  return direction === "asc" ? (
    <ArrowUp aria-hidden="true" className="ff-ot-sort-icon" />
  ) : (
    <ArrowDown aria-hidden="true" className="ff-ot-sort-icon" />
  );
}

export function OrdersQueueCard({
  orders,
  totalCount,
  summary,
  filter,
  loading = false,
  onFilterChange,
}: OrdersQueueCardProps) {
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState({
    customer: true,
    service: true,
    status: true,
    deliverySlot: true,
  });

  const tabs: Array<{
    value: DashboardOrderFilter;
    label: string;
    count: number;
    alert?: boolean;
  }> = [
    { value: "all", label: "All Orders", count: totalCount },
    { value: "confirmed", label: "Confirmed", count: summary.confirmed },
    { value: "processing", label: "In Process", count: summary.processing },
    {
      value: "out_for_delivery",
      label: "Delivering",
      count: summary.outForDelivery,
    },
    { value: "hold", label: "On Hold", count: summary.onHold, alert: summary.onHold > 0 },
  ];

  const sortedOrders = useMemo(() => {
    if (!sort) return orders;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...orders].sort(
      (a, b) => compareOrders(a, b, sort.key) * factor,
    );
  }, [orders, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedOrders = useMemo(
    () => sortedOrders.slice(startIndex, startIndex + pageSize),
    [sortedOrders, startIndex, pageSize],
  );

  const rangeStart = sortedOrders.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + pageSize, sortedOrders.length);

  const allPageSelected =
    paginatedOrders.length > 0 &&
    paginatedOrders.every((o) => selectedOrders.has(o.id));

  function handleToggleAll() {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedOrders.forEach((o) => next.delete(o.id));
      } else {
        paginatedOrders.forEach((o) => next.add(o.id));
      }
      return next;
    });
  }

  function handleToggleRow(id: string) {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSortToggle(key: SortKey) {
    setPage(1);
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }
      return null;
    });
  }

  function getAriaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (!sort || sort.key !== key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  function handleCopyOrderId(crnId: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(crnId);
    }
    setCopiedId(crnId);
    window.setTimeout(() => {
      setCopiedId((current) => (current === crnId ? null : current));
    }, 1500);
  }

  const countLabel =
    orders.length === totalCount
      ? `${totalCount} ${totalCount === 1 ? "order" : "orders"}`
      : `${orders.length} of ${totalCount} orders`;

  return (
    <section
      aria-label="Order operations table"
      className="ff-ot-shell"
    >
      {/* Top Header Row with Title and Live Count */}
      <div className="ff-ot-top">
        <div className="ff-ot-title-group">
          <h2 className="ff-ot-title">Manage Order</h2>
          <span className="ff-ot-count-pill">{countLabel}</span>
        </div>
      </div>

      {/* Pill Tabs on Left + Customize Columns & New Order on Right matching reference */}
      <div className="ff-ot-action-bar">
        <div className="ff-ot-tabs-scroll">
          <Tabs
            value={filter}
            onValueChange={(value) => {
              setPage(1);
              onFilterChange(value as DashboardOrderFilter);
            }}
          >
            <TabsList className="ff-ot-tabs-list">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="ff-ot-tab"
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 ? (
                    <span
                      data-alert={tab.alert ? "true" : undefined}
                      className="ff-ot-tab-count"
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Right side controls matching reference: Customize Columns & New Order */}
        <div className="ff-ot-bar-controls">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="ff-ot-btn-customize"
                  aria-label="Customize Columns"
                />
              }
            >
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              <span>Customize Columns</span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">
                Toggle Columns
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={visibleColumns.customer}
                onCheckedChange={(checked) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    customer: Boolean(checked),
                  }))
                }
              >
                Customer
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibleColumns.service}
                onCheckedChange={(checked) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    service: Boolean(checked),
                  }))
                }
              >
                Service
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibleColumns.status}
                onCheckedChange={(checked) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    status: Boolean(checked),
                  }))
                }
              >
                Status
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibleColumns.deliverySlot}
                onCheckedChange={(checked) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    deliverySlot: Boolean(checked),
                  }))
                }
              >
                Delivery Slot
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            className="ff-ot-btn-new-order"
            nativeButton={false}
            render={<Link to="/orders/new" />}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            <span>New Order</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area: Loading / Empty / Mobile Cards / Structured Data Table */}
      {loading ? (
        isMobile ? (
          <div
            className="ff-ot-mobile-list"
            aria-busy="true"
            aria-label="Loading orders"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="ff-ot-mcard p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="ff-ot-table-wrap"
            aria-busy="true"
            aria-label="Loading orders"
          >
            <Table className="ff-ot-table">
              <TableHeader className="ff-ot-thead">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Skeleton className="size-4 rounded" />
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery Slot</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="ff-ot-row">
                    <TableCell>
                      <Skeleton className="size-4 rounded" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-24 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32 rounded" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-24 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28 rounded" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-7 w-16 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : sortedOrders.length === 0 ? (
        <div className="ff-ot-empty">
          <div className="ff-ot-empty-icon" aria-hidden="true">
            <Inbox className="size-5" />
          </div>
          <p className="ff-ot-empty-title">No orders in this view</p>
          <p className="ff-ot-empty-desc">
            Live orders from your hub will appear here as they are created or
            match your current filter.
          </p>
          <Button
            size="sm"
            className="ff-touch-target mt-4"
            nativeButton={false}
            render={<Link to="/orders/new" />}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            <span>Create first order</span>
          </Button>
        </div>
      ) : isMobile ? (
        /* Structured, labeled mobile order cards for iPhone / compact screens */
        <div
          data-testid="mobile-orders-list"
          className="ff-ot-mobile-list"
        >
          {paginatedOrders.map((order) => {
            const isCopied = copiedId === order.crnId;
            return (
              <article
                key={order.id}
                data-hold={order.status === "hold" ? "true" : undefined}
                className="ff-ot-mcard"
              >
                <div className="ff-ot-mcard-header">
                  <div className="ff-ot-mcard-identity">
                    <Link
                      to={`/orders/${order.id}`}
                      className="ff-ot-mcard-name"
                    >
                      {order.customerName}
                    </Link>
                    <span className="ff-ot-mcard-id">{order.crnId}</span>
                  </div>

                  <span
                    data-status={order.status}
                    className="ff-ot-mcard-status"
                  >
                    <span aria-hidden="true" className="ff-ot-status-dot" />
                    <span>{STATUS_LABEL[order.status]}</span>
                  </span>
                </div>

                <div className="ff-ot-mcard-body">
                  <div className="ff-ot-mcard-field">
                    <span className="ff-ot-mcard-field-k">Service</span>
                    <span className="ff-ot-mcard-field-v">
                      {order.serviceType}
                    </span>
                  </div>
                  <div className="ff-ot-mcard-field">
                    <span className="ff-ot-mcard-field-k">Slot</span>
                    <span className="ff-ot-mcard-field-v">
                      <Clock
                        aria-hidden="true"
                        className="size-3 text-muted-foreground"
                      />
                      <span>{order.deliverySlotLabel}</span>
                    </span>
                  </div>
                </div>

                {order.holdComment ? (
                  <div className="ff-ot-mcard-hold">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    <span>
                      <strong>Hold note:</strong> {order.holdComment}
                    </span>
                  </div>
                ) : null}

                <div className="ff-ot-mcard-footer">
                  <button
                    type="button"
                    className="ff-ot-mcard-copy"
                    data-copied={isCopied ? "true" : undefined}
                    onClick={() => handleCopyOrderId(order.crnId)}
                    aria-label={`Copy order ID ${order.crnId}`}
                  >
                    {isCopied ? (
                      <>
                        <Check aria-hidden="true" className="size-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy aria-hidden="true" className="size-3.5" />
                        <span>Copy ID</span>
                      </>
                    )}
                  </button>

                  <Link
                    to={`/orders/${order.id}`}
                    className="ff-ot-mcard-action"
                    aria-label={`View order ${order.crnId}`}
                  >
                    <span>View Order</span>
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Structured Data Table for iPad, Tablet & Desktop matching reference */
        <div className="ff-ot-table-wrap">
          <Table className="ff-ot-table">
            <TableHeader className="ff-ot-thead">
              <TableRow className="hover:bg-transparent">
                {/* Select All Checkbox Column */}
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={handleToggleAll}
                    aria-label="Select all orders"
                  />
                </TableHead>

                <TableHead aria-sort={getAriaSort("crnId")}>
                  <button
                    type="button"
                    className="ff-ot-sort-btn"
                    data-sorted={sort?.key === "crnId" ? "true" : undefined}
                    onClick={() => handleSortToggle("crnId")}
                  >
                    <span>Order</span>
                    <SortIcon
                      active={sort?.key === "crnId"}
                      direction={sort?.direction}
                    />
                  </button>
                </TableHead>

                {visibleColumns.customer ? (
                  <TableHead aria-sort={getAriaSort("customerName")}>
                    <button
                      type="button"
                      className="ff-ot-sort-btn"
                      data-sorted={
                        sort?.key === "customerName" ? "true" : undefined
                      }
                      onClick={() => handleSortToggle("customerName")}
                    >
                      <span>Customer</span>
                      <SortIcon
                        active={sort?.key === "customerName"}
                        direction={sort?.direction}
                      />
                    </button>
                  </TableHead>
                ) : null}

                {visibleColumns.service ? (
                  <TableHead aria-sort={getAriaSort("serviceType")}>
                    <button
                      type="button"
                      className="ff-ot-sort-btn"
                      data-sorted={
                        sort?.key === "serviceType" ? "true" : undefined
                      }
                      onClick={() => handleSortToggle("serviceType")}
                    >
                      <span>Service</span>
                      <SortIcon
                        active={sort?.key === "serviceType"}
                        direction={sort?.direction}
                      />
                    </button>
                  </TableHead>
                ) : null}

                {visibleColumns.status ? (
                  <TableHead aria-sort={getAriaSort("status")}>
                    <button
                      type="button"
                      className="ff-ot-sort-btn"
                      data-sorted={sort?.key === "status" ? "true" : undefined}
                      onClick={() => handleSortToggle("status")}
                    >
                      <span>Status</span>
                      <SortIcon
                        active={sort?.key === "status"}
                        direction={sort?.direction}
                      />
                    </button>
                  </TableHead>
                ) : null}

                {visibleColumns.deliverySlot ? (
                  <TableHead aria-sort={getAriaSort("deliverySlotLabel")}>
                    <button
                      type="button"
                      className="ff-ot-sort-btn"
                      data-sorted={
                        sort?.key === "deliverySlotLabel" ? "true" : undefined
                      }
                      onClick={() => handleSortToggle("deliverySlotLabel")}
                    >
                      <span>Delivery Slot</span>
                      <SortIcon
                        active={sort?.key === "deliverySlotLabel"}
                        direction={sort?.direction}
                      />
                    </button>
                  </TableHead>
                ) : null}

                <TableHead className="w-24 text-right pr-4">
                  <span>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedOrders.map((order) => {
                const isSelected = selectedOrders.has(order.id);
                return (
                  <TableRow
                    key={order.id}
                    data-state={isSelected ? "selected" : undefined}
                    data-hold={order.status === "hold" ? "true" : undefined}
                    className="ff-ot-row"
                  >
                    {/* Row Checkbox */}
                    <TableCell className="w-10 pl-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleRow(order.id)}
                        aria-label={`Select order ${order.crnId}`}
                      />
                    </TableCell>

                    <TableCell>
                      <Link
                        to={`/orders/${order.id}`}
                        className="ff-ot-crn-link"
                      >
                        {order.crnId}
                      </Link>
                    </TableCell>

                    {visibleColumns.customer ? (
                      <TableCell>
                        <div className="ff-ot-customer">
                          <div className="ff-ot-customer-text">
                            <span className="ff-ot-customer-name">
                              {order.customerName}
                            </span>
                            {order.holdComment ? (
                              <span className="ff-ot-hold-pill">
                                <AlertTriangle
                                  aria-hidden="true"
                                  className="size-3 shrink-0"
                                />
                                <span>{order.holdComment}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                    ) : null}

                    {visibleColumns.service ? (
                      <TableCell>
                        <span className="ff-ot-service-pill">
                          {order.serviceType}
                        </span>
                      </TableCell>
                    ) : null}

                    {visibleColumns.status ? (
                      <TableCell>
                        <span
                          data-status={order.status}
                          className="ff-ot-status-pill"
                        >
                          <span aria-hidden="true" className="ff-ot-status-dot" />
                          <span>{STATUS_LABEL[order.status]}</span>
                        </span>
                      </TableCell>
                    ) : null}

                    {visibleColumns.deliverySlot ? (
                      <TableCell>
                        <span className="ff-ot-slot-cell">
                          <Clock
                            aria-hidden="true"
                            className="ff-ot-slot-icon"
                          />
                          <span>{order.deliverySlotLabel}</span>
                        </span>
                      </TableCell>
                    ) : null}

                    <TableCell className="text-right pr-4">
                      <div className="ff-ot-actions">
                        <Link
                          to={`/orders/${order.id}`}
                          className="ff-ot-open-btn"
                          aria-label={`Open order ${order.crnId}`}
                        >
                          <span>Open</span>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Actions for order ${order.crnId}`}
                              />
                            }
                          >
                            <MoreVertical className="size-4 text-muted-foreground" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              render={<Link to={`/orders/${order.id}`} />}
                            >
                              View order details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCopyOrderId(order.crnId)}
                            >
                              <Copy
                                aria-hidden="true"
                                className="mr-1.5 size-3.5"
                              />
                              Copy Order ID
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Table Footer: Range Summary & Pagination Controls */}
      {!loading && sortedOrders.length > 0 ? (
        <div className="ff-ot-footer">
          <div className="ff-ot-footer-summary">
            Showing{" "}
            <strong>
              {rangeStart}–{rangeEnd}
            </strong>{" "}
            of <strong>{sortedOrders.length}</strong>{" "}
            {sortedOrders.length === 1 ? "order" : "orders"}
          </div>

          <div className="ff-ot-pagination">
            <label className="ff-ot-pagesize">
              <span>Rows</span>
              <select
                aria-label="Rows per page"
                className="ff-ot-pagesize-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className="ff-ot-page-nav">
              <span className="ff-ot-page-indicator">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Next page"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
