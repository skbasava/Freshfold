import { describe, expect, it } from "vitest";
import { formatTerminalLog } from "./terminal-logger";

describe("formatTerminalLog", () => {
  it("formats log message with category, event, and details", () => {
    const formatted = formatTerminalLog({
      category: "API",
      severity: "info",
      event: "<- GET /api/orders 200",
      time: "12:00:00",
      details: {
        durationMs: 14,
        status: 200,
      },
    });

    expect(formatted).toContain("12:00:00");
    expect(formatted).toContain("[FreshFold:API]");
    expect(formatted).toContain("<- GET /api/orders 200");
    expect(formatted).toContain("durationMs=14");
    expect(formatted).toContain("status=200");
  });

  it("handles empty details cleanly", () => {
    const formatted = formatTerminalLog({
      category: "Workflow",
      severity: "warn",
      event: "mutation_conflict",
      time: "12:00:01",
    });

    expect(formatted).toContain("12:00:01");
    expect(formatted).toContain("[FreshFold:Workflow]");
    expect(formatted).toContain("mutation_conflict");
    expect(formatted).not.toContain("()");
  });
});

