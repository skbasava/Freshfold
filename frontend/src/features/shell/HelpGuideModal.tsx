import { Button, Modal } from "@freshfold/ui";

export interface HelpGuideModalProps {
  open: boolean;
  onClose: () => void;
  hubName: string;
}

export function HelpGuideModal({
  open,
  onClose,
  hubName,
}: HelpGuideModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="FreshFold quick guide"
      description={`Helpful reminders for staff working at ${hubName}.`}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-canvas/70 p-3.5">
          <p className="font-semibold text-text">Offline changes stay safe</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Orders created or updated without internet are saved on this device
            and sent automatically when you reconnect.
          </p>
        </div>

        <div className="rounded-md border border-border bg-canvas/70 p-3.5">
          <p className="font-semibold text-text">Delivery slots &amp; calendar</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Delivery time slots fill up automatically based on hub capacity.
            Front desk staff can view the calendar; managers reschedule delivery
            times from order details or the calendar.
          </p>
        </div>

        <div className="rounded-md border border-border bg-canvas/70 p-3.5">
          <p className="font-semibold text-text">Need hub or access changes?</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Ask your hub manager if your role or assigned hub needs to be
            updated.
          </p>
        </div>
      </div>
    </Modal>
  );
}

