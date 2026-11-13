export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface FrontendLogConfig {
  enabled: boolean;
  level: LogLevel;
  terminalLogs?: boolean;
}

export function readFrontendLogConfig(
  env: Record<string, string | boolean | undefined> = (
    import.meta as unknown as {
      env?: Record<string, string | boolean | undefined>;
    }
  ).env ?? {},
): FrontendLogConfig {
  const isTest = env.MODE === "test";
  const rawEnabled = env.VITE_ENABLE_LOGS;

  let enabled: boolean;
  if (rawEnabled !== undefined && rawEnabled !== null) {
    const lower = String(rawEnabled).toLowerCase().trim();
    enabled = lower === "true" || lower === "1";
  } else {
    // Default to disabled in test, enabled in dev/prod
    enabled = !isTest;
  }

  const rawTerminal = env.VITE_ENABLE_TERMINAL_LOGS;
  const terminalLogs =
    rawTerminal !== undefined && rawTerminal !== null
      ? String(rawTerminal).toLowerCase().trim() === "true" || rawTerminal === "1"
      : enabled && Boolean(env.DEV);

  if (!enabled) {
    return { enabled: false, level: "silent", terminalLogs: false };
  }

  const rawLevel = String(env.VITE_LOG_LEVEL ?? "").toLowerCase().trim();
  if (
    rawLevel === "debug" ||
    rawLevel === "info" ||
    rawLevel === "warn" ||
    rawLevel === "error" ||
    rawLevel === "silent"
  ) {
    return {
      enabled: rawLevel !== "silent",
      level: rawLevel as LogLevel,
      terminalLogs: rawLevel !== "silent" && terminalLogs,
    };
  }

  return {
    enabled: true,
    level: env.DEV ? "debug" : "info",
    terminalLogs,
  };
}

const SENSITIVE_KEY =
  /(secret|token|password|passwd|api[-_]?key|private[-_]?key|authorization|cookie|credential|csrf|session|bearer)/i;
const PHONE_KEY = /phone/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (SENSITIVE_KEY.test(key)) {
    return "[REDACTED]";
  }
  if (PHONE_KEY.test(key) && typeof value === "string") {
    return value.length > 4 ? `***${value.slice(-4)}` : "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }
  if (typeof value === "object" && value !== null) {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      res[k] = sanitizeValue(k, v);
    }
    return res;
  }
  return value;
}

export function sendToTerminal(data: {
  category: string;
  severity: "debug" | "info" | "warn" | "error";
  event: string;
  details?: Record<string, unknown>;
  time: string;
}): void {
  const g = globalThis as unknown as {
    window?: unknown;
    fetch?: (url: string, init?: unknown) => Promise<unknown>;
  };
  if (!g.window) {
    return;
  }

  // 1. WebSocket via Vite HMR client
  const hot = (
    import.meta as unknown as {
      hot?: { send: (event: string, payload: unknown) => void };
    }
  ).hot;

  if (hot && typeof hot.send === "function") {
    try {
      hot.send("freshfold:log", data);
      return;
    } catch {
      // Fall through to fetch
    }
  }

  // 2. Fallback to HTTP endpoint on Vite dev server
  if (typeof g.fetch === "function") {
    g.fetch("/__freshfold_terminal_log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {
      // Silently ignore if server is not reachable
    });
  }
}

export type TerminalSender = (data: {
  category: string;
  severity: "debug" | "info" | "warn" | "error";
  event: string;
  details?: Record<string, unknown>;
  time: string;
}) => void;

export interface FrontendLogger {
  debug(event: string, details?: Record<string, unknown>): void;
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
}

export function createFrontendLogger(
  category: string,
  configGetter: () => FrontendLogConfig = readFrontendLogConfig,
  terminalSender: TerminalSender = sendToTerminal,
): FrontendLogger {
  const prefix = `[FreshFold:${category}]`;

  const logAt = (
    severity: "debug" | "info" | "warn" | "error",
    event: string,
    details?: Record<string, unknown>,
  ) => {
    const config = configGetter();
    if (!config.enabled || config.level === "silent") {
      return;
    }

    const currentWeight = LOG_WEIGHTS[severity];
    const thresholdWeight = LOG_WEIGHTS[config.level];
    if (currentWeight < thresholdWeight) {
      return;
    }

    const time = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const sanitized = details ? (sanitizeValue("", details) as Record<string, unknown>) : undefined;
    const header = `${prefix} ${event} (${time})`;

    switch (severity) {
      case "debug":
        if (sanitized && Object.keys(sanitized).length > 0) {
          console.debug(header, sanitized);
        } else {
          console.debug(header);
        }
        break;
      case "info":
        if (sanitized && Object.keys(sanitized).length > 0) {
          console.info(header, sanitized);
        } else {
          console.info(header);
        }
        break;
      case "warn":
        if (sanitized && Object.keys(sanitized).length > 0) {
          console.warn(header, sanitized);
        } else {
          console.warn(header);
        }
        break;
      case "error":
        if (sanitized && Object.keys(sanitized).length > 0) {
          console.error(header, sanitized);
        } else {
          console.error(header);
        }
        break;
    }

    if (config.terminalLogs) {
      terminalSender({
        category,
        severity,
        event,
        details: sanitized,
        time,
      });
    }
  };

  return {
    debug: (event, details) => logAt("debug", event, details),
    info: (event, details) => logAt("info", event, details),
    warn: (event, details) => logAt("warn", event, details),
    error: (event, details) => logAt("error", event, details),
  };
}

export const apiLogger = createFrontendLogger("API");
export const authLogger = createFrontendLogger("Auth");
export const syncLogger = createFrontendLogger("Sync");
export const workflowLogger = createFrontendLogger("Workflow");
