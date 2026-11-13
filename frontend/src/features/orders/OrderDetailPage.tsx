import {
  Alert,
  Button,
  ConfirmDialog,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  OrdersIcon,
  PageContainer,
  PageHeader,
  StatusBadge,
  Toast,
  type DataTableColumn,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatDateKey, formatDateTime, localDateKey } from "../../lib/format";
import { isMockApiError } from "../../mocks/errors";
import { useMockApi } from "../../mocks/context";
import type {
  MockOrderDetail,
  MockOrderIntent,
  MockOrderItem,
} from "../../mocks/types";
import type { Role } from "@laundry/contracts";
import { HoldDialog } from "./HoldDialog";
import { RescheduleDialog } from "./RescheduleDialog";
import { describeSyncState } from "../shared/order-sync";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "success"; order: MockOrderDetail; role: Role };

const itemColumns: DataTableColumn<MockOrderItem>[] = [
  {
    key: "description",
    header: "Item",
    render: (item) => <span className="font-medium text-text">{item.description}</span>,
  },
  {
    key: "quantity",
    header: "Quantity",
    align: "right",
    render: (item) => item.quantity,
  },
];

interface StatusAction {
  intent: MockOrderIntent;
  label: string;
  success: string;
}

function statusAction(status: MockOrderDetail["status"]): StatusAction | null {
  switch (status) {
    case "confirmed":
      return {
        intent: "markProcessing",
        label: "Mark washing",
        success: "Order is now being washed.",
      };
    case "processing":
      return {
        intent: "markOutForDelivery",
        label: "Mark out for delivery",
        success: "Order is out for delivery.",
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
        success: "Hold released.",
      };
    default:
      return null;
  }
}

export interface OrderDetailPageProps {
  online?: boolean;
}

function savedMessage(
  syncState: MockOrderDetail["syncState"],
  confirmed: string,
): string {
  return syncState === "pending"
    ? "Saved on this device. It will send when you reconnect."
    : confirmed;
}

