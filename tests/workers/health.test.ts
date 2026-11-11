import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import auth from "../../workers/auth/src/index";
import calendar from "../../workers/calendar/src/index";
import gateway from "../../workers/gateway/src/index";
import laundry from "../../workers/laundry/src/index";
import notifications from "../../workers/notifications/src/index";
import scheduler from "../../workers/scheduler/src/index";

const workers = [
  { service: "gateway", app: gateway },
  { service: "auth", app: auth },
  { service: "laundry", app: laundry },
  { service: "calendar", app: calendar },
  { service: "notifications", app: notifications },
  { service: "scheduler", app: scheduler },
];

describe("worker health endpoints", () => {
  for (const worker of workers) {
    it(`${worker.service} reports healthy`, async () => {
      const request = new Request(`https://${worker.service}.test/health`);
      const ctx = createExecutionContext();
      const response = await worker.app.fetch(request, {} as never, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ok",
        service: worker.service,
      });
    });
  }
});
