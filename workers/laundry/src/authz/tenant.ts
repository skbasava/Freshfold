import type { InternalContext } from "../../../../packages/contracts/src/auth";

export type HubScope = {
  tenantId: string;
  hubId: string;
};

export class AuthorizationError extends Error {
  readonly code = "cross_hub_denied";

  constructor() {
    super("cross_hub_denied");
    this.name = "AuthorizationError";
  }
}

export function hasHubAccess(
  actor: InternalContext,
  scope: HubScope,
): boolean {
  return actor.tenantId === scope.tenantId && actor.hubId === scope.hubId;
}

export function assertHubAccess(
  actor: InternalContext,
  scope: HubScope,
): void {
  if (!hasHubAccess(actor, scope)) {
    throw new AuthorizationError();
  }
}

export function scopeFilter(actor: InternalContext): HubScope {
  return { tenantId: actor.tenantId, hubId: actor.hubId };
}
