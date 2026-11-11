import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  PageContainer,
  PageHeader,
  PlusIcon,
  Select,
  StatusBadge,
  type DataTableColumn,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDeliveryTime } from "../../lib/format";
import { useMockApi } from "../../mocks/context";
import type {
  MockOrderSummary,
  OrderListResult,
  OrderSort,
  OrderStatusFilter,
} from "../../mocks/types";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: OrderListResult }
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

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "delivery", label: "Delivery time" },
];

const columns: DataTableColumn<MockOrderSummary>[] = [
  {
    key: "order",
    header: "Order",
    render: (order) => (
      <div className="min-w-32">
        <p className="font-semibold text-text">{order.id}</p>
        <p className="text-xs text-text-muted">{order.serviceType}</p>
      </div>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    render: (order) => (
      <div className="min-w-36">
        <p className="font-medium text-text">{order.customerName}</p>
        <p className="text-xs text-text-muted">
          {order.totalItems} item{order.totalItems === 1 ? "" : "s"}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (order) => <StatusBadge status={order.status} />,
  },
  {
    key: "delivery",
    header: "Delivery",
    render: (order) => (
      <span className="whitespace-nowrap text-sm text-text">
        {order.deliveryAt
          ? formatDeliveryTime(order.deliveryAt)
          : "Not set"}
      </span>
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
];

export function OrdersPage() {
  const api = useMockApi();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatusFilter>("all");
  const [sort, setSort] = useState<OrderSort>("newest");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    api
      .listOrders({ search, status, sort, page, pageSize: 4 })
      .then((data) => {
        if (!cancelled) {
          setState({ status: "success", data });
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
  }, [api, search, status, sort, page, reloadToken]);

  const data = state.status === "success" ? state.data : null;
  const attentionCount =
    data?.items.filter((order) => order.syncState !== "synced").length ?? 0;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Front desk"
        title="Orders"
        description="Find, create and update laundry orders in one place."
        actions={
          <Button
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => navigate("/orders/new")}
          >
            New order
          </Button>
        }
      />

      <Card title="Find orders" description="Search or narrow the list.">
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
      </Card>

      {attentionCount > 0 ? (
        <Alert tone="warning" title="Some orders need your attention.">
          {attentionCount} order{attentionCount === 1 ? "" : "s"}{" "}
          {attentionCount === 1 ? "is" : "are"} waiting to send or need
          review.
        </Alert>
      ) : null}

      {state.status === "loading" ? (
        <LoadingState label="Loading orders" rows={4} />
      ) : null}

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
          Check your connection and try again. Changes saved on this device
          are safe.
        </Alert>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Orders"
            columns={columns}
            rows={data.items}
            getRowKey={(order) => order.id}
            emptyState={
              <EmptyState
                title="No orders found"
                description="Try a different search or status."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              Page {data.page} of {data.pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={data.page <= 1}
              >
                Previous page
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPage((current) =>
                    Math.min(data.pageCount, current + 1),
                  )
                }
                disabled={data.page >= data.pageCount}
              >
                Next page
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
