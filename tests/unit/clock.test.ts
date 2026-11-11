import { describe, expect, it } from "vitest";
import { createFixedClock, createSteppingClock } from "../helpers/clock";

describe("clock helpers", () => {
  it("keeps a fixed clock at the same instant", () => {
    const clock = createFixedClock("2026-11-11T04:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-11-11T04:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-11T04:00:00.000Z");
  });

  it("advances a stepping clock by the configured interval", () => {
    const clock = createSteppingClock("2026-11-11T04:00:00.000Z", 60_000);

    expect(clock.now().toISOString()).toBe("2026-11-11T04:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-11T04:01:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-11T04:02:00.000Z");
  });
});
