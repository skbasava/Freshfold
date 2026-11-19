export interface ActiveSessionContext {
  accessToken: string | null;
  tenantId: string | null;
  hubId: string | null;
  rcVersion: string | null;
}

let state: ActiveSessionContext = {
  accessToken: null,
  tenantId: null,
  hubId: null,
  rcVersion: null,
};

export function getActiveSessionContext(): Readonly<ActiveSessionContext> {
  return state;
}

export function setActiveSessionContext(
  next: Partial<ActiveSessionContext>,
): void {
  state = {
    ...state,
    ...next,
  };
}

export function setActiveRcVersion(rcVersion: string | null): void {
  if (rcVersion && rcVersion.trim().length > 0) {
    state = { ...state, rcVersion: rcVersion.trim() };
  }
}

export function clearActiveSessionContext(): void {
  state = {
    accessToken: null,
    tenantId: null,
    hubId: null,
    rcVersion: null,
  };
}
