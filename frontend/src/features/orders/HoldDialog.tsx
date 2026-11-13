import { Alert, Button, Modal, Textarea } from "@freshfold/ui";
import { useEffect, useState } from "react";
import { isMockApiError } from "../../mocks/errors";
import type { MockApi, MockOrderDetail, MockOrderSummary } from "../../mocks/types";

export interface HoldDialogProps {
  open: boolean;
  api: MockApi;
  order: Pick<MockOrderSummary, "id" | "version" | "customerName"> | null;
  online?: boolean;
  onClose: () => void;
  onHeld: (order: MockOrderDetail) => void;
}

export function HoldDialog({
  open,
  api,
  order,
  online,
  onClose,
  onHeld,
}: HoldDialogProps) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setComment("");
      setError(undefined);
      setGeneralError(null);
      setSaving(false);
    }
  }, [open]);

  if (!order) {
    return null;
  }

  const submit = async () => {
    if (!comment.trim()) {
      setError("Add a short reason for the hold.");
      return;
    }

    setError(undefined);
    setGeneralError(null);
    setSaving(true);
    try {
      const updated = await api.applyOrderIntent(
        order.id,
        "placeOnHold",
        { comments: comment.trim() },
        order.version,
        { online },
      );
      onHeld(updated);
      onClose();
    } catch (caught) {
      if (isMockApiError(caught)) {
        if (caught.code === "HOLD_COMMENT_REQUIRED") {
          setError(caught.message);
        } else {
          setGeneralError(caught.message);
        }
      } else {
        setGeneralError("We could not put this order on hold. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Put order on hold"
      description={`Tell the team why ${order.customerName}'s order is paused.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Put order on hold
          </Button>
        </div>
      }
    >
      {generalError ? (
        <Alert
          tone="danger"
          title="We could not put this order on hold"
          className="mb-4"
        >
          {generalError}
        </Alert>
      ) : null}

      <Textarea
        label="Reason for hold"
        hint="The customer will not see this note."
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        error={error}
        required
      />
    </Modal>
  );
}
