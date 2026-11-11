const CALENDAR_EMBED_BASE = "https://calendar.google.com/calendar/embed";
const INDIA_TIME_ZONE = "Asia/Kolkata";
const DEFAULT_GOOGLE_CALENDAR_ID =
  "09a863ccefb782f37206f51916f173b6f7eb50da0da2db4fee503865eb1a3415@group.calendar.google.com";

export type CalendarEmbedSource = "embed-url" | "calendar-id" | "none";

export interface CalendarEmbedConfig {
  embedUrl: string | null;
  calendarId: string | null;
  source: CalendarEmbedSource;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmbeddableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildCalendarEmbedUrl(calendarId: string): string {
  const params = new URLSearchParams({
    src: calendarId,
    ctz: INDIA_TIME_ZONE,
    mode: "WEEK",
    showTitle: "0",
    showPrint: "0",
    showTabs: "0",
    showCalendars: "0",
  });
  return `${CALENDAR_EMBED_BASE}?${params.toString()}`;
}

export function readCalendarConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): CalendarEmbedConfig {
  const directUrl = readString(env.VITE_GOOGLE_CALENDAR_EMBED_URL);
  if (directUrl && isEmbeddableUrl(directUrl)) {
    return {
      embedUrl: directUrl,
      calendarId: null,
      source: "embed-url",
    };
  }

  const calendarId =
    readString(env.VITE_GOOGLE_CALENDAR_ID) ||
    (import.meta.env.PROD ? DEFAULT_GOOGLE_CALENDAR_ID : "");
  if (calendarId) {
    return {
      embedUrl: buildCalendarEmbedUrl(calendarId),
      calendarId,
      source: "calendar-id",
    };
  }

  return { embedUrl: null, calendarId: null, source: "none" };
}
