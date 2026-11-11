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
  StatusBadge,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import {
  formatDateKey,
  formatDeliveryTime,
  localDateKey,
  shiftDateKey,
} from "../../lib/format";
import { listOrdersForDate } from "../../lib/orders-for-date";
import { useMockApi } from "../../mocks/context";
import type { MockOrderSummary } from "../../mocks/types";
import { GoogleCalendarWidget } from "./GoogleCalendarWidget";

type CalendarState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; dateKey: string; orders: MockOrderSummary[] }
  | { status: "error" };

export function CalendarPage() {
  const api = useMockApi();
  const online = useOnlineStatus();
  const [date, setDate] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<CalendarState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    api
      .getSession()
      .then((session) => {
        if (!cancelled) {
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
  }, [api, reloadToken]);

  useEffect(() => {
    if (!date) {
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    listOrdersForDate(api, date)
      .then((orders) => {
        if (!cancelled) {
          setState({ status: "success", dateKey: date, orders });
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

  const orders = state.status === "success" ? state.orders : [];
  const dateLabel = state.status === "success" ? formatDateKey(state.dateKey) : "";
  const pendingCount = orders.filter(
    (order) => order.syncState !== "synced",
  ).length;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="See the day's orders and the shared Google Calendar in one place."
      />

      <Card
        title="Choose a day"
        description="The order list shows deliveries due on this date."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Button
            variant="secondary"
            onClick={() => setDate((current) => shiftDateKey(current, -1))}
            disabled={!date}
          >
            Previous day
          </Button>
          <DatePicker
            label="Calendar date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            containerClassName="flex-1"
          />
          <Button
            variant="secondary"
            onClick={() => setDate((current) => shiftDateKey(current, 1))}
            disabled={!date}
          >
            Next day
          </Button>
        </div>
      </Card>

      <Card
        title="Google Calendar"
        description="The hub's shared schedule. Front desk access is view only."
      >
        <GoogleCalendarWidget />
      </Card>

      {!online ? (
        <Alert tone="warning" title="You are offline.">
          Orders already saved on this device are shown. Changes saved offline
          stay pending until the connection returns.
        </Alert>
      ) : null}

      {pendingCount > 0 ? (
        <Alert tone="warning" title="Some orders still need to send.">
          {pendingCount} order{pendingCount === 1 ? "" : "s"} on this date
          {pendingCount === 1 ? " is" : " are"} waiting to sync. Keep this device
          online to finish sending them.
        </Alert>
      ) : null}

      {state.status === "loading" || state.status === "idle" ? (
        <LoadingState label="Loading calendar orders" rows={3} />
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load calendar orders"
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
          Check your connection and try again. Changes saved on this device are
          safe.
        </Alert>
      ) : null}

      {state.status === "success" ? (
        <Card
          title={dateLabel}
          description={`${orders.length} order${
            orders.length === 1 ? "" : "s"
          } due on this day, earliest first.`}
          actions={<Badge tone="primary">{orders.length}</Badge>}
        >
          {orders.length === 0 ? (
            <EmptyState
              title="No orders on this date"
              description="Choose another date or add a new order for this day."
            />
          ) : (
            <ul
              aria-label={`Orders on ${dateLabel}`}
              className="flex flex-col gap-3"
            >
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        {order.customerName}
                      </Link>
                      <span className="text-xs text-text-muted">
                        {order.id}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {order.serviceType} · {order.totalItems} item
                      {order.totalItems === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="whitespace-nowrap text-sm font-semibold text-text">
                      {order.deliveryAt
                        ? formatDeliveryTime(order.deliveryAt)
                        : "Not set"}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusBadge status={order.status} />
                      {order.syncState !== "synced" ? (
                        <StatusBadge status={order.syncState} />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </PageContainer>
  );
}
