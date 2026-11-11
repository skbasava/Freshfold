import { describe, expect, it } from "vitest";
import { validateSlotTiming } from "../../workers/laundry/src/domain/business-time";

const NOW = Date.parse("2026-11-11T03:00:00.000Z");

function slot(start: string, end: string) {
  return {
    starts_at: Date.parse(start),
    ends_at: Date.parse(end),
  };
}

describe("Asia/Kolkata business hours", () => {
  it("accepts a slot fully inside 09:00-20:00 IST", () => {
    expect(
      validateSlotTiming(
        slot("2026-11-11T03:30:00.000Z", "2026-11-11T04:30:00.000Z"),
        NOW,
      ),
    ).toBeNull();
    expect(
      validateSlotTiming(
        slot("2026-11-11T13:30:00.000Z", "2026-11-11T14:30:00.000Z"),
        NOW,
      ),
    ).toBeNull();
  });

  it("rejects a slot starting before 09:00 IST", () => {
    expect(
      validateSlotTiming(
        slot("2026-11-11T03:29:59.000Z", "2026-11-11T04:30:00.000Z"),
        NOW,
      ),
    ).toBe("outside_business_hours");
  });

  it("rejects a slot ending after 20:00 IST", () => {
    expect(
      validateSlotTiming(
        slot("2026-11-11T13:30:00.000Z", "2026-11-11T14:30:01.000Z"),
        NOW,
      ),
    ).toBe("outside_business_hours");
  });

  it("rejects a slot crossing the local date boundary", () => {
    expect(
      validateSlotTiming(
        slot("2026-11-11T17:30:00.000Z", "2026-11-11T19:30:00.000Z"),
        NOW,
      ),
    ).toBe("outside_business_hours");
  });

  it("rejects past slots and invalid ranges", () => {
    expect(
      validateSlotTiming(
        slot("2026-11-11T02:30:00.000Z", "2026-11-11T03:30:00.000Z"),
        NOW,
      ),
    ).toBe("past");
    expect(
      validateSlotTiming(
        slot("2026-11-11T04:30:00.000Z", "2026-11-11T04:30:00.000Z"),
        NOW,
      ),
    ).toBe("invalid_range");
  });
});
