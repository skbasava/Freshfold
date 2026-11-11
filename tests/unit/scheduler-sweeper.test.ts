import { describe, expect, it } from "vitest";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { verifyInternalContext } from "../../packages/shared/src/internal-context";
import { sweepOutbox } from "../../workers/scheduler/src/sweeper";

const SECRET = "test-internal-context-secret-32-bytes";

function fakeLaundry(response: Response = Response.json({
  claimed: 1,
  sent: 1,
  failed: 0,
})) {
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response;
    },
  };
}

describe("scheduler sweeper", () => {
  it("signs a system context and calls the Laundry sweep endpoint", async () => {
    const laundry = fakeLaundry();

    const result = await sweepOutbox(
      {
        LAUNDRY: laundry as unknown as Fetcher,
        INTERNAL_CONTEXT_SECRET: SECRET,
        INTERNAL_CONTEXT_KEY_ID: "v1",
      },
      { now: 1_000, limit: 25 },
    );

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(laundry.requests).toHaveLength(1);

    const request = laundry.requests[0];
    expect(request.url).toBe(
      "https://laundry.internal/internal/outbox/sweep",
    );
    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ now: 1_000, limit: 25 });

    const verified = await verifyInternalContext({
      encoded: request.headers.get(INTERNAL_CONTEXT_HEADER),
      signature: request.headers.get(INTERNAL_SIGNATURE_HEADER),
      keyId: request.headers.get(INTERNAL_KEY_ID_HEADER),
      secret: SECRET,
      now: 1_000,
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }

    expect(verified.context).toMatchObject({
      actorId: "system:scheduler",
      actorType: "system",
      role: "service",
      tenantId: "system",
      hubId: "system",
    });
    expect(verified.context.exp).toBeGreaterThan(1_000);
  });

  it("throws when Laundry rejects the sweep", async () => {
    const laundry = fakeLaundry(
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    await expect(
      sweepOutbox(
        {
          LAUNDRY: laundry as unknown as Fetcher,
          INTERNAL_CONTEXT_SECRET: SECRET,
        },
        { now: 1_000 },
      ),
    ).rejects.toThrow("outbox_sweep_failed");
  });
});
