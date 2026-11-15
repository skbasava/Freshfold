import {
  Alert,
  AlertTriangleIcon,
  Badge,
  Button,
  Card,
  ClockIcon,
  ConfirmDialog,
  CrnBadge,
  DataTable,
  EditIcon,
  EmptyState,
  EyeIcon,
  Input,
  LoadingState,
  MetricCard,
  Modal,
  OrdersIcon,
  PageContainer,
  PageHeader,
  PaginationBar,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  Select,
  SparkleIcon,
  StatusBadge,
  StatusPills,
  Textarea,
  Toast,
  TrashIcon,
  TruckIcon,
  type DataTableColumn,
} from "@freshfold/ui";
import type { OrderStateSnapshot, Role } from "@laundry/contracts";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatDeliveryTime } from "../../lib/format";
import { useApi } from "../../api/context";
import { isApiError } from "../../api/errors";
import type {
  OrderDetail,
  OrderIntent,
  OrderSummary,
  OrderListResult,
  OrderSort,
  OrderStatusFilter,
} from "../../types";
import { HoldDialog } from "./HoldDialog";
import { RescheduleDialog } from "./RescheduleDialog";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: OrderListResult; role: Role }
  | { status: "error" };

const statusOptions = [
  { value: "all", label: "All orders" },
  { value: "attention", label: "Needs attention" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Washing" },
  { value: "hold", label: "On hold" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const statusFilterTabs: { value: OrderStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Washing" },
  { value: "hold", label: "On hold" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "delivery", label: "Delivery time" },
];

function nextStatusAction(status: OrderSummary["status"]): {
  intent: OrderIntent;
  label: string;
  success: string;
} | null {
  switch (status) {
    case "confirmed":
      return {
        intent: "markProcessing",
        label: "Mark washing",
        success: "Order marked as washing.",
      };
    case "processing":
      return {
        intent: "markOutForDelivery",
        label: "Out for delivery",
        success: "Order marked out for delivery.",
      };
    case "out_for_delivery":
      return {
        intent: "markDelivered",
        label: "Mark delivered",
        success: "Order marked as delivered.",
      };
    case "hold":
      return {
        intent: "releaseHold",
        label: "Release hold",
        success: "Order hold released.",
      };
    default:
      return null;
  }
}

export function OrdersPage() {
  const api = useApi();
  const navigate = useNavigate();
  const detectedOnline = useOnlineStatus();
  const isOnline = detectedOnline;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";

  const [search, setSearch] = useState(queryParam);
  const [status, setStatus] = useState<OrderStatusFilter>("all");
  const [sort, setSort] = useState<OrderSort>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(4);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Notifications and feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // Quick preview side panel / modal
  const [previewOrder, setPreviewOrder] = useState<OrderSummary | null>(null);
  const [previewDetail, setPreviewDetail] = useState<OrderDetail | null>(null);
  const [previewKv, setPreviewKv] = useState<OrderStateSnapshot | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Dialog states
  const [orderToCancel, setOrderToCancel] = useState<OrderSummary | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [orderToHold, setOrderToHold] = useState<OrderSummary | null>(null);
  const [orderToReschedule, setOrderToReschedule] = useState<OrderSummary | null>(null);

  const [orderToEditNotes, setOrderToEditNotes] = useState<OrderSummary | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [copiedCrn, setCopiedCrn] = useState<string | null>(null);

  useEffect(() => {
    setSearch(queryParam);
    setPage(1);
  }, [queryParam]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    Promise.all([
      api.listOrders({ search, status, sort, page, pageSize }),
      api.getSession(),
    ])
      .then(([data, session]) => {
        if (!cancelled) {
          setState({ status: "success", data, role: session.user.role });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, search, status, sort, page, pageSize, reloadToken]);

  // Load details and KV state when quick preview opens
  const openQuickPreview = (summary: OrderSummary) => {
    setPreviewOrder(summary);
    setLoadingPreview(true);
    setPreviewKv(null);
    setPreviewDetail(null);

    Promise.all([
      api.getOrder(summary.id),
      api.getOrderState(summary.id).catch(() => null),
    ])
      .then(([detail, kv]) => {
        setPreviewDetail(detail);
        setPreviewKv(kv);
      })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  };

  const handleCopyCrn = (crn: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    navigator.clipboard?.writeText(crn);
    setCopiedCrn(crn);
    setTimeout(() => setCopiedCrn(null), 2000);
  };

  const handleAdvanceStatus = async (
    order: OrderSummary,
    action: { intent: OrderIntent; success: string },
    event?: React.MouseEvent,
  ) => {
    event?.stopPropagation();
    setBusyOrderId(order.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.applyOrderIntent(
        order.id,
        action.intent,
        {},
        order.version,
        { online: isOnline },
      );
      setActionSuccess(action.success);
      setReloadToken((t) => t + 1);
      if (previewOrder?.id === order.id) {
        openQuickPreview({ ...order, version: order.version + 1 });
      }
    } catch (caught) {
      if (isApiError(caught)) {
        setActionError(caught.message);
      } else {
        setActionError("We could not update the order. Please try again.");
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!orderToCancel) return;
    setCancelling(true);
    setActionError(null);
    try {
      await api.cancelOrder(orderToCancel.id, cancelReason.trim() || "Cancelled from dashboard", {
        online: isOnline,
      });
      setToastMessage(`Order ${orderToCancel.id} was cancelled and delivery slot capacity released.`);
      setOrderToCancel(null);
      setCancelReason("");
      if (previewOrder?.id === orderToCancel.id) {
        setPreviewOrder(null);
      }
      setReloadToken((t) => t + 1);
    } catch (caught) {
      if (isApiError(caught)) {
        setActionError(caught.message);
      } else {
        setActionError("Failed to cancel order. Please try again.");
      }
    } finally {
      setCancelling(false);
    }
  };

  // Open edit notes modal after fetching existing notes
  const handleOpenEditNotes = async (order: OrderSummary) => {
    let initialNotes = "";
    try {
      const d = await api.getOrder(order.id);
      if (d?.customer.notes) {
        initialNotes = d.customer.notes;
      }
    } catch {}
    setNotesDraft(initialNotes);
    setOrderToEditNotes(order);
  };

  const handleSaveNotes = async () => {
    if (!orderToEditNotes) return;
    setSavingNotes(true);
    setActionError(null);
    try {
      await api.updateOrder(orderToEditNotes.id, {
        customerNotes: notesDraft.trim(),
      });
      setToastMessage(`Customer note updated for ${orderToEditNotes.customerName}.`);
      setOrderToEditNotes(null);
      setReloadToken((t) => t + 1);
      if (previewOrder?.id === orderToEditNotes.id && previewDetail) {
        setPreviewDetail({
          ...previewDetail,
          customer: { ...previewDetail.customer, notes: notesDraft.trim() },
        });
      }
    } catch {
      setActionError("Failed to update customer note. Please try again.");
    } finally {
      setSavingNotes(false);
    }
  };

  const data = state.status === "success" ? state.data : null;
  const role = state.status === "success" ? state.role : "front_desk";
  const manager = role === "manager";
  const hasFilters = search.trim() !== "" || status !== "all";

  // Summary counts for KPI cards
  const totalCount = data?.total ?? 0;
  const attentionCount =
    data?.items.filter(
      (order) => order.syncState !== "synced" || order.status === "hold",
    ).length ?? 0;
  const washingCount =
    data?.items.filter(
      (order) => order.status === "confirmed" || order.status === "processing",
    ).length ?? 0;
  const deliveryCount =
    data?.items.filter(
      (order) => order.status === "out_for_delivery" || order.status === "delivered",
    ).length ?? 0;

  const columns: DataTableColumn<OrderSummary>[] = [
    {
      key: "order",
      header: "Order & CRN",
      render: (order) => (
        <div className="flex flex-col gap-1 min-w-[150px]">
          <div className="flex items-center gap-2">
            <Link
              to={`/orders/${order.id}`}
              className="font-semibold text-primary hover:underline hover:text-primary-hover transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {order.id}
            </Link>
            <span className="inline-flex items-center rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
              {order.serviceType}
            </span>
          </div>

          {order.crnId ? (
            <CrnBadge crn={order.crnId} />
          ) : null}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (order) => (
        <div className="min-w-36 flex flex-col">
          <p className="font-medium text-text">{order.customerName}</p>
          <p className="text-xs text-text-muted">
            {order.totalItems} item{order.totalItems === 1 ? "" : "s"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status & Flow",
      render: (order) => (
        <div className="flex flex-col gap-1 min-w-[130px]">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={order.status} />
          </div>
          {order.previousState ? (
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <span className="truncate max-w-[70px]">{order.previousState}</span>
              <span>&rarr;</span>
              <span className="font-medium text-text">{order.status}</span>
            </span>
          ) : (
            <span className="text-[11px] text-text-muted">v{order.version}</span>
          )}
        </div>
      ),
    },
    {
      key: "delivery",
      header: "Delivery Window",
      render: (order) => (
        <div className="whitespace-nowrap text-sm text-text flex items-center gap-1.5 min-w-[130px]">
          <ClockIcon className="h-3.5 w-3.5 text-text-muted shrink-0" />
          <span>{order.deliveryAt ? formatDeliveryTime(order.deliveryAt) : "Not scheduled"}</span>
        </div>
      ),
    },
    {
      key: "sync",
      header: "Saved",
      render: (order) =>
        order.syncState === "synced" ? (
          <Badge tone="success" dot>
            Saved
          </Badge>
        ) : (
          <StatusBadge status={order.syncState} />
        ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (order) => {
        const nextAction = nextStatusAction(order.status);
        const isBusy = busyOrderId === order.id;

        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* Quick Preview Button */}
            <Button
              variant="ghost"
              size="sm"
              title="Quick preview"
              onClick={() => openQuickPreview(order)}
            >
              <EyeIcon className="h-4 w-4 text-text-muted hover:text-text" />
            </Button>

            {/* Quick Status Advance Button */}
            {nextAction && (
              <Button
                variant="secondary"
                size="sm"
                loading={isBusy}
                onClick={(e) => handleAdvanceStatus(order, nextAction, e)}
                title={nextAction.label}
              >
                {nextAction.label}
              </Button>
            )}

            {/* Edit Customer Notes Button */}
            <Button
              variant="ghost"
              size="sm"
              title="Edit customer note"
              onClick={() => handleOpenEditNotes(order)}
            >
              <EditIcon className="h-4 w-4 text-text-muted hover:text-text" />
            </Button>

            {/* Cancel/Delete Order Button (Manager and non-delivered/cancelled) */}
            {manager && order.status !== "delivered" && order.status !== "cancelled" && (
              <Button
                variant="ghost"
                size="sm"
                title="Cancel order"
                onClick={() => setOrderToCancel(order)}
              >
                <TrashIcon className="h-4 w-4 text-danger hover:text-danger-strong" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      {/* Toast Feedback */}
      {toastMessage && (
        <Toast tone="success" title={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}

      {/* Page Header */}
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Find, create, update, and manage laundry orders with real-time CRN tracing and Cloudflare KV state diagnostics."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leadingIcon={<RefreshIcon className="h-4 w-4" />}
              onClick={() => setReloadToken((t) => t + 1)}
              title="Reload orders list"
            >
              Refresh
            </Button>
            <Button
              leadingIcon={<PlusIcon className="h-4 w-4" />}
              onClick={() => navigate("/orders/new")}
            >
              New order
            </Button>
          </div>
        }
      />

      {/* KPI Metric Summary Cards using reusable MetricCard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Orders"
          value={totalCount}
          subtext="All active records"
          icon={<OrdersIcon className="h-5 w-5" />}
          tone="primary"
          active={status === "all"}
          onClick={() => {
            setStatus("all");
            setPage(1);
          }}
        />

        <MetricCard
          label="Washing & Confirmed"
          value={washingCount}
          subtext="In processing pipeline"
          icon={<SparkleIcon className="h-5 w-5" />}
          tone="primary"
          active={status === "processing"}
          onClick={() => {
            setStatus("processing");
            setPage(1);
          }}
        />

        <MetricCard
          label="On Hold / Attention"
          value={attentionCount}
          subtext="Pending review"
          icon={<AlertTriangleIcon className="h-5 w-5" />}
          tone="warning"
          active={status === "hold"}
          onClick={() => {
            setStatus("hold");
            setPage(1);
          }}
        />

        <MetricCard
          label="Fulfillment"
          value={deliveryCount}
          subtext="Out for delivery & done"
          icon={<TruckIcon className="h-5 w-5" />}
          tone="success"
          active={status === "out_for_delivery"}
          onClick={() => {
            setStatus("out_for_delivery");
            setPage(1);
          }}
        />
      </div>

      {/* Filter and Search Card with StatusPills */}
      <Card title="Find orders" description="Search or narrow the list by customer, status, or date.">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Input
              label="Search orders"
              placeholder="Order number, customer or phone"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              label="Status"
              options={statusOptions}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatusFilter);
                setPage(1);
              }}
            />
            <Select
              label="Sort by"
              options={sortOptions}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as OrderSort);
                setPage(1);
              }}
            />
          </div>

          {/* Quick Filter Status Pills */}
          <div className="pt-2 border-t border-border">
            <StatusPills
              items={statusFilterTabs}
              activeValue={status}
              onChange={(val) => {
                setStatus(val as OrderStatusFilter);
                setPage(1);
              }}
              showClear={hasFilters}
              onClear={() => {
                setSearch("");
                setStatus("all");
                setPage(1);
                if (searchParams.has("q")) {
                  setSearchParams({}, { replace: true });
                }
              }}
            />
          </div>
        </div>
      </Card>

      {/* Action Alerts */}
      {actionSuccess && (
        <Alert tone="success" title="Success">
          {actionSuccess}
        </Alert>
      )}

      {actionError && (
        <Alert tone="danger" title="Action failed">
          {actionError}
        </Alert>
      )}

      {attentionCount > 0 ? (
        <Alert tone="warning" title="Some orders need your attention.">
          {attentionCount} order{attentionCount === 1 ? "" : "s"}{" "}
          {attentionCount === 1 ? "is" : "are"} waiting to send or need review.
        </Alert>
      ) : null}

      {/* Loading State */}
      {state.status === "loading" ? (
        <LoadingState label="Loading orders" variant="table" rows={4} />
      ) : null}

      {/* Error State */}
      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load orders"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Try again
            </Button>
          }
        >
          Check your connection and try again. Changes saved on this device are safe.
        </Alert>
      ) : null}

      {/* Data Table */}
      {data ? (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Orders"
            columns={columns}
            rows={data.items}
            getRowKey={(order) => order.id}
            onRowClick={(order) => openQuickPreview(order)}
            emptyState={
              hasFilters ? (
                <EmptyState
                  icon={<SearchIcon className="h-6 w-6" />}
                  title="No orders found"
                  description="Try a different search or status."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                        setPage(1);
                        if (searchParams.has("q")) {
                          setSearchParams({}, { replace: true });
                        }
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<OrdersIcon className="h-6 w-6" />}
                  title="No orders yet"
                  description="New orders created at the desk will appear here."
                  action={
                    <Button
                      leadingIcon={<PlusIcon className="h-4 w-4" />}
                      onClick={() => navigate("/orders/new")}
                    >
                      New order
                    </Button>
                  }
                />
              )
            }
          />

          {/* Reusable PaginationBar */}
          <PaginationBar
            page={data.page}
            pageCount={data.pageCount}
            total={data.total}
            itemLabel="order"
            pageSize={pageSize}
            pageSizeOptions={[4, 10, 20]}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      ) : null}

      {/* Quick Preview Side Panel / Modal */}
      {previewOrder && (
        <Modal
          open={Boolean(previewOrder)}
          onClose={() => setPreviewOrder(null)}
          title={`Order ${previewOrder.id}`}
          description={`Customer: ${previewOrder.customerName} · ${previewOrder.serviceType}`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <Button
                variant="secondary"
                onClick={() => {
                  navigate(`/orders/${previewOrder.id}`);
                }}
              >
                Open full order page &rarr;
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPreviewOrder(null)}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4 text-sm">
            {/* Quick Header Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <StatusBadge status={previewOrder.status} />
                <Badge tone="neutral">v{previewOrder.version}</Badge>
              </div>
              <div className="text-xs text-text-muted">
                {previewOrder.deliveryAt
                  ? formatDeliveryTime(previewOrder.deliveryAt)
                  : "No delivery scheduled"}
              </div>
            </div>

            {/* CRN Identifier */}
            {previewOrder.crnId && (
              <div className="rounded-lg bg-canvas p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    CRN Identifier (9b:4b:19b)
                  </span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline cursor-pointer"
                    onClick={(e) => handleCopyCrn(previewOrder.crnId!, e)}
                  >
                    {copiedCrn === previewOrder.crnId ? "✓ Copied" : "Copy CRN"}
                  </button>
                </div>
                <p className="mt-1 font-mono text-xs font-semibold text-text truncate">
                  {previewOrder.crnId}
                </p>
              </div>
            )}

            {/* Cloudflare KV State Diagnostics */}
            <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  State Model Diagnostics
                </span>
                {previewKv?.diagnostic?.status === "broken" ? (
                  <Badge tone="danger" dot>Flow Broken</Badge>
                ) : previewOrder.status === "hold" ? (
                  <Badge tone="warning" dot>On Hold</Badge>
                ) : (
                  <Badge tone="success" dot>Healthy Flow</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">Previous:</span>
                <span className="font-semibold text-text">
                  {previewKv?.previousState ?? previewOrder.previousState ?? "None"}
                </span>
                <span className="text-text-muted">&rarr;</span>
                <span className="text-text-muted">Current:</span>
                <span className="font-semibold text-primary">
                  {previewKv?.currentState ?? previewOrder.status}
                </span>
                <span className="ml-auto text-[11px] text-text-muted">
                  Intent: {previewKv?.intent ?? "createOrder"}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            {loadingPreview ? (
              <LoadingState label="Loading details" rows={2} />
            ) : previewDetail ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg bg-canvas p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Customer Contact
                    </span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline cursor-pointer"
                      onClick={() => {
                        setOrderToEditNotes(previewOrder);
                        setNotesDraft(previewDetail.customer.notes ?? "");
                      }}
                    >
                      Edit note
                    </button>
                  </div>
                  <p className="mt-1 font-medium text-text">{previewDetail.customer.name}</p>
                  <p className="text-xs text-text-muted">Phone: {previewDetail.customer.phone}</p>
                  {previewDetail.customer.notes ? (
                    <p className="mt-2 text-xs italic text-text-muted bg-surface p-2 rounded border border-border">
                      {previewDetail.customer.notes}
                    </p>
                  ) : null}
                </div>

                {/* Items */}
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block mb-2">
                    Items ({previewDetail.items.length})
                  </span>
                  <div className="divide-y border-border">
                    {previewDetail.items.map((item) => (
                      <div key={item.id} className="flex justify-between py-1.5 text-xs">
                        <span className="text-text">{item.description}</span>
                        <span className="font-medium text-text">× {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Action Bar inside Quick Preview */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Order Operations
              </span>
              <div className="flex flex-wrap gap-2">
                {nextStatusAction(previewOrder.status) && (
                  <Button
                    size="sm"
                    loading={busyOrderId === previewOrder.id}
                    onClick={(e) =>
                      handleAdvanceStatus(
                        previewOrder,
                        nextStatusAction(previewOrder.status)!,
                        e,
                      )
                    }
                  >
                    {nextStatusAction(previewOrder.status)!.label}
                  </Button>
                )}

                {(previewOrder.status === "confirmed" || previewOrder.status === "processing") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setOrderToHold(previewOrder)}
                  >
                    Put on hold
                  </Button>
                )}

                {manager && previewOrder.status !== "delivered" && previewOrder.status !== "cancelled" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setOrderToReschedule(previewOrder)}
                  >
                    Reschedule
                  </Button>
                )}

                {previewOrder.status !== "delivered" && previewOrder.status !== "cancelled" && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setOrderToCancel(previewOrder)}
                  >
                    Cancel order
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Order Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(orderToCancel)}
        title={`Cancel order ${orderToCancel?.id ?? ""}?`}
        description="This will cancel the order, mark it as cancelled in the state machine, and release the delivery slot capacity atomically. This cannot be undone."
        confirmLabel="Yes, cancel order"
        cancelLabel="Keep order"
        tone="danger"
        loading={cancelling}
        onCancel={() => {
          setOrderToCancel(null);
          setCancelReason("");
        }}
        onConfirm={handleCancelOrder}
      />

      {/* Hold Dialog */}
      <HoldDialog
        open={Boolean(orderToHold)}
        api={api}
        order={orderToHold}
        online={isOnline}
        onClose={() => setOrderToHold(null)}
        onHeld={(updated) => {
          setToastMessage(`Order ${updated.id} was placed on hold.`);
          setOrderToHold(null);
          setReloadToken((t) => t + 1);
          if (previewOrder?.id === updated.id) {
            openQuickPreview(updated);
          }
        }}
      />

      {/* Reschedule Dialog */}
      <RescheduleDialog
        open={Boolean(orderToReschedule)}
        api={api}
        order={orderToReschedule}
        online={isOnline}
        onClose={() => setOrderToReschedule(null)}
        onMoved={(updated) => {
          setToastMessage(`Delivery time updated for order ${updated.id}.`);
          setOrderToReschedule(null);
          setReloadToken((t) => t + 1);
          if (previewOrder?.id === updated.id) {
            openQuickPreview(updated);
          }
        }}
      />

      {/* Edit Customer Notes Modal */}
      <Modal
        open={Boolean(orderToEditNotes)}
        onClose={() => setOrderToEditNotes(null)}
        title="Edit customer note"
        description={`Update instructions or preferences for ${orderToEditNotes?.customerName ?? "customer"}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setOrderToEditNotes(null)}
              disabled={savingNotes}
            >
              Cancel
            </Button>
            <Button loading={savingNotes} onClick={handleSaveNotes}>
              Save note
            </Button>
          </div>
        }
      >
        <Textarea
          label="Customer Notes"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Special care instructions, delivery preferences..."
          rows={4}
        />
      </Modal>
    </PageContainer>
  );
}
