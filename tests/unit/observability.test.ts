import { describe, expect, it } from "vitest";
import {
  METRICS,
  OBSERVABILITY_EVENTS,
  createLogger,
  redactValue,
  safeError,
} from "../../packages/shared/src/observability";

const NOW = Date.parse("2026-11-11T04:00:00.000Z");

function capture() {
  const lines: string[] = [];
  return {
    lines,
    sink: (line: string): void => {
      lines.push(line);
    },
  };
}

function records(lines: string[]): Array<Record<string, unknown>> {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("structured observability helper", () => {
  it("emits severity, stable event name, service, correlation IDs and timestamp", () => {
    const output = capture();
    const logger = createLogger({
      service: "laundry",
      environment: "test",
      requestId: "req-1",
      correlationId: "corr-1",
      sink: output.sink,
      now: () => NOW,
    });

    logger.warn(OBSERVABILITY_EVENTS.mutationConflict, {
      orderId: "order-1",
      code: "VERSION_CONFLICT",
    });

    expect(records(output.lines)).toEqual([
      {
        level: "warn",
        event: "mutation_conflict",
        timestamp: "2026-11-11T04:00:00.000Z",
        service: "laundry",
        environment: "test",
        requestId: "req-1",
        correlationId: "corr-1",
        orderId: "order-1",
        code: "VERSION_CONFLICT",
      },
    ]);
  });

  it("falls back to the request ID when no correlation ID is supplied", () => {
    const output = capture();
    const logger = createLogger({
      service: "calendar",
      requestId: "req-2",
      sink: output.sink,
      now: () => NOW,
    });

    logger.info("calendar_event", { reason: "safe" });

    expect(records(output.lines)[0]).toMatchObject({
      requestId: "req-2",
      correlationId: "req-2",
    });
  });

  it("redacts secret keys recursively", () => {
    const redacted = redactValue({
      token: "plain-token-value",
      nested: {
        password: "correct-horse",
        apiKey: "api-key-value",
        privateKey: "secret-private-key-material",
      },
      headers: {
        authorization: "Bearer abc123",
        "x-service-token": "service-token-value",
      },
      keyId: "v1",
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("plain-token-value");
    expect(serialized).not.toContain("correct-horse");
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("secret-private-key-material");
    expect(serialized).not.toContain("Bearer abc123");
    expect(serialized).not.toContain("service-token-value");
    expect(redacted).toMatchObject({
      token: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        apiKey: "[REDACTED]",
        privateKey: "[REDACTED]",
      },
    });
  });

  it("redacts phone numbers, emails and message content values", () => {
    const redacted = redactValue({
      customerPhone: "+919000000001",
      contact: "Call me on +91 90000 00001",
      email: "customer@example.com",
      messageBody: "Your order is ready",
      note: "phone +919000000002",
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("9000000001");
    expect(serialized).not.toContain("9000000002");
    expect(serialized).not.toContain("customer@example.com");
    expect(serialized).not.toContain("Your order is ready");
    expect(redacted).toMatchObject({
      customerPhone: "[REDACTED_PHONE]",
      messageBody: "[REDACTED_CONTENT]",
      note: "[REDACTED_CONTENT]",
    });
  });

  it("redacts token-shaped strings without redacting ordinary identifiers", () => {
    const redacted = redactValue({
      reason: "order-1 refused for mutation-1234567890",
      bearer: "prefix Bearer abc.def.ghi suffix",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature",
      apiKey: "AIzaSyA1234567890abcdefghijklmnopqrstu",
      googleToken: "ya29.a0AfH6SMBexample",
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("Bearer abc.def.ghi");
    expect(serialized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(serialized).not.toContain("AIzaSyA1234567890");
    expect(serialized).not.toContain("ya29.a0AfH6SMBexample");
    expect(redacted).toMatchObject({
      reason: "order-1 refused for mutation-1234567890",
    });
  });

  it("does not leak error messages through safeError", () => {
    const error = Object.assign(
      new Error("provider rejected phone +919000000001 with token abc123"),
      { code: "provider_rejected" },
    );

    const safe = safeError(error);
    expect(safe).toEqual({ name: "Error", code: "provider_rejected" });
    expect(JSON.stringify(safe)).not.toContain("9000000001");
    expect(JSON.stringify(safe)).not.toContain("abc123");
  });

  it("emits metrics with stable names and values", () => {
    const output = capture();
    const logger = createLogger({
      service: "scheduler",
      sink: output.sink,
      now: () => NOW,
    });

    logger.metric(METRICS.outboxPending, 4, { destination: "calendar" });

    expect(records(output.lines)).toEqual([
      {
        level: "info",
        event: OBSERVABILITY_EVENTS.metric,
        timestamp: "2026-11-11T04:00:00.000Z",
        service: "scheduler",
        metric: "outbox_pending_count",
        value: 4,
        destination: "calendar",
      },
    ]);
  });

  it("serializes circular structures without throwing", () => {
    const value: Record<string, unknown> = { orderId: "order-1" };
    value.self = value;

    expect(() => JSON.stringify(redactValue(value))).not.toThrow();
  });
});
