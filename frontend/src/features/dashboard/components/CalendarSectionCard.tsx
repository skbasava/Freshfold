import { Badge, Button, CalendarIcon, Card } from "@freshfold/ui";
import { GoogleCalendarWidget } from "../../calendar/GoogleCalendarWidget";

export interface CalendarSectionCardProps {
  title?: string;
  description?: string;
  onOpenFullCalendar?: () => void;
}

export function CalendarSectionCard({
  title = "Google Calendar",
  description = "Shared hub delivery schedule.",
  onOpenFullCalendar,
}: CalendarSectionCardProps) {
  return (
    <Card
      title={title}
      description={description}
      actions={<Badge tone="neutral">View only</Badge>}
      footer={
        onOpenFullCalendar ? (
          <div className="flex items-center justify-between gap-2">
            <span>Front desk access is view only.</span>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<CalendarIcon className="h-3.5 w-3.5" />}
              onClick={onOpenFullCalendar}
            >
              Full view
            </Button>
          </div>
        ) : undefined
      }
    >
      <GoogleCalendarWidget />
    </Card>
  );
}
