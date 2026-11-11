import type { FetchLike } from "./auth";

export type CalendarEventDateTime =
  | {
      dateTime: string;
      timeZone?: string;
    }
  | {
      date: string;
      timeZone?: string;
    };

export type GoogleCalendarEvent = {
  id?: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  colorId?: string | null;
  start?: CalendarEventDateTime;
  end?: CalendarEventDateTime;
  recurrence?: string[];
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

export type NewGoogleCalendarEvent = GoogleCalendarEvent & {
  id: string;
  start: CalendarEventDateTime;
  end: CalendarEventDateTime;
};

export type CalendarListParameters = {
  syncToken?: string;
  pageToken?: string;
  showDeleted?: boolean;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
  singleEvents?: boolean;
};

export type CalendarListPage = {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

export type ConditionalWriteOptions = {
  etag?: string | null;
};

export class GoogleCalendarError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null = null,
  ) {
    super(status === 412 ? "calendar_precondition_failed" : "calendar_request_failed");
    this.name = "GoogleCalendarError";
  }
}

export function errorStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return 0;
}

export type GoogleCalendarClientOptions = {
  calendarId: string;
  getAccessToken: () => Promise<string> | string;
  fetch?: FetchLike;
  baseUrl?: string;
};

export class GoogleCalendarClient {
  private readonly calendarId: string;
  private readonly getAccessToken: () => Promise<string> | string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(options: GoogleCalendarClientOptions) {
    this.calendarId = options.calendarId;
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = options.baseUrl ?? "https://www.googleapis.com/calendar/v3";
  }

  async insert(event: NewGoogleCalendarEvent): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>("POST", this.eventsUrl(), {
      body: JSON.stringify(event),
    });
  }

  async get(eventId: string): Promise<GoogleCalendarEvent | null> {
    const response = await this.send("GET", this.eventUrl(eventId));
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
    return (await response.json()) as GoogleCalendarEvent;
  }

  async list(
    parameters: CalendarListParameters = {},
  ): Promise<CalendarListPage> {
    const url = new URL(this.eventsUrl());
    const entries: Array<[string, string]> = [];
    for (const [key, value] of Object.entries(parameters)) {
      if (value === undefined || value === null) {
        continue;
      }
      entries.push([key, String(value)]);
    }
    for (const [key, value] of entries) {
      url.searchParams.set(key, value);
    }

    const response = await this.send("GET", url.toString());
    if (!response.ok) {
      throw await this.toError(response);
    }

    const payload = (await response.json()) as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    return {
      items: payload.items ?? [],
      ...(payload.nextPageToken
        ? { nextPageToken: payload.nextPageToken }
        : {}),
      ...(payload.nextSyncToken
        ? { nextSyncToken: payload.nextSyncToken }
        : {}),
    };
  }

  async patch(
    eventId: string,
    patch: Partial<GoogleCalendarEvent>,
    options: ConditionalWriteOptions = {},
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>("PATCH", this.eventUrl(eventId), {
      body: JSON.stringify(patch),
      etag: options.etag,
    });
  }

  async delete(
    eventId: string,
    options: ConditionalWriteOptions = {},
  ): Promise<void> {
    const response = await this.send(
      "DELETE",
      this.eventUrl(eventId),
      options.etag,
    );
    if (!response.ok) {
      throw await this.toError(response);
    }
  }

  private eventsUrl(): string {
    return `${this.baseUrl}/calendars/${encodeURIComponent(
      this.calendarId,
    )}/events`;
  }

  private eventUrl(eventId: string): string {
    return `${this.eventsUrl()}/${encodeURIComponent(eventId)}`;
  }

  private async request<T>(
    method: string,
    url: string,
    options: { body?: string; etag?: string | null } = {},
  ): Promise<T> {
    const response = await this.send(method, url, options.etag, options.body);
    if (!response.ok) {
      throw await this.toError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async send(
    method: string,
    url: string,
    etag?: string | null,
    body?: string,
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers({
      authorization: `Bearer ${token}`,
    });

    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (etag) {
      headers.set("if-match", etag);
    }

    return this.fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
  }

  private async toError(response: Response): Promise<GoogleCalendarError> {
    let reason: string | null = null;
    try {
      const payload = (await response.json()) as {
        error?: {
          errors?: Array<{ reason?: unknown }>;
          status?: unknown;
        };
      };
      const candidate = payload.error?.errors?.[0]?.reason;
      if (typeof candidate === "string") {
        reason = candidate;
      } else if (typeof payload.error?.status === "string") {
        reason = payload.error.status;
      }
    } catch {
      reason = null;
    }

    return new GoogleCalendarError(response.status, reason);
  }
}
