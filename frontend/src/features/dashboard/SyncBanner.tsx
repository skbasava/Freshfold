import { Alert, Button } from "@freshfold/ui";

export interface SyncBannerProps {
  online: boolean;
  pendingCount: number;
  conflictCount: number;
  onReview: () => void;
}

export function SyncBanner({
  online,
  pendingCount,
  conflictCount,
  onReview,
}: SyncBannerProps) {
  if (online && pendingCount === 0 && conflictCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {!online ? (
        <Alert tone="warning" title="You are offline.">
          New changes will be saved on this device and sent when you reconnect.
        </Alert>
      ) : null}

      {conflictCount > 0 ? (
        <Alert
          tone="danger"
          title="Some changes need your review."
          action={
            <Button variant="secondary" size="sm" onClick={onReview}>
              Review changes
            </Button>
          }
        >
          A change was made on another device while this order was waiting.
        </Alert>
      ) : null}

      {pendingCount > 0 ? (
        <Alert tone="info" title="Changes are waiting to send.">
          {pendingCount} change{pendingCount === 1 ? "" : "s"}{" "}
          {pendingCount === 1 ? "is" : "are"} waiting to send.
        </Alert>
      ) : null}
    </div>
  );
}
