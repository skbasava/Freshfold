import type { Plugin, ViteDevServer } from "vite";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export interface TerminalLogPayload {
  category: string;
  severity: "debug" | "info" | "warn" | "error";
  event: string;
  details?: Record<string, unknown>;
  time?: string;
}

export function formatTerminalLog(data: TerminalLogPayload): string {
  const timeStr =
    data.time ??
    new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const catColor =
    data.category === "API"
      ? ANSI.cyan
      : data.category === "Sync"
        ? ANSI.yellow
        : data.category === "Auth"
          ? ANSI.blue
          : data.category === "Workflow"
            ? ANSI.magenta
            : ANSI.green;

  const sevColor =
    data.severity === "error"
      ? `${ANSI.red}${ANSI.bold}`
      : data.severity === "warn"
        ? ANSI.yellow
        : data.severity === "debug"
          ? ANSI.gray
          : ANSI.green;

  const timePart = `${ANSI.gray}${timeStr}${ANSI.reset}`;
  const catPart = `${catColor}${ANSI.bold}[FreshFold:${data.category}]${ANSI.reset}`;
  const eventPart = `${sevColor}${data.event}${ANSI.reset}`;

  let detailsPart = "";
  if (data.details && Object.keys(data.details).length > 0) {
    const entries = Object.entries(data.details)
      .map(([k, v]) => {
        const valStr = typeof v === "object" ? JSON.stringify(v) : String(v);
        return `${ANSI.dim}${k}=${valStr}${ANSI.reset}`;
      })
      .join(" ");
    detailsPart = ` ${ANSI.dim}(${entries})${ANSI.reset}`;
  }

  return `${timePart} ${catPart} ${eventPart}${detailsPart}`;
}

interface HttpReqLike {
  method?: string;
  on?(event: string, listener: (chunk?: unknown) => void): void;
}

interface HttpResLike {
  statusCode?: number;
  end?(): void;
}

export function terminalLoggerPlugin(): Plugin {
  return {
    name: "freshfold-terminal-logger",
    apply: "serve", // Only apply during development server
    configureServer(server: ViteDevServer) {
      const handleLog = (data: TerminalLogPayload) => {
        if (!data || !data.event) return;
        const line = formatTerminalLog(data);
        console.log(line);
      };

      // 1. WebSocket listener from Vite HMR client
      const hot = (
        server as unknown as {
          hot?: {
            on(event: string, cb: (data: TerminalLogPayload) => void): void;
          };
        }
      ).hot;
      if (hot && typeof hot.on === "function") {
        hot.on("freshfold:log", handleLog);
      }
      if (server.ws && typeof server.ws.on === "function") {
        server.ws.on("freshfold:log", handleLog);
      }

      // 2. HTTP middleware fallback
      server.middlewares.use("/__freshfold_terminal_log", (rawReq, rawRes) => {
        const req = rawReq as HttpReqLike;
        const res = rawRes as HttpResLike;

        if (req.method === "POST" && typeof req.on === "function") {
          let body = "";
          req.on("data", (chunk: unknown) => {
            body += String(chunk ?? "");
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body) as TerminalLogPayload;
              handleLog(data);
            } catch {
              // Ignore invalid payloads
            }
            if (res.statusCode !== undefined) {
              res.statusCode = 204;
            }
            res.end?.();
          });
        } else {
          if (res.statusCode !== undefined) {
            res.statusCode = 404;
          }
          res.end?.();
        }
      });
    },
  };
}