export function OrderDetailPage({ online }: OrderDetailPageProps = {}) {
  const api = useMockApi();
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId = "" } = useParams();
  const createdNotice =
    location.state !== null &&
    typeof location.state === "object" &&
    "customerCreated" in location.state &&
    location.state.customerCreated === true &&
    "customerName" in location.state &&
    typeof location.state.customerName === "string"
      ? location.state.customerName
      : null;
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const detectedOnline = useOnlineStatus();
  const isOnline = online ?? detectedOnline;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIntent, setBusyIntent] = useState<MockOrderIntent | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    Promise.all([api.getOrder(orderId), api.getSession()])
      .then(([order, session]) => {
        if (cancelled) {
          return;
        }
        setState(
          order
            ? { status: "success", order, role: session.user.role }
            : { status: "not-found" },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, orderId, reloadToken]);

  const order = state.status === "success" ? state.order : null;
  const role = state.status === "success" ? state.role : "front_desk";

  const replaceOrder = (next: MockOrderDetail) => {
    setState({ status: "success", order: next, role });
  };

  const applyIntent = async (
    intent: MockOrderIntent,
    payload: unknown,
    success: string,
  ) => {
    if (!order) {
      return;
    }
    setBusyIntent(intent);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const updated = await api.applyOrderIntent(
        order.id,
        intent,
        payload,
        order.version,
        { online: isOnline },
      );
      replaceOrder(updated);
      setSuccessMessage(savedMessage(updated.syncState, success));
    } catch (caught) {
      if (isMockApiError(caught)) {
        if (caught.currentOrder) {
          replaceOrder(caught.currentOrder);
        }
        setActionError(caught.message);
      } else {
        setActionError("We could not update this order. Please try again.");
      }
    } finally {
      setBusyIntent(null);
    }
  };

  if (state.status === "loading") {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader eyebrow="Order" title="Order details" />
        <LoadingState label="Loading order" variant="detail" rows={4} />
      </PageContainer>
    );
  }

  if (state.status === "error") {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader eyebrow="Order" title="Order details" />
        <Alert
          tone="danger"
          title="We could not load this order"
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

  if (state.status === "not-found" || !order) {
    return (
      <PageContainer className="flex flex-col gap-6">
        <PageHeader eyebrow="Order" title="Order details" />
        <EmptyState
          icon={<OrdersIcon className="h-6 w-6" />}
          title="Order not found"
          description="It may have been removed. Go back to the order list."
          action={
            <Button onClick={() => navigate("/orders")}>
              Back to orders
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const syncNotice = describeSyncState(order);
  const nextAction = statusAction(order.status);
  const active =
    order.status === "confirmed" ||
    order.status === "processing" ||
    order.status === "hold";
  const manager = role === "manager";
  const canHold = order.status === "confirmed" || order.status === "processing";
  const hasActions = Boolean(nextAction) || canHold || (manager && active);

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Order"
        title={order.id}
        description={`${order.customerName} · ${order.serviceType}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => navigate("/orders")}
          >
            Back to orders
          </Button>
        }
      />

      {createdNotice && !noticeDismissed ? (
        <Toast
          tone="success"
          title={`No customer found for this phone. Added ${createdNotice} to the customer list.`}
          onDismiss={() => setNoticeDismissed(true)}
        />
      ) : null}

      {successMessage ? (
        <Alert tone="success" title={successMessage} />
      ) : null}

      {actionError ? (
        <Alert tone="danger" title="We could not update this order">
          {actionError}
        </Alert>
      ) : null}

      {syncNotice ? (
        <Alert tone={syncNotice.tone} title={syncNotice.title}>
          {syncNotice.message}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Customer" description="Contact details for this order.">
            <p className="text-lg font-semibold text-text">
              {order.customer.name}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Contact number: {order.customer.phone}
            </p>
            {order.customer.notes ? (
              <p className="mt-3 rounded-md bg-canvas p-3 text-sm leading-6 text-text-muted">
                {order.customer.notes}
              </p>
            ) : null}
          </Card>

          <Card title="Items" padding="none">
            <DataTable
              caption="Order items"
              columns={itemColumns}
              rows={order.items}
              getRowKey={(item) => item.id}
              emptyState={
                <EmptyState
                  compact
                  icon={<OrdersIcon className="h-5 w-5" />}
                  title="No items"
                  description="This order has no items."
                />
              }
              className="rounded-none border-0"
            />
          </Card>

          {order.holdComment ? (
            <Card title="Hold note" description="Why this order is paused.">
              <p className="text-sm leading-6 text-text">
                {order.holdComment}
              </p>
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Delivery" description="When the customer expects it.">
            <p className="text-lg font-semibold text-text">
              {order.deliverySlot?.label ?? "No delivery time"}
            </p>
            {order.deliveryAt ? (
              <p className="mt-1 text-sm text-text-muted">
                {formatDateKey(localDateKey(order.deliveryAt))} ·{" "}
                {formatDateTime(order.deliveryAt)}
              </p>
            ) : null}
          </Card>

          <Card title="Status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={order.status} />
              <span className="text-sm text-text-muted">
                Version {order.version}
              </span>
            </div>
          </Card>

          <Card
            title="Actions"
            description="Choose what happens next."
          >
            {hasActions ? (
              <div className="flex flex-col gap-2">
                {nextAction ? (
                  <Button
                    fullWidth
                    loading={busyIntent === nextAction.intent}
                    onClick={() =>
                      applyIntent(nextAction.intent, {}, nextAction.success)
                    }
                  >
                    {nextAction.label}
                  </Button>
                ) : null}

                {canHold ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => setHoldOpen(true)}
                  >
                    Put on hold
                  </Button>
                ) : null}

                {manager && active ? (
                  <>
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setRescheduleOpen(true)}
                    >
                      Reschedule
                    </Button>
                    <Button
                      variant="danger"
                      fullWidth
                      onClick={() => setCancelOpen(true)}
                    >
                      Cancel order
                    </Button>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                No more changes can be made to this order.
              </p>
            )}

            {!manager && active ? (
              <p className="mt-3 text-xs leading-5 text-text-muted">
                Reschedule and cancel are limited to managers.
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <HoldDialog
        open={holdOpen}
        api={api}
        order={order}
        online={isOnline}
        onClose={() => setHoldOpen(false)}
        onHeld={(updated) => {
          replaceOrder(updated);
          setSuccessMessage(
            savedMessage(updated.syncState, "Order put on hold."),
          );
        }}
      />

      <RescheduleDialog
        open={rescheduleOpen}
        api={api}
        order={order}
        online={isOnline}
        onClose={() => setRescheduleOpen(false)}
        onMoved={(updated) => {
          replaceOrder(updated);
          setSuccessMessage(
            savedMessage(updated.syncState, "Delivery time updated."),
          );
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this order?"
        description="This will release the delivery time. This cannot be undone."
        confirmLabel="Yes, cancel order"
        cancelLabel="Keep order"
        tone="danger"
        loading={busyIntent === "cancel"}
        onCancel={() => setCancelOpen(false)}
        onConfirm={async () => {
          await applyIntent("cancel", {}, "Order cancelled.");
          setCancelOpen(false);
        }}
      />
    </PageContainer>
  );
}
