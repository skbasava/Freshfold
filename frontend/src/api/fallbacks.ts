/*
 * Isolated fallback data for endpoints the Gateway/Laundry API does not expose
 * yet: delivery-slot listing and the service catalogue. Nothing in this module
 * is used by the mock adapter or by live reads. It is opt-in through
 * VITE_ENABLE_DEMO_FALLBACKS and the UI marks it as demo data.
 *
 * Customer create/update and customer order history are not implemented as
 * backend behaviour here. Customer history is composed from the existing
 * hub-scoped order list endpoint; customer writes remain unavailable.
 */
import { createMockApi } from "../mocks/api";
import { MOCK_SERVICES } from "../mocks/data";
import type { MockApi } from "../mocks/types";

export const FALLBACK_SERVICES: string[] = [...MOCK_SERVICES];

let fallbackApi: MockApi | null = null;

export function getDemoFallbackApi(): MockApi {
  fallbackApi ??= createMockApi({ latencyMs: 0, syncIssues: false });
  return fallbackApi;
}
