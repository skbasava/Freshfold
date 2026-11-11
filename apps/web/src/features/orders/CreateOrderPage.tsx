import {
  Alert,
  Button,
  Card,
  Input,
  LoadingState,
  PageContainer,
  PageHeader,
  PlusIcon,
  Select,
} from "@freshfold/ui";
import { normalizePhone } from "@laundry/contracts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatDateKey } from "../../lib/format";
import { isMockApiError } from "../../mocks/errors";
import { useMockApi } from "../../mocks/context";
import type {
  CreateOrderOptions,
  MockDeliverySlot,
} from "../../mocks/types";

interface DraftItem {
  description: string;
  quantity: number;
}

type OptionsState =
  | { status: "loading" }
  | { status: "success"; options: CreateOrderOptions }
  | { status: "error" };

function slotOptionLabel(slot: MockDeliverySlot): string {
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

export interface CreateOrderPageProps {
  online?: boolean;
}

export function CreateOrderPage({ online }: CreateOrderPageProps) {
  const api = useMockApi();
  const navigate = useNavigate();
  const detectedOnline = useOnlineStatus();
  const isOnline = online ?? detectedOnline;
  const [state, setState] = useState<OptionsState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [deliverySlotId, setDeliverySlotId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { description: "", quantity: 1 },
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    api
      .getCreateOrderOptions()
      .then((options) => {
        if (!cancelled) {
          setState({ status: "success", options });
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

  const options = state.status === "success" ? state.options : null;
  const normalizedPhone = normalizePhone(customerPhone);
  const deliveryTimesUnavailable =
    api.capabilities.deliverySlots === "unavailable";

  const updateItem = (index: number, changes: Partial<DraftItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    );
  };

  const submit = async () => {
    setGeneralError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const name = customerName.trim();
      const phone = normalizePhone(customerPhone);
      const errors: Record<string, string> = {};
      if (!name) {
        errors.customerName = "Enter the customer's name.";
      }
      if (!phone) {
        errors.customerPhone = "Enter a valid phone number.";
      }
      if (!serviceType.trim()) {
        errors.serviceType = "Choose a service.";
      }
      if (!deliverySlotId) {
        errors.deliverySlotId = "Choose a delivery time.";
      }
      if (!items.some((item) => item.description.trim().length > 0)) {
        errors.items = "Add at least one item.";
      }
      if (!name || !phone || Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      const order = await api.createOrder(
        {
          customerName: name,
          customerPhone: phone,
          serviceType,
          deliverySlotId,
          items,
        },
        { online: isOnline },
      );
      navigate(`/orders/${order.id}`, {
        state: {
          customerCreated: order.customerCreated === true,
          customerName: order.customer.name,
        },
      });
    } catch (caught) {
      if (isMockApiError(caught)) {
        if (caught.fieldErrors) {
          setFieldErrors(caught.fieldErrors);
        } else if (caught.code === "SLOT_FULL") {
          setFieldErrors({ deliverySlotId: "That delivery time is full." });
        } else if (caught.code === "SLOT_CLOSED") {
          setFieldErrors({
            deliverySlotId: "That delivery time is closed.",
          });
        } else if (caught.code === "SLOT_PAST") {
          setFieldErrors({
            deliverySlotId: "That delivery time has passed.",
          });
        } else {
          setGeneralError(caught.message);
        }
      } else {
        setGeneralError("We could not create the order. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Orders"
        title="New order"
        description="Add the customer name and phone, choose a service and book a delivery time."
        actions={
          <Button
            variant="secondary"
            onClick={() => navigate("/orders")}
          >
            Back to orders
          </Button>
        }
      />

      {state.status === "loading" ? (
        <LoadingState label="Loading order form" rows={3} />
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load the order form"
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

      {options ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="flex flex-col gap-6">
            <Card
              title="Customer and service"
              description="Who is this order for?"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Customer name"
                  placeholder="For example: Asha Verma"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  error={fieldErrors.customerName}
                  required
                />
                <Input
                  label="Phone number"
                  type="tel"
                  inputMode="tel"
                  placeholder="For example: 98765 43210"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  onBlur={() => {
                    if (normalizedPhone) {
                      setCustomerPhone(normalizedPhone);
                    }
                  }}
                  error={fieldErrors.customerPhone}
                  required
                />
              </div>
              {normalizedPhone ? (
                <p className="mt-2 text-xs text-text-muted">
                  Saved as {normalizedPhone}
                </p>
              ) : null}
              <div className="mt-4">
                <Select
                  label="Service"
                  placeholder="Choose a service"
                  options={options.services.map((service) => ({
                    value: service,
                    label: service,
                  }))}
                  value={serviceType}
                  onChange={(event) => setServiceType(event.target.value)}
                  error={fieldErrors.serviceType}
                  required
                />
              </div>
            </Card>

            <Card
              title="Delivery time"
              description="Full and closed times cannot be chosen."
            >
              <Select
                label="Delivery time"
                placeholder="Choose a delivery time"
                options={options.slots.map((slot) => ({
                  value: slot.id,
                  label: slotOptionLabel(slot),
                  disabled: slot.status !== "open",
                }))}
                value={deliverySlotId}
                onChange={(event) => setDeliverySlotId(event.target.value)}
                error={fieldErrors.deliverySlotId}
                required
              />
            </Card>

            <Card
              title="Items"
              description="Add each item and how many there are."
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<PlusIcon className="h-4 w-4" />}
                  onClick={() =>
                    setItems((current) => [
                      ...current,
                      { description: "", quantity: 1 },
                    ])
                  }
                >
                  Add another item
                </Button>
              }
            >
              <div className="flex flex-col gap-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end"
                  >
                    <Input
                      label={`Item ${index + 1} description`}
                      placeholder="For example: Shirt"
                      value={item.description}
                      onChange={(event) =>
                        updateItem(index, {
                          description: event.target.value,
                        })
                      }
                    />
                    <Input
                      label={`Item ${index + 1} quantity`}
                      type="number"
                      min={1}
                      max={100}
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, {
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                    {items.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setItems((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        Remove item {index + 1}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              {fieldErrors.items ? (
                <p className="mt-3 text-sm font-medium text-danger-strong">
                  {fieldErrors.items}
                </p>
              ) : null}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            {generalError ? (
              <Alert tone="danger" title="We could not create the order">
                {generalError}
              </Alert>
            ) : null}

            {deliveryTimesUnavailable ? (
              <Alert
                tone="warning"
                title="Delivery times are not available yet."
              >
                The server does not provide delivery slots yet, so new orders
                cannot be given a time. Ask a manager when this is available.
              </Alert>
            ) : null}

            {!deliveryTimesUnavailable &&
            api.capabilities.deliverySlots === "demo-fallback" ? (
              <Alert tone="info" title="Delivery times use demo data.">
                The server does not provide delivery slots yet. These times are
                sample data for local testing only.
              </Alert>
            ) : null}

            {!isOnline ? (
              <Alert tone="warning" title="You are offline.">
                This order will be saved on this device and sent when you
                reconnect.
              </Alert>
            ) : null}

            <Card
              title="Ready to save?"
              description="You can change the order after it is created."
            >
              <Button
                fullWidth
                loading={saving}
                onClick={submit}
                disabled={deliveryTimesUnavailable}
              >
                Create order
              </Button>
            </Card>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
