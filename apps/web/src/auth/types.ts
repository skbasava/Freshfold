export interface AuthClientSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  userId: string;
  email: string | null;
}

export type AuthLifecycleEvent =
  | "initial_session"
  | "signed_in"
  | "signed_out"
  | "token_refreshed"
  | "password_recovery"
  | "user_updated";

export interface AuthStateChange {
  event: AuthLifecycleEvent;
  session: AuthClientSession | null;
}

export type AuthClientErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "weak_password"
  | "refresh_failed"
  | "provider_unavailable";

export interface AuthClient {
  readonly provider: "supabase" | "legacy";
  getSession(): Promise<AuthClientSession | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  refreshSession(): Promise<AuthClientSession | null>;
  onAuthStateChange(
    listener: (change: AuthStateChange) => void,
  ): { unsubscribe(): void };
}

export interface AuthenticatedSession {
  user: {
    id: string;
    name: string;
    email: string | null;
    role: "front_desk" | "manager" | "service";
  };
  hub: {
    id: string;
    name: string;
    tenantId: string;
  };
  today: number;
}

export function accountScopeKey(session: AuthenticatedSession): string {
  return `${session.user.id}:${session.hub.tenantId}:${session.hub.id}`;
}
