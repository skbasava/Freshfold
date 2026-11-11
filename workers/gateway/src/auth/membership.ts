import {
  membershipResolutionResponseSchema,
  type MembershipResolutionResponse,
  type SupabaseAuthErrorCode,
} from "../../../../packages/contracts/src/supabase-auth";
import {
  REQUEST_ID_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../../../packages/contracts/src/http";

export type MembershipResolutionResult =
  | { ok: true; response: MembershipResolutionResponse }
  | {
      ok: false;
      status: 403 | 503;
      code: Extract<
        SupabaseAuthErrorCode,
        | "membership_missing"
        | "membership_inactive"
        | "cross_tenant_denied"
        | "identity_provider_unavailable"
      >;
    };

export async function resolveLaundryMembership(input: {
  laundry: Fetcher | undefined;
  serviceToken: string | undefined;
  supabaseSubject: string;
  requestId?: string;
}): Promise<MembershipResolutionResult> {
  if (!input.laundry || !input.serviceToken) {
    return {
      ok: false,
      status: 503,
      code: "identity_provider_unavailable",
    };
  }

  let response: Response;
  try {
    response = await input.laundry.fetch(
      new Request(
        "https://laundry.internal/internal/auth/resolve-membership",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            [SERVICE_TOKEN_HEADER]: input.serviceToken,
            [SERVICE_NAME_HEADER]: "gateway",
            ...(input.requestId
              ? { [REQUEST_ID_HEADER]: input.requestId }
              : {}),
          },
          body: JSON.stringify({
            supabaseSubject: input.supabaseSubject,
          }),
        },
      ),
    );
  } catch {
    return {
      ok: false,
      status: 503,
      code: "identity_provider_unavailable",
    };
  }

  if (response.status === 401) {
    return {
      ok: false,
      status: 503,
      code: "identity_provider_unavailable",
    };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    const error = body?.error;
    if (response.status === 403) {
      if (error === "membership_missing") {
        return { ok: false, status: 403, code: "membership_missing" };
      }
      if (error === "membership_inactive") {
        return { ok: false, status: 403, code: "membership_inactive" };
      }
      return { ok: false, status: 403, code: "cross_tenant_denied" };
    }

    return {
      ok: false,
      status: 503,
      code: "identity_provider_unavailable",
    };
  }

  const parsed = membershipResolutionResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    return {
      ok: false,
      status: 503,
      code: "identity_provider_unavailable",
    };
  }

  return { ok: true, response: parsed.data };
}
