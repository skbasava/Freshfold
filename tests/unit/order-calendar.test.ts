import { describe, expect, it } from "vitest";
import { GoogleCalendarAdapter } from "../../workers/api/src/infrastructure/calendar/google-calendar.adapter";
import type { CalendarEventPayload } from "../../workers/api/src/domain/ports/calendar.port";

describe("GoogleCalendarAdapter & Shipping Event Projection", () => {
  it("creates a simulated calendar event when credentials are not configured", async () => {
    const adapter = new GoogleCalendarAdapter({});

    const payload: CalendarEventPayload = {
      orderId: 42,
      orderNumber: "ORD-20261119-TEST01",
      customerName: "Kiran Verma",
      customerPhone: "+919876543210",
      deliveryAddress: "#12, 4th Main, Indiranagar, Bengaluru, KA 560038",
      promisedDeliveryAt: "2026-11-21T10:00:00.000Z",
      serviceSummary: "Wash & Fold (2 kg), Dry Clean (1 Suit)",
      totalAmountPaise: 45000,
      specialInstructions: "Handle silk with care",
    };

    const res = await adapter.createShippingEvent(payload);

    expect(res.success).toBe(true);
    expect(res.summary).toContain("ORD-20261119-TEST01");
    expect(res.summary).toContain("Kiran Verma");
    expect(res.startIso).toBe("2026-11-21T10:00:00.000Z");
    expect(res.htmlLink).toContain("ORD-20261119-TEST01");
  });
});
