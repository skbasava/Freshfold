import {
  Alert,
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { localDateKey, shiftDateKey } from "../../lib/format";
import { useMockApi } from "../../mocks/context";
import type {
  DeliverySchedule,
  MockDeliverySlot,
  MockOrderSummary,
} from "../../mocks/types";
import type { Role } from "@laundry/contracts";
import { RescheduleDialog } from "../orders/RescheduleDialog";

type ScheduleState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; schedule: DeliverySchedule }
  | { status: "error" };

function slotStatusLabel(slot: MockDeliverySlot): string {
  switch (slot.status) {
    case "open":
      return "Open";
    case "full":
      return "Full";
    case "closed":
      return "Closed";
    case "past":
      return "Past";
  }
}

function slotDescription(slot: MockDeliverySlot): string {
  switch (slot.status) {
    case "open":
      return `${slot.available} of ${slot.capacity} places free`;
    case "full":
      return "Full — no places left";
    case "closed":
      return `Closed — ${slot.closedReason ?? "Not available"}`;
    case "past":
      return "This time has passed";
  }
}

function slotTone(slot: MockDeliverySlot) {
  if (slot.status === "open") {
    return "success" as const;
  }
  if (slot.status === "full") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export function DeliveriesPage() {
  const api = useMockApi();
  const [date, setDate] = useState("");
  const [role, setRole] = useState<Role>("front_desk");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ScheduleState>({ status: "idle" });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<
    Pick<MockOrderSummary, "id" | "customerName" | "version"> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSession()
      .then((session) => {
        if (!cancelled) {
          setRole(session.user.role);
          setDate((current) => current || localDateKey(session.today));
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
  }, [api]);

  useEffect(() => {
    if (!date) {
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    api
      .getDeliverySchedule(date)
      .then((schedule) => {
        if (!cancelled) {
          setState({ status: "success", schedule });
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
  }, [api, date, reloadToken]);

  const schedule = state.status === "success" ? state.schedule : null;
  const manager = role === "manager";

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Delivery"
        title="Deliveries"
        description="See the day's delivery times and move orders when needed."
      />

      {successMessage ? (
        <Alert tone="success" title={successMessage} />
      ) : null}

      {api.capabilities.deliverySlots === "unavailable" ? (
        <Alert tone="info" title="Delivery times are not available yet.">
          Orders still load for each day, but the server does not provide slot
          availability yet.
        </Alert>
      ) : null}

      {api.capabilities.deliverySlots === "demo-fallback" ? (
        <Alert tone="warning" title="Delivery times use demo data.">
          The slot endpoint is not available, so this schedule uses sample
          times for local testing only.
        </Alert>
      ) : null}

      <Card title="Choose a day" description="Plan and check one day at a time.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Button
            variant="secondary"
            onClick={() => {
              setSuccessMessage(null);
              setDate((current) => shiftDateKey(current, -1));
            }}
            disabled={!date}
          >
            Previous day
          </Button>
          <DatePicker
            label="Delivery date"
            value={date}
            onChange={(event) => {
              setSuccessMessage(null);
              setDate(event.target.value);
            }}
            containerClassName="flex-1"
          />
          <Button
            variant="secondary"
            onClick={() => {
              setSuccessMessage(null);
              setDate((current) => shiftDateKey(current, 1));
            }}
            disabled={!date}
          >
            Next day
          </Button>
        </div>
      </Card>

      {state.status === "loading" || state.status === "idle" ? (
        <LoadingState label="Loading delivery schedule" rows={3} />
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load the delivery schedule"
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
      ) : null}

      {schedule ? (
        <>
          <Card
            title={schedule.dateLabel}
            description={`${schedule.booked} of ${schedule.capacity} places booked · ${schedule.available} free`}
          >
            <p className="text-sm text-text-muted">
              {schedule.orders.length} order
              {schedule.orders.length === 1 ? "" : "s"} scheduled for this day.
            </p>
          </Card>

          {schedule.slots.length === 0 ? (
            <EmptyState
              title="No delivery times"
              description="Choose another date or ask a manager to open a time."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {schedule.slots.map((slot) => {
                const orders = schedule.orders.filter(
                  (order) => order.deliverySlotId === slot.id,
                );
                return (
                  <li key={slot.id}>
                    <Card
                      title={slot.label}
                      description={slotDescription(slot)}
                      actions={
                        <Badge tone={slotTone(slot)} dot>
                          {slotStatusLabel(slot)}
                        </Badge>
                      }
                    >
                      <div
                        role="progressbar"
                        aria-label={`${slot.label} booked`}
                        aria-valuemin={0}
                        aria-valuemax={slot.capacity}
                        aria-valuenow={slot.booked}
                        className="mb-4 h-2 overflow-hidden rounded-full bg-canvas"
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.round(
                              (slot.booked / slot.capacity) * 100,
                            )}%`,
                          }}
                        />
                      </div>

                      {orders.length === 0 ? (
                        <p className="text-sm text-text-muted">
                          No orders in this time.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {orders.map((order) => (
                            <li
                              key={order.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                            >
                              <div className="min-w-0">
                                <Link
                                  to={`/orders/${order.id}`}
                                  className="font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                >
                                  {order.customerName}
                                </Link>
                                <p className="mt-1 text-xs text-text-muted">
                                  {order.id} · {order.totalItems} item
                                  {order.totalItems === 1 ? "" : "s"}
                                </p>
                              </div>
                              {manager &&
                              order.status !== "delivered" &&
                              order.status !== "cancelled" ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setSelectedOrder(order)}
                                >
                                  Move order for {order.customerName}
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}

      <RescheduleDialog
        open={selectedOrder !== null}
        api={api}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onMoved={() => {
          setSuccessMessage("Delivery time updated.");
          setReloadToken((token) => token + 1);
        }}
      />
    </PageContainer>
  );
}
