export type FeatureFlags = {
  tenant_enabled: boolean;
  hub_enabled: boolean;
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  tenant_enabled: false,
  hub_enabled: false,
};

export function getFeatureFlags(env?: Record<string, unknown>): FeatureFlags {
  const tenantRaw =
    env?.TENANT_ENABLED ??
    env?.tenant_enabled ??
    (typeof process !== "undefined"
      ? process.env?.TENANT_ENABLED ?? process.env?.VITE_TENANT_ENABLED
      : undefined);

  const hubRaw =
    env?.HUB_ENABLED ??
    env?.hub_enabled ??
    (typeof process !== "undefined"
      ? process.env?.HUB_ENABLED ?? process.env?.VITE_HUB_ENABLED
      : undefined);

  const tenant_enabled = tenantRaw === "true" || tenantRaw === true;
  const hub_enabled = hubRaw === "true" || hubRaw === true;

  return {
    tenant_enabled,
    hub_enabled,
  };
}

export function isTenantEnabled(env?: Record<string, unknown>): boolean {
  return getFeatureFlags(env).tenant_enabled;
}

export function isHubEnabled(env?: Record<string, unknown>): boolean {
  return getFeatureFlags(env).hub_enabled;
}

