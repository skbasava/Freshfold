import { Badge, BellIcon, Button } from "@freshfold/ui";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppApi } from "../../api/types";
import type { AttentionItem } from "../../mocks/types";

export interface NotificationsMenuProps {
  api: AppApi;
  online: boolean;
  pathname: string;
}

export function NotificationsMenu({
  api,
  online,
  pathname,
}: NotificationsMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.getAttentionItems().catch(() => [] as AttentionItem[]),
      api.getPendingCount().catch(() => 0),
    ]).then(([attentionItems, pending]) => {
      if (!cancelled) {
        setItems(attentionItems);
        setPendingCount(pending);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api, online, pathname, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const alertCount = items.length + (pendingCount > 0 ? 1 : 0);
  const hasDanger = items.some((item) => item.tone === "danger");
  const showDot = !online || alertCount > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={
          alertCount > 0
            ? `Notifications (${alertCount} updates)`
            : "Notifications"
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-border/80 bg-surface text-text-muted shadow-card transition-colors hover:border-accent/40 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {showDot ? (
          <span
            aria-hidden="true"
            className={`absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-surface ${
              hasDanger
                ? "bg-danger"
                : !online || alertCount > 0
                  ? "bg-warning"
                  : "bg-accent"
            }`}
          />
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] origin-top-right rounded-lg border border-border bg-surface shadow-raised"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">Notifications</p>
            <Badge tone={alertCount > 0 ? "warning" : "neutral"}>
              {alertCount > 0 ? `${alertCount} active` : "All caught up"}
            </Badge>
          </div>

          <div className="divide-y divide-border">
            <div className="flex items-center justify-between gap-2 bg-canvas/60 px-4 py-2.5 text-xs">
              <span className="font-medium text-text">
                {online ? "Connected to FreshFold" : "Working offline"}
              </span>
              {pendingCount > 0 ? (
                <span className="font-medium text-warning-strong">
                  {pendingCount} waiting to send
                </span>
              ) : (
                <span className="text-text-muted">Queue clear</span>
              )}
            </div>

            {items.length > 0 ? (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {items.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate(item.href);
                      }}
                      className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-text">
                          {item.orderId} · {item.customerName}
                        </span>
                        <Badge tone={item.tone}>{item.actionLabel}</Badge>
                      </span>
                      <span className="text-xs leading-5 text-text-muted">
                        {item.reason}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-5 text-center">
                <p className="text-sm font-medium text-text">
                  Nothing needs review
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Order conflicts and sync warnings will show up here.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border bg-canvas/50 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                navigate("/");
              }}
            >
              View today&apos;s dashboard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

