import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createFrontendLogger,
  readFrontendLogConfig,
  type FrontendLogConfig,
} from "./logger";

describe("frontend logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("readFrontendLogConfig", () => {
    it("respects VITE_ENABLE_LOGS=false", () => {
      const config = readFrontendLogConfig({
        VITE_ENABLE_LOGS: "false",
        VITE_LOG_LEVEL: "debug",
      });
      expect(config.enabled).toBe(false);
      expect(config.level).toBe("silent");
    });

    it("respects VITE_LOG_LEVEL", () => {
      const config = readFrontendLogConfig({
        VITE_ENABLE_LOGS: "true",
        VITE_LOG_LEVEL: "warn",
      });
      expect(config.enabled).toBe(true);
      expect(config.level).toBe("warn");
    });

    it("defaults to silent in test mode if VITE_ENABLE_LOGS is unset", () => {
      const config = readFrontendLogConfig({
        MODE: "test",
      });
      expect(config.enabled).toBe(false);
      expect(config.level).toBe("silent");
    });

    it("enables debug in DEV mode if VITE_ENABLE_LOGS=true", () => {
      const config = readFrontendLogConfig({
        VITE_ENABLE_LOGS: "true",
        DEV: true,
      });
      expect(config.enabled).toBe(true);
      expect(config.level).toBe("debug");
    });
  });

  describe("createFrontendLogger", () => {
    it("does not output when disabled", () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const logger = createFrontendLogger("Test", () => ({
        enabled: false,
        level: "silent",
      }));

      logger.info("should_not_show");
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("filters lower-severity messages based on level", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const logger = createFrontendLogger("FilterTest", () => ({
        enabled: true,
        level: "warn",
      }));

      logger.debug("debug_msg");
      logger.info("info_msg");
      logger.warn("warn_msg");

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("redacts sensitive fields such as tokens and passwords", () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const logger = createFrontendLogger("Auth", () => ({
        enabled: true,
        level: "debug",
      }));

      logger.info("auth_check", {
        token: "super-secret-jwt",
        password: "my-password",
        customerPhone: "+919876543210",
        orderId: "ord-123",
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const callArgs = infoSpy.mock.calls[0];
      expect(callArgs[0]).toContain("[FreshFold:Auth] auth_check");
      expect(callArgs[1]).toEqual({
        token: "[REDACTED]",
        password: "[REDACTED]",
        customerPhone: "***3210",
        orderId: "ord-123",
      });
    });

    it("invokes error console method on error logs", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logger = createFrontendLogger("API", () => ({
        enabled: true,
        level: "error",
      }));

      logger.error("network_failure", { status: 500 });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain("[FreshFold:API] network_failure");
    });

    it("sends logs to terminal when terminalLogs is enabled", () => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      const terminalSpy = vi.fn();

      const logger = createFrontendLogger(
        "Sync",
        () => ({
          enabled: true,
          level: "info",
          terminalLogs: true,
        }),
        terminalSpy,
      );

      logger.info("sync_started", { count: 3 });

      expect(terminalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "Sync",
          event: "sync_started",
          details: { count: 3 },
        }),
      );
    });
  });
});


