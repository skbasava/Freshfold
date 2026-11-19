import {
  HEADER_RC_VERSION,
  sessionResponseSchema,
  type SessionResponse,
} from "@laundry/contracts";
import { apiFetch } from "@/lib/http/api-client";
import type { AuthDeniedCode } from "../types/auth.types";

export type GatewaySessionVerification =
  | {
      ok: true;
      session: SessionResponse;
      rcVersion: string;
    }
  | {
      ok: false;
      kind: "unauthorized";
      code: string;
      message?: string;
    }
  | {
      ok: false;
      kind: "denied";
      code: AuthDeniedCode;
      message: string;
    }
  | {
      ok: false;
      kind: "unavailable";
      message: string;
    };

async function readErrorInfo(
  response: Response,
): Promise<{ code: string; message?: string }> {
  try {
    const body = (await response.json()) as {
      error?: string | { code?: string; message?: string };
    };
    if (typeof body.error === "string") {
      return { code: body.error };
    }
    if (body.error && typeof body.error === "object") {
      return {
        code:
          typeof body.error.code === "string"
            ? body.error.code
            : "unknown_error",
        message:
          typeof body.error.message === "string"
            ? body.error.message
            : undefined,
      };
    }
    return { code: "unknown_error" };
  } catch {
    return { code: "unknown_error" };
  }
}

function deniedMessageFor(code: AuthDeniedCode): string {
  if (code === "membership_inactive") {
    return "Your staff account is inactive or has been revoked. Contact your hub manager for access.";
  }
  return "Your account is signed in, but no FreshFold staff role or hub has been assigned yet. Contact your hub manager.";
}

/**
 * Verifies a Supabase JWT against the Gateway's canonical `GET /api/me` endpoint
 * (ADR-015). Fails closed on 401/403/503 or malformed payloads.
 */
export async function verifyGatewaySession(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GatewaySessionVerification> {
  let response: Response;
  try {
    response = await apiFetch("/api/me", {
      method: "GET",
      accessToken,
      retryOnUnauthorized: false,
      fetchImpl,
    });
  } catch {
    return {
      ok: false,
      kind: "unavailable",
      message:
        "We could not reach the FreshFold server to verify your session. Check your connection and try again.",
    };
  }

  if (response.status === 401) {
    const { code, message } = await readErrorInfo(response);
    return { ok: false, kind: "unauthorized", code, message };
  }

  if (response.status === 403) {
    const { code: rawCode, message: serverMessage } =
      await readErrorInfo(response);
    const code: AuthDeniedCode =
      rawCode === "membership_inactive"
        ? "membership_inactive"
        : "membership_missing";
    return {
      ok: false,
      kind: "denied",
      code,
      message: serverMessage || deniedMessageFor(code),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "unavailable",
      message:
        "Authentication service is temporarily unavailable. Please try again in a moment.",
    };
  }

  try {
    const payload: unknown = await response.json();
    const parsed = sessionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        kind: "unavailable",
        message:
          "Received an unexpected session response from the server. Please try again.",
      };
    }

    const rcVersion =
      response.headers.get(HEADER_RC_VERSION) ??
      parsed.data.rcVersion ??
      "1.0.0";

    return {
      ok: true,
      session: parsed.data,
      rcVersion,
    };
  } catch {
    return {
      ok: false,
      kind: "unavailable",
      message:
        "Received an unreadable session response from the server. Please try again.",
    };
  }
}
