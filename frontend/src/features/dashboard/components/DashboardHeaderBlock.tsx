import { Link } from "react-router-dom";
import { CalendarDays, Plus, Search, TabletSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTodayLabel, getTimeGreeting } from "@/lib/date";

export interface DashboardHeaderBlockProps {
  userName: string;
  hubName?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function DashboardHeaderBlock({
  userName,
  searchQuery,
  onSearchChange,
}: DashboardHeaderBlockProps) {
  const greeting = getTimeGreeting();
  const todayLabel = formatTodayLabel();

  return (
    <header className="ff-dash-header">
      <div className="ff-dash-header-top">
        <div className="ff-dash-title-group">
          <div className="ff-dash-greeting-row">
            <h1 className="ff-dash-heading">
              <span className="ff-dash-greeting-prefix">{greeting},</span>{" "}
              <span className="ff-dash-username">{userName}</span>
            </h1>
          </div>
          <div className="ff-dash-date-chip">
            <CalendarDays aria-hidden="true" className="ff-dash-date-icon" />
            <span>{todayLabel}</span>
          </div>
        </div>

        <div className="ff-dash-actions">
          <Button
            size="default"
            className="ff-dash-btn-primary ff-touch-target"
            nativeButton={false}
            render={<Link to="/orders/new" />}
          >
            <Plus aria-hidden="true" className="ff-dash-btn-icon" />
            <span>New Order</span>
          </Button>

          <Button
            variant="outline"
            size="default"
            className="ff-dash-btn-secondary ff-touch-target"
            nativeButton={false}
            render={<Link to="/pos" />}
          >
            <TabletSmartphone aria-hidden="true" className="ff-dash-btn-icon" />
            <span>POS</span>
          </Button>
        </div>
      </div>

      {/* Inline search shown on iPhone & narrow viewports where TopNavbar search is hidden */}
      <div className="ff-dash-mobile-search">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search order ID, customer, or service..."
          aria-label="Search hub orders"
          className="ff-touch-target h-10 pl-9"
        />
      </div>
    </header>
  );
}
