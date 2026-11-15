import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  Modal,
  OrdersIcon,
  PageContainer,
  PageHeader,
  StatusBadge,
  Textarea,
  Toast,
  type DataTableColumn,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatDateKey, formatDateTime, localDateKey } from "../../lib/format";
import { isApiError } from "../../api/errors";
import { useApi } from "../../api/context";
import type {
  OrderDetail,
  OrderIntent,
  OrderItem,
} from "../../types";
import type { OrderEvent, OrderStateSnapshot, Role } from "@laundry/contracts";
import { HoldDialog } from "./HoldDialog";
import { RescheduleDialog } from "./RescheduleDialog";
import { describeSyncState } from "../shared/order-sync";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "success"; order: OrderDetail; role: Role };

const itemColumns: DataTableColumn<OrderItem>[] = [
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
  intent: OrderIntent;
  label: string;
  success: string;
}

function statusAction(status: OrderDetail["status"]): StatusAction | null {
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
  syncState: OrderDetail["syncState"],
  confirmed: string,
): string {
  return syncState === "pending"
    ? "Saved on this device. It will send when you reconnect."
    : confirmed;
}

export function OrderDetailPage({ online }: OrderDetailPageProps = {}) {
  const api = useApi();
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
  const [busyIntent, setBusyIntent] = useState<OrderIntent | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const [kvState, setKvState] = useState<OrderStateSnapshot | null>(null);
  const [loadingKv, setLoadingKv] = useState(false);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [copiedCrn, setCopiedCrn] = useState(false);
  const [editNotesOpen, setEditNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const loadKvAndEvents = (id: string) => {
    setLoadingKv(true);
    api.getOrderState(id)
      .then((res) => setKvState(res))
      .catch(() => setKvState(null))
      .finally(() => setLoadingKv(false));

    setLoadingEvents(true);
    api.getOrderEvents(id)
      .then((res) => setEvents(res.items))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  };

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    Promise.all([api.getOrder(orderId), api.getSession()])
      .then(([order, session]) => {
        if (cancelled) {
          return;
        }
        if (order) {
          setState({ status: "success", order, role: session.user.role });
          setNotesDraft(order.customer.notes ?? "");
          loadKvAndEvents(order.id);
        } else {
          setState({ status: "not-found" });
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
  }, [api, orderId, reloadToken]);

  const order = state.status === "success" ? state.order : null;
  const role = state.status === "success" ? state.role : "front_desk";

  const replaceOrder = (next: OrderDetail) => {
    setState({ status: "success", order: next, role });
    setNotesDraft(next.customer.notes ?? "");
    loadKvAndEvents(next.id);
  };

  const applyIntent = async (
    intent: OrderIntent,
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
      if (isApiError(caught)) {
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
          <Card
            title="Customer"
            description="Contact details for this order."
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNotesDraft(order.customer.notes ?? "");
                  setEditNotesOpen(true);
                }}
              >
                Edit note
              </Button>
            }
          >
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

          <Card
            title="Audit & Mutation History"
            description="Authoritative event stream and state transitions."
            actions={
              events.length > 0 ? (
                <Badge tone="neutral">
                  {events.length} event{events.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          >
            {loadingEvents ? (
              <LoadingState label="Loading audit history" variant="list" rows={2} />
            ) : events.length === 0 ? (
              <p className="text-sm text-text-muted">
                No audit events recorded for this order yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {events.map((evt) => (
                  <div
                    key={evt.id}
                    className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">
                          {evt.eventType.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-text-muted">
                          v{evt.previousVersion} &rarr; v{evt.newVersion}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted">
                        {formatDateTime(evt.at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-xs text-text-muted">
                      <span>
                        Source: {evt.source} · Actor: {evt.actorType}
                        {evt.actorId ? ` (${evt.actorId})` : ""}
                      </span>
                      <span className="font-mono text-[11px]" title={evt.mutationId}>
                        {evt.mutationId}
                      </span>
                    </div>
                    {evt.detail &&
                    typeof evt.detail === "object" &&
                    Object.keys(evt.detail).length > 0 ? (
                      <div>
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-text-muted hover:text-primary transition-colors cursor-pointer"
                          onClick={() =>
                            setExpandedEventId(
                              expandedEventId === evt.id ? null : evt.id,
                            )
                          }
                        >
                          {expandedEventId === evt.id
                            ? "Hide details"
                            : "Show details"}
                        </button>
                        {expandedEventId === evt.id && (
                          <pre className="mt-1 rounded bg-canvas p-2 text-[11px] text-text-muted overflow-x-auto font-mono">
                            {JSON.stringify(evt.detail, null, 2)}
                          </pre>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
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

          <Card
            title="Status & KV State Diagnostics"
            description="Cloudflare KV state model & diagnostic health"
            actions={
              <Button
                variant="ghost"
                size="sm"
                loading={loadingKv}
                onClick={() => loadKvAndEvents(order.id)}
              >
                Refresh
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge status={order.status} />
                <span className="text-sm text-text-muted">
                  Version {order.version}
                </span>
              </div>

              {/* Diagnostic Status Badge */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Flow Status
                </span>
                {kvState?.diagnostic?.status === "broken" ? (
                  <Badge tone="danger" dot>Flow Broken</Badge>
                ) : kvState?.diagnostic?.status === "held" || order.status === "hold" ? (
                  <Badge tone="warning" dot>On Hold</Badge>
                ) : kvState?.diagnostic?.status === "cancelled" || order.status === "cancelled" ? (
                  <Badge tone="neutral" dot>Cancelled</Badge>
                ) : (
                  <Badge tone="success" dot>Healthy Flow</Badge>
                )}
              </div>

              {/* CRN Identifier */}
              <div className="rounded-md bg-canvas p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    CRN (9b:4b:19b)
                  </span>
                  {(kvState?.crnId || order.crnId) && (
                    <button
                      type="button"
                      className="text-xs text-text-muted hover:text-primary transition-colors cursor-pointer"
                      onClick={() => {
                        const crn = kvState?.crnId ?? order.crnId ?? "";
                        navigator.clipboard?.writeText(crn);
                        setCopiedCrn(true);
                        setTimeout(() => setCopiedCrn(false), 2000);
                      }}
                    >
                      {copiedCrn ? "✓ Copied" : "Copy"}
                    </button>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs font-semibold text-primary truncate">
                  {kvState?.crnId ?? order.crnId ?? "Unallocated"}
                </p>
              </div>

              {/* State Transition Flow */}
              <div className="rounded-md bg-canvas p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  State Transition Model
                </span>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase">Previous</span>
                    <span className="font-semibold text-text">
                      {kvState?.previousState ?? order.previousState ?? "None"}
                    </span>
                  </div>
                  <span className="text-text-muted text-sm">&rarr;</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase">Current</span>
                    <span className="font-semibold text-primary">
                      {kvState?.currentState ?? order.status}
                    </span>
                  </div>
                  <div className="ml-auto text-right">
                    <span className="text-[10px] text-text-muted uppercase">Intent</span>
                    <p className="text-[11px] font-medium text-text truncate max-w-[90px]">
                      {kvState?.intent ?? "createOrder"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Failure Diagnostic Panel when state flow is broken */}
              {kvState?.diagnostic?.status === "broken" && (
                <div className="rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs flex flex-col gap-1">
                  <p className="font-semibold text-danger-strong">Flow Failure Diagnostic</p>
                  {kvState.diagnostic.brokenStep && (
                    <p className="text-text">
                      <span className="font-medium">Broken Step:</span> {kvState.diagnostic.brokenStep}
                    </p>
                  )}
                  {kvState.diagnostic.errorCode && (
                    <p className="text-text font-mono">
                      <span className="font-medium">Error Code:</span> {kvState.diagnostic.errorCode}
                    </p>
                  )}
                  {kvState.diagnostic.errorMessage && (
                    <p className="text-text">{kvState.diagnostic.errorMessage}</p>
                  )}
                  {kvState.diagnostic.reason && (
                    <p className="text-text">
                      <span className="font-medium">Failure Reason:</span> {kvState.diagnostic.reason}
                    </p>
                  )}
                </div>
              )}

              {/* Diagnostic Metadata */}
              <div className="text-[11px] text-text-muted flex flex-col gap-0.5 pt-1 border-t border-border">
                {kvState?.changedAt ? (
                  <p>State sync: {formatDateTime(kvState.changedAt)}</p>
                ) : null}
                {kvState?.diagnostic?.lastMutationId ? (
                  <p className="truncate font-mono text-[10px]">
                    Mutation: {kvState.diagnostic.lastMutationId}
                  </p>
                ) : null}
              </div>
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

      <Modal
        open={editNotesOpen}
        onClose={() => setEditNotesOpen(false)}
        title="Edit customer notes"
        description={`Update instructions or preferences for ${order.customer.name}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setEditNotesOpen(false)}
              disabled={savingNotes}
            >
              Cancel
            </Button>
            <Button
              loading={savingNotes}
              onClick={async () => {
                setSavingNotes(true);
                setActionError(null);
                try {
                  const updated = await api.updateOrder(order.id, {
                    customerNotes: notesDraft.trim(),
                  });
                  replaceOrder(updated);
                  setSuccessMessage("Customer notes updated.");
                  setEditNotesOpen(false);
                } catch {
                  setActionError(
                    "Failed to update customer notes. Please try again.",
                  );
                } finally {
                  setSavingNotes(false);
                }
              }}
            >
              Save notes
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
