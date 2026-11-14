import {
  createLogger,
  readLogLevelFromEnv,
  type Logger,
} from "../../../packages/shared/src/observability";
import type { LaundryBindings } from "./authz";

export type LaundryLayer = "router" | "handler" | "service" | "repository";

export function getLaundryLogger(
  env: LaundryBindings,
  requestId?: string,
  layer?: LaundryLayer,
): Logger {
  const baseLogger = createLogger({
    service: "laundry",
    ...(env.ENVIRONMENT ? { environment: env.ENVIRONMENT } : {}),
    ...(requestId ? { requestId } : {}),
    ...readLogLevelFromEnv(env),
  });

  if (!layer) {
    return baseLogger;
  }

  return {
    log: (severity, event, fields) =>
      baseLogger.log(severity, event, { layer, ...fields }),
    debug: (event, fields) => baseLogger.debug(event, { layer, ...fields }),
    info: (event, fields) => baseLogger.info(event, { layer, ...fields }),
    warn: (event, fields) => baseLogger.warn(event, { layer, ...fields }),
    error: (event, fields) => baseLogger.error(event, { layer, ...fields }),
    metric: (name, value, fields) =>
      baseLogger.metric(name, value, { layer, ...fields }),
    child: (overrides) => baseLogger.child(overrides),
  };
}
