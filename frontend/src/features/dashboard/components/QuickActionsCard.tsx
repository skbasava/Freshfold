import {
  ArrowRightIcon,
  CalendarIcon,
  Card,
  PlusIcon,
  SearchIcon,
} from "@freshfold/ui";

export interface QuickActionsCardProps {
  onNewOrder: () => void;
  onScheduleDelivery: () => void;
  onFindCustomer: () => void;
}

export function QuickActionsCard({
  onNewOrder,
  onScheduleDelivery,
  onFindCustomer,
}: QuickActionsCardProps) {
  return (
    <Card
      title="Quick actions"
      description="Jump straight into everyday desk tasks."
    >
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          aria-label="New order"
          onClick={onNewOrder}
          className="group flex w-full items-center gap-3 rounded-md bg-primary px-3.5 py-3 text-left text-surface shadow-card transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface/15 text-surface"
          >
            <PlusIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">New order</span>
            <span className="block truncate text-xs text-surface/80">
              Take a walk-in or phone order
            </span>
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          type="button"
          aria-label="Schedule delivery"
          onClick={onScheduleDelivery}
          className="group flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-canvas/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent-strong"
          >
            <CalendarIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">
              Schedule delivery
            </span>
            <span className="block truncate text-xs text-text-muted">
              Assign or move a hub delivery slot
            </span>
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-strong" />
        </button>

        <button
          type="button"
          aria-label="Find customer"
          onClick={onFindCustomer}
          className="group flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-canvas/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent-strong"
          >
            <SearchIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">
              Find customer
            </span>
            <span className="block truncate text-xs text-text-muted">
              Search directory and order history
            </span>
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-strong" />
        </button>
      </div>
    </Card>
  );
}
