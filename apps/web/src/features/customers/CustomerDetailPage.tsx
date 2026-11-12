import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  OrdersIcon,
  PageContainer,
  PageHeader,
  StatusBadge,
  UsersIcon,
  type DataTableColumn,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  formatDateKey,
  formatDeliveryTime,
  formatPhoneMasked,
  localDateKey,
} from "../../lib/format";
import { useMockApi } from "../../mocks/context";
import type {
  MockCustomerDetail,
  MockOrderSummary,
} from "../../mocks/types";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "success"; data: MockCustomerDetail };

const orderColumns: DataTableColumn<MockOrderSummary>[] = [
  {
    key: "order",
    header: "Order",
    render: (order) => (
      <div className="min-w-28">
        <p className="font-semibold text-text">{order.id}</p>
        <p className="text-xs text-text-muted">{order.serviceType}</p>
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
    render: (order) =>
      order.deliveryAt ? (
        <div className="whitespace-nowrap">
          <p className="text-sm text-text">
            {formatDateKey(localDateKey(order.deliveryAt))}
          </p>
          <p className="text-xs text-text-muted">
            {formatDeliveryTime(order.deliveryAt)}
          </p>
        </div>
      ) : (
        <span className="text-sm text-text-muted">Not set</span>
      ),
  },
  {
    key: "items",
    header: "Items",
    align: "right",
    render: (order) => order.totalItems,
  },
];

export function CustomerDetailPage() {
  const api = useMockApi();
  const navigate = useNavigate();
  const { customerId = "" } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [showPhone, setShowPhone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    api
      .getCustomer(customerId)
      .then((data) => {
        if (!cancelled) {
          setState(
            data
              ? { status: "success", data }
              : { status: "not-found" },
          );
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
  }, [api, customerId, reloadToken]);

  if (state.status === "loading") {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader eyebrow="Customer" title="Customer details" />
        <LoadingState label="Loading customer" variant="detail" rows={3} />
      </PageContainer>
    );
  }

  if (state.status === "error") {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader eyebrow="Customer" title="Customer details" />
        <Alert
          tone="danger"
          title="We could not load this customer"
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
          Check your connection and try again.
        </Alert>
      </PageContainer>
    );
  }

  if (state.status === "not-found") {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader eyebrow="Customer" title="Customer details" />
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="Customer not found"
          description="Go back to the customer list to find the right person."
          action={
            <Button onClick={() => navigate("/customers")}>
              Back to customers
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const { customer, orders } = state.data;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Customer"
        title={customer.name}
        description={`Customer ${customer.id}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => navigate("/customers")}
          >
            Back to customers
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Contact details" description="Only show this when needed.">
          <p className="text-sm font-medium text-text">Contact number</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold text-text">
              {showPhone ? customer.phone : formatPhoneMasked(customer.phone)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPhone((current) => !current)}
            >
              {showPhone ? "Hide phone number" : "Show phone number"}
            </Button>
          </div>
        </Card>

        <Card title="Notes" description="Helpful details for the team.">
          {customer.notes ? (
            <p className="text-sm leading-6 text-text">{customer.notes}</p>
          ) : (
            <p className="text-sm text-text-muted">
              No notes for this customer.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Order history"
        description={
          api.capabilities.customerOrderHistory === "order-scan-fallback"
            ? "Built from the current order list until the server provides a customer-history endpoint."
            : "Every order for this customer, newest first."
        }
        padding="none"
      >
        <DataTable
          caption={`Order history for ${customer.name}`}
          columns={orderColumns}
          rows={orders}
          getRowKey={(order) => order.id}
          emptyState={
            <EmptyState
              compact
              icon={<OrdersIcon className="h-5 w-5" />}
              title="No orders yet"
              description="This customer has not placed an order."
            />
          }
          className="rounded-none border-0"
        />
      </Card>
    </PageContainer>
  );
}
