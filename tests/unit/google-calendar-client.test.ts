import { describe, expect, it, vi } from "vitest";
import {
  GoogleCalendarClient,
  GoogleCalendarError,
  errorStatus,
} from "../../packages/calendar-client/src/client";

const calendarId = "team@example.com";

function makeClient(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    return handler(request);
  });

  const client = new GoogleCalendarClient({
    calendarId,
    getAccessToken: async () => "access-token",
    fetch,
  });

  return { client, requests };
}

describe("GoogleCalendarClient", () => {
  it("inserts a minimal event with the access token", async () => {
    const { client, requests } = makeClient(() =>
      Response.json({
        id: "ord1042",
        etag: "etag-1",
        status: "confirmed",
      }),
    );

    const result = await client.insert({
      id: "ord1042",
      summary: "Deliver 5 PM · ORD-1042",
      description: "Wash and iron · 2 items",
      start: {
        dateTime: "2026-11-11T11:30:00.000Z",
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: "2026-11-11T12:30:00.000Z",
        timeZone: "Asia/Kolkata",
      },
      extendedProperties: {
        private: { orderId: "order-1", projectedVersion: "3" },
      },
    });

    expect(result).toMatchObject({ id: "ord1042", etag: "etag-1" });
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer access-token",
    );
    expect(await requests[0]?.json()).toMatchObject({
      id: "ord1042",
      summary: "Deliver 5 PM · ORD-1042",
      extendedProperties: {
        private: { orderId: "order-1", projectedVersion: "3" },
      },
    });
  });

  it("lists incremental pages with a sync token and deleted events", async () => {
    const { client, requests } = makeClient(() =>
      Response.json({
        items: [{ id: "ord1042", etag: "etag-2", status: "cancelled" }],
        nextPageToken: "page-2",
        nextSyncToken: "sync-2",
      }),
    );

    const page = await client.list({
      syncToken: "sync-1",
      pageToken: "page-1",
      showDeleted: true,
      maxResults: 250,
    });

    expect(page).toMatchObject({
      nextPageToken: "page-2",
      nextSyncToken: "sync-2",
    });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe(
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    expect(url.searchParams.get("syncToken")).toBe("sync-1");
    expect(url.searchParams.get("pageToken")).toBe("page-1");
    expect(url.searchParams.get("showDeleted")).toBe("true");
    expect(url.searchParams.get("maxResults")).toBe("250");
  });

  it("returns null for a missing event and throws for other failures", async () => {
    const missing = makeClient(() => new Response("missing", { status: 404 }));
    await expect(missing.client.get("missing")).resolves.toBeNull();

    const failing = makeClient(() =>
      Response.json(
        { error: { code: 500, message: "backend error" } },
        { status: 500 },
      ),
    );
    const error = await failing.client.get("ord1042").catch((caught) => caught);
    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(errorStatus(error)).toBe(500);
  });

  it("sends If-Match and exposes precondition failures", async () => {
    const { client, requests } = makeClient(() =>
      new Response("precondition failed", { status: 412 }),
    );

    const error = await client
      .patch("ord1042", { summary: "canonical" }, { etag: "etag-4" })
      .catch((caught) => caught);

    expect(errorStatus(error)).toBe(412);
    expect(requests[0]?.headers.get("if-match")).toBe("etag-4");
  });

  it("supports conditional delete and surfaces invalid sync-token responses", async () => {
    const deleted = makeClient(() => new Response(null, { status: 204 }));
    await deleted.client.delete("ord1042", { etag: "etag-5" });
    expect(deleted.requests[0]?.method).toBe("DELETE");
    expect(deleted.requests[0]?.headers.get("if-match")).toBe("etag-5");

    const expired = makeClient(() => new Response("gone", { status: 410 }));
    const error = await expired.client
      .list({ syncToken: "expired" })
      .catch((caught) => caught);
    expect(errorStatus(error)).toBe(410);
  });

  it("treats 429 as retryable", async () => {
    const { client } = makeClient(() =>
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "7" },
      }),
    );

    const error = await client.insert({ id: "ord1042" } as never).catch(
      (caught) => caught,
    );
    expect(errorStatus(error)).toBe(429);
    expect(error).toBeInstanceOf(GoogleCalendarError);
  });
});
