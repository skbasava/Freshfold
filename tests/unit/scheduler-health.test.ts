import { describe, expect, it } from "vitest";
import type { OutboxHealthResponse } from "../../packages/contracts/src/queue-messages";
import {
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../packages/contracts/src/http";
import { createLogger } from "../../packages/shared/src/observability";
import {
  OUTBOX_PENDING_AGE_ALERT_SECONDS,
  evaluateOutboxAlerts,
  reportOutboxHealth,
} from "../../workers/scheduler/src/health";

const NOW = 1_000_000;
const SERVICE_TOKEN = "test-service-token-32-characters-long";

function health(
  overrides: Partial<OutboxHealthResponse> = {},
): OutboxHealthResponse {
  return {
    pending: 0,
    dispatching: 0,
    failed: 0,
    oldestPendingAt: null,
    oldestPendingAgeSeconds: 0,
    checkedAt: NOW,
    ...overrides,
  };
}

function captureLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: createLogger({
      service: "scheduler",
      sink: (line) => lines.push(line),
      now: () => NOW,
    }),
  };
}

describe("scheduler outbox health", () => {
  it("emits no alerts for a healthy outbox", () => {
    expect(evaluateOutboxAlerts(health())).toEqual([]);
  });

  it("alerts when pending age exceeds the threshold", () => {
    const alerts = evaluateOutboxAlerts(
      health({
        pending: 2,
        oldestPendingAt: NOW - (OUTBOX_PENDING_AGE_ALERT_SECONDS + 1) * 1000,
        oldestPendingAgeSeconds: OUTBOX_PENDING_AGE_ALERT_SECONDS + 1,
      }),
    );

    expect(alerts).toEqual([
      expect.objectContaining({
        code: "outbox_pending_age",
        severity: "warning",
        pending: 2,
        oldestPendingAgeSeconds: OUTBOX_PENDING_AGE_ALERT_SECONDS + 1,
      }),
    ]);
  });

  it("alerts when failed rows exist", () => {
    const alerts = evaluateOutboxAlerts(health({ failed: 3 }));

    expect(alerts).toEqual([
      expect.objectContaining({
        code: "outbox_failed",
        severity: "error",
        failed: 3,
      }),
    ]);
  });

  it("fetches health through the Laundry service binding and emits metrics", async () => {
    const requests: Request[] = [];
    const response = health({
      pending: 2,
      dispatching: 1,
      failed: 0,
      oldestPendingAt: NOW - 600_000,
      oldestPendingAgeSeconds: 600,
      checkedAt: NOW,
    });
    const { lines, logger } = captureLogger();

    await reportOutboxHealth(
      {
        LAUNDRY: {
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json(response);
          },
        } as Fetcher,
        SERVICE_TOKEN,
      },
      { now: NOW, logger },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      `https://laundry.internal/internal/outbox/health?now=${NOW}`,
    );
    expect(requests[0].headers.get(SERVICE_TOKEN_HEADER)).toBe(SERVICE_TOKEN);
    expect(requests[0].headers.get(SERVICE_NAME_HEADER)).toBe("scheduler");
    expect(requests[0].headers.get(SERVICE_TENANT_HEADER)).toBe("system");
    expect(requests[0].headers.get(SERVICE_HUB_HEADER)).toBe("system");

    const records = lines.map((line) => JSON.parse(line));
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "observability_metric",
          metric: "outbox_pending_count",
          value: 2,
        }),
        expect.objectContaining({
          event: "observability_metric",
          metric: "outbox_dispatching_count",
          value: 1,
        }),
        expect.objectContaining({
          event: "observability_metric",
          metric: "outbox_failed_count",
          value: 0,
        }),
        expect.objectContaining({
          event: "observability_metric",
          metric: "outbox_oldest_pending_age_seconds",
          value: 600,
        }),
        expect.objectContaining({
          event: "outbox_alert",
          code: "outbox_pending_age",
          severity: "warning",
        }),
      ]),
    );
  });

  it("rejects a missing service token before calling Laundry", async () => {
    await expect(
      reportOutboxHealth({ LAUNDRY: {} as Fetcher }, { now: NOW }),
    ).rejects.toThrow("service_token_missing");
  });
});
