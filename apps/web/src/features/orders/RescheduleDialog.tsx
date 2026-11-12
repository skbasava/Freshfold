import {
  Alert,
  Button,
  CalendarIcon,
  EmptyState,
  LoadingState,
  Modal,
  Select,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { formatDateKey } from "../../lib/format";
import { isMockApiError } from "../../mocks/errors";
import type { AppApi } from "../../api/types";
import type {
  MockDeliverySlot,
  MockOrderDetail,
  MockOrderSummary,
} from "../../mocks/types";

export interface RescheduleDialogProps {
  open: boolean;
  api: AppApi;
  order: Pick<MockOrderSummary, "id" | "customerName" | "version"> | null;
  online?: boolean;
  onClose: () => void;
  onMoved: (order: MockOrderDetail) => void;
}

function slotLabel(slot: MockDeliverySlot): string {
  const date = formatDateKey(slot.localDate);
  if (slot.status === "full") {
    return `${date} · ${slot.label} (Full)`;
  }
  if (slot.status === "closed") {
    return `${date} · ${slot.label} (Closed)`;
  }
  if (slot.status === "past") {
    return `${date} · ${slot.label} (Past)`;
  }
  return `${date} · ${slot.label}`;
}

export function RescheduleDialog({
  open,
  api,
  order,
  online,
  onClose,
  onMoved,
}: RescheduleDialogProps) {
  const [slots, setSlots] = useState<MockDeliverySlot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const deliveryTimesUnavailable =
    api.capabilities.deliverySlots === "unavailable";

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setSlotId("");
    setError(null);
    setFieldError(undefined);
    setLoading(true);
    setLoadError(false);

    api
      .getCreateOrderOptions()
      .then((options) => {
        if (!cancelled) {
          setSlots(options.slots);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, open]);

  if (!order) {
    return null;
  }

  const submit = async () => {
    if (!slotId) {
      setFieldError("Choose a new delivery time.");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSaving(true);
    try {
      const updated = await api.applyOrderIntent(
        order.id,
        "reschedule",
        { deliverySlotId: slotId },
        order.version,
        { online },
      );
      onMoved(updated);
      onClose();
    } catch (caught) {
      if (isMockApiError(caught)) {
        setError(caught.message);
      } else {
        setError("We could not move this delivery. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move delivery"
      description={`Choose a new delivery time for ${order.customerName}.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Keep current time
          </Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={loading || deliveryTimesUnavailable}
          >
            Move delivery
          </Button>
        </div>
      }
    >
      {loading ? <LoadingState label="Loading delivery times" rows={2} /> : null}

      {loadError ? (
        <Alert tone="danger" title="We could not load delivery times">
          Close this window and try again.
        </Alert>
      ) : null}

      {error ? (
        <Alert
          tone="danger"
          title="We could not move this delivery"
          className="mb-4"
        >
          {error}
        </Alert>
      ) : null}

      {deliveryTimesUnavailable ? (
        <Alert
          tone="warning"
          title="Delivery times are not available yet."
          className="mb-4"
        >
          The server does not provide delivery slots yet, so this order cannot
          be moved. Ask a manager when this is available.
        </Alert>
      ) : null}

      {!loading && !loadError && !deliveryTimesUnavailable ? (
        slots.length === 0 ? (
          <EmptyState
            compact
            icon={<CalendarIcon className="h-5 w-5" />}
            title="No delivery times available"
            description="There are no open delivery slots to move this order to."
          />
        ) : (
          <Select
            label="New delivery time"
            placeholder="Choose a new time"
            value={slotId}
            onChange={(event) => setSlotId(event.target.value)}
            options={slots.map((slot) => ({
              value: slot.id,
              label: slotLabel(slot),
              disabled: slot.status !== "open",
            }))}
            error={fieldError}
          />
        )
      ) : null}
    </Modal>
  );
}
