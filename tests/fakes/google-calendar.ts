export interface FakeCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  etag: string;
  status: "confirmed" | "cancelled";
  colorId?: string;
  recurrence?: string[];
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export type NewFakeCalendarEvent = Omit<FakeCalendarEvent, "etag" | "status">;

export type FakeListPage = {
  items: FakeCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

export class FakeGoogleCalendarError extends Error {
  constructor(readonly status: number) {
    super(
      status === 409
        ? "409 conflict"
        : status === 404
          ? "404 not found"
          : status === 412
            ? "412 precondition failed"
            : `calendar error ${status}`,
    );
    this.name = "FakeGoogleCalendarError";
  }
}

export class FakeGoogleCalendar {
  private readonly events = new Map<string, FakeCalendarEvent>();
  private readonly tombstones = new Map<string, FakeCalendarEvent>();
  private etagCounter = 0;
  failNextPatchWith412 = false;

  async insert(event: NewFakeCalendarEvent): Promise<FakeCalendarEvent> {
    if (this.events.has(event.id)) {
      throw new FakeGoogleCalendarError(409);
    }

    this.tombstones.delete(event.id);
    const stored: FakeCalendarEvent = {
      ...event,
      etag: this.nextEtag(),
      status: "confirmed",
    };
    this.events.set(event.id, stored);
    return structuredClone(stored);
  }

  async get(id: string): Promise<FakeCalendarEvent | undefined> {
    const event = this.events.get(id);
    return event === undefined ? undefined : structuredClone(event);
  }

  async list(): Promise<FakeCalendarEvent[]> {
    return [...this.events.values()].map((event) => structuredClone(event));
  }

  async listPage(
    options: {
      syncToken?: string;
      pageToken?: string;
      showDeleted?: boolean;
      maxResults?: number;
    } = {},
  ): Promise<FakeListPage> {
    const candidates = options.showDeleted
      ? [...this.events.values(), ...this.tombstones.values()]
      : [...this.events.values()];

    const changed = options.syncToken
      ? candidates.filter((event) => this.etagNumber(event) > this.syncNumber(options.syncToken!))
      : candidates;

    const sorted = changed.sort((left, right) => left.id.localeCompare(right.id));
    const offset = options.pageToken ? Number(options.pageToken) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new FakeGoogleCalendarError(400);
    }

    const maxResults = Math.max(1, options.maxResults ?? 2500);
    const items = sorted
      .slice(offset, offset + maxResults)
      .map((event) => structuredClone(event));
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < sorted.length;

    return {
      items,
      ...(hasMore ? { nextPageToken: String(nextOffset) } : {}),
      ...(hasMore ? {} : { nextSyncToken: this.currentSyncToken() }),
    };
  }

  currentSyncToken(): string {
    return `sync-${this.etagCounter}`;
  }

  async patch(
    id: string,
    patch: Partial<Omit<FakeCalendarEvent, "id" | "etag">>,
    options: { etag?: string } = {},
  ): Promise<FakeCalendarEvent> {
    const event = this.events.get(id);
    if (event === undefined) {
      throw new FakeGoogleCalendarError(404);
    }

    if (options.etag !== undefined && event.etag !== options.etag) {
      throw new FakeGoogleCalendarError(412);
    }

    if (this.failNextPatchWith412) {
      this.failNextPatchWith412 = false;
      throw new FakeGoogleCalendarError(412);
    }

    const updated: FakeCalendarEvent = {
      ...event,
      ...patch,
      id: event.id,
      etag: this.nextEtag(),
    };
    this.events.set(id, updated);
    return structuredClone(updated);
  }

  async delete(id: string, options: { etag?: string } = {}): Promise<void> {
    const event = this.events.get(id);
    if (event === undefined) {
      throw new FakeGoogleCalendarError(404);
    }

    if (options.etag !== undefined && event.etag !== options.etag) {
      throw new FakeGoogleCalendarError(412);
    }

    this.events.delete(id);
    this.tombstones.set(id, {
      ...event,
      etag: this.nextEtag(),
      status: "cancelled",
    });
  }

  private nextEtag(): string {
    this.etagCounter += 1;
    return `etag-${this.etagCounter}`;
  }

  private etagNumber(event: FakeCalendarEvent): number {
    const match = event.etag.match(/etag-(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  private syncNumber(syncToken: string): number {
    const match = syncToken.match(/sync-(\d+)/);
    if (!match) {
      throw new FakeGoogleCalendarError(410);
    }
    return Number(match[1]);
  }
}
