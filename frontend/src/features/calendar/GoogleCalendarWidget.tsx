import { Alert, LoadingState } from "@freshfold/ui";
import { useEffect, useState } from "react";
import {
  readCalendarConfig,
  type CalendarEmbedConfig,
} from "./calendar-config";

export interface GoogleCalendarWidgetProps {
  config?: CalendarEmbedConfig;
  title?: string;
}

export function GoogleCalendarWidget({
  config,
  title = "Google Calendar",
}: GoogleCalendarWidgetProps) {
  const resolved = config ?? readCalendarConfig();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [resolved.embedUrl]);

  if (!resolved.embedUrl) {
    return (
      <Alert tone="info" title="Google Calendar is not set up">
        Ask a manager to add <code>VITE_GOOGLE_CALENDAR_ID</code> or{" "}
        <code>VITE_GOOGLE_CALENDAR_EMBED_URL</code> to the web app environment,
        then reload this page.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-surface md:aspect-video">
        {!loaded ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-surface p-4">
            <LoadingState label="Loading calendar" rows={2} />
          </div>
        ) : null}
        <iframe
          src={resolved.embedUrl}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      <p className="text-xs leading-5 text-text-muted">
        View only. Change delivery times from Deliveries or an order.
      </p>
    </div>
  );
}
