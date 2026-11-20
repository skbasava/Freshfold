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

type ContextChangeListener = (ctx: Readonly<ActiveSessionContext>) => void;
const listeners = new Set<ContextChangeListener>();

export function onSessionContextChange(
  listener: ContextChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      // Ignore listener error
    }
  });
}

export function setActiveHubId(hubId: string): void {
  setActiveSessionContext({ hubId });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("freshfold:hub-changed", { detail: { hubId } }),
    );
  }
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
