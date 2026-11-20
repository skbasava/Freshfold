import type { Role } from "@laundry/contracts";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export type AuthSubmittingMode = "idle" | "password" | "google";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
}

export interface HubOption {
  id: string;
  numericId?: number;
  name: string;
  code: string;
  stateCode?: string;
  isDefault?: boolean;
}

export interface TenantOption {
  id: string;
  name: string;
  code: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  hubId: string;
  hubName: string;
  tenantId: string;
  tenantName?: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
  rcVersion: string;
  tenantEnabled: boolean;
  hubEnabled: boolean;
  tenant?: TenantOption;
  availableHubs?: HubOption[];
}

export type AuthDeniedCode = "membership_missing" | "membership_inactive";

export type AuthSessionOutcome =
  | { kind: "authenticated"; session: AuthSession }
  | { kind: "unauthenticated" }
  | { kind: "password_recovery" }
  | { kind: "denied"; code: AuthDeniedCode; message: string; email?: string }
  | { kind: "error"; message: string };

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; session: AuthSession }
  | { status: "password_recovery" }
  | {
      status: "denied";
      code: AuthDeniedCode;
      message: string;
      email?: string;
    }
  | { status: "error"; message: string };

export type AuthStatus = AuthState["status"];

/**
 * Dependency-inverted boundary for staff authentication & authorization.
 * Production binds this to Supabase Auth + Gateway `/api/me` JWT verification;
 * tests inject deterministic fakes cleanly.
 */
export interface AuthService {
  getSession(): Promise<AuthSessionOutcome>;
  refreshAccessToken(): Promise<string | null>;
  onAuthStateChange(
    listener: (outcome: AuthSessionOutcome) => void,
  ): () => void;
  signInWithPassword(credentials: LoginCredentials): Promise<AuthActionResult>;
  signInWithGoogle(redirectTo?: string): Promise<AuthActionResult>;
  exchangeOAuthCallback(callbackUrl?: string): Promise<AuthActionResult>;
  requestPasswordReset(
    email: string,
    redirectTo?: string,
  ): Promise<AuthActionResult>;
  updatePassword(newPassword: string): Promise<AuthActionResult>;
  signOut(): Promise<void>;
}
