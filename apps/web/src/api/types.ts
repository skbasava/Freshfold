import type { LoginRequest } from "@laundry/contracts";
import type { MockApi, MockSession } from "../mocks/types";

export type ApiMode = "mock" | "live";

export type CapabilityState =
  | "available"
  | "unavailable"
  | "demo-fallback"
  | "order-scan-fallback"
  | "fallback";

export interface ApiCapabilities {
  mode: ApiMode;
  roleSwitch: boolean;
  deliverySlots: CapabilityState;
  customerWrite: CapabilityState;
  customerOrderHistory: CapabilityState;
  services: CapabilityState;
  liveReads: boolean;
}

export interface AppApi extends MockApi {
  readonly mode: ApiMode;
  readonly capabilities: ApiCapabilities;
  login(input: LoginRequest): Promise<MockSession>;
  logout(): Promise<void>;
  syncPendingMutations(): Promise<void>;
  getPendingCount(): Promise<number>;
  /**
   * Selects the employee/tenant/hub-scoped local cache. Implementations must
   * keep pending mutations for each account and expose only the active scope.
   */
  setAccountScope?(accountKey: string | null): Promise<void>;
}

export interface ApiConfig {
  mode: ApiMode;
  baseUrl: string;
  timeoutMs: number;
  demoFallbacks: boolean;
  requireAuth: boolean;
}
