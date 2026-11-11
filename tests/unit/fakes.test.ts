import { describe, expect, it } from "vitest";
import { FakeGoogleCalendar } from "../fakes/google-calendar";
import { FakeNotificationProvider } from "../fakes/notification-provider";

describe("FakeGoogleCalendar", () => {
  it("stores events with deterministic etags and supports patching", async () => {
    const calendar = new FakeGoogleCalendar();

    const inserted = await calendar.insert({
      id: "ord1042",
      summary: "Deliver ORD-1042",
      start: "2026-11-11T11:30:00.000Z",
      end: "2026-11-11T12:30:00.000Z",
    });

    expect(inserted.etag).toBe("etag-1");
    expect(await calendar.list()).toEqual([inserted]);

    const patched = await calendar.patch("ord1042", {
      start: "2026-11-11T12:30:00.000Z",
    });

    expect(patched.etag).toBe("etag-2");
    expect(patched.start).toBe("2026-11-11T12:30:00.000Z");
    expect(await calendar.get("ord1042")).toEqual(patched);
  });

  it("removes deleted events from the list", async () => {
    const calendar = new FakeGoogleCalendar();
    await calendar.insert({
      id: "ord1043",
      summary: "Deliver ORD-1043",
      start: "2026-11-11T11:30:00.000Z",
      end: "2026-11-11T12:30:00.000Z",
    });

    await calendar.delete("ord1043");

    expect(await calendar.get("ord1043")).toBeUndefined();
    expect(await calendar.list()).toEqual([]);
  });
});

describe("FakeNotificationProvider", () => {
  it("records sent messages", async () => {
    const provider = new FakeNotificationProvider();

    const result = await provider.send({
      to: "+910000000000",
      channel: "whatsapp",
      body: "Order ready",
    });

    expect(result).toEqual({ id: "msg-1" });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.body).toBe("Order ready");
  });

  it("can fail the next send without recording it", async () => {
    const provider = new FakeNotificationProvider();
    provider.failNext = true;

    await expect(
      provider.send({
        to: "+910000000000",
        channel: "sms",
        body: "Order delayed",
      }),
    ).rejects.toThrow("provider unavailable");

    expect(provider.sent).toEqual([]);
  });
});
