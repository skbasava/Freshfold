import { describe, expect, it, vi } from "vitest";
import { createDashboardService } from "./dashboard.service";

describe("DashboardService.fetchSnapshot", () => {
  it("fetches orders and delivery slots from /api/v1/deliveries/slots successfully", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/orders")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: 1,
                  orderNumber: "ORD-001",
                  customerName: "Anand",
                  primaryService: "Wash & Fold",
                  status: "confirmed",
                  deliverySlotId: "slot-2026-11-19-1400",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/deliveries/slots") || url.includes("/deliveries/slots")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                { id: "slot-2026-11-19-0900", label: "09:00 – 11:00", capacity: 10, booked: 0 },
                { id: "slot-2026-11-19-1400", label: "14:00 – 16:00", capacity: 10, booked: 1 },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const service = createDashboardService(mockFetch as unknown as typeof fetch);
    const result = await service.fetchSnapshot({ dateKey: "2026-11-19" });

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].crnId).toBe("ORD-001");
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].id).toBe("slot-2026-11-19-0900");
    // slot-1400 has 1 booked order
    expect(result.slots[1].booked).toBe(1);
  });
});
