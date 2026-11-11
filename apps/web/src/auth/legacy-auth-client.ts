import type { LoginRequest } from "@laundry/contracts";
import type { AppApi } from "../api/types";
import type { AuthClient } from "./types";

/**
 * Local-development fallback for the retired Auth Worker. This must never be
 * used as a production identity source; the Gateway disables it in staging and
 * production.
 */
export function createLegacyAuthClient(api: AppApi): AuthClient {
  return {
    provider: "legacy",
    async getSession() {
      const session = await api.getSession();
      return {
        accessToken: "",
        refreshToken: null,
        expiresAt: null,
        userId: session.user.name,
        email: null,
      };
    },
    async signIn(email: string, password: string) {
      const input: LoginRequest = { email, password };
      await api.login(input);
    },
    async signOut() {
      await api.logout();
    },
    async requestPasswordReset() {
      throw new Error(
        "Password reset is only available when Supabase Auth is configured.",
      );
    },
    async updatePassword() {
      throw new Error(
        "Password changes are only available when Supabase Auth is configured.",
      );
    },
    async refreshSession() {
      return this.getSession();
    },
    onAuthStateChange() {
      return { unsubscribe() {} };
    },
  };
}
