import type { LoginRequest, SessionResponse } from "@laundry/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AUTH_FAILURE_EVENT, UNAUTHORIZED_EVENT } from "../api/client";
import type { AuthFailureDetail } from "../api/client";
import { useApi } from "../api/context";
import type { AppApi } from "../api/types";
import { isMockApiError } from "../mocks/errors";
import { AuthClientError, createSupabaseAuthClient } from "./supabase-auth-client";
import { readSupabaseAuthConfig } from "./supabase-config";
import {
  createAccessTokenStore,
  type AccessTokenStore,
} from "./token-store";
import {
  accountScopeKey,
  type AuthClient,
  type AuthClientSession,
  type AuthLifecycleEvent,
  type AuthenticatedSession,
} from "./types";

export type AuthFailureReason = "expired" | "revoked";

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated"; reason?: AuthFailureReason }
  | { status: "password_recovery"; email: string | null }
  | { status: "authenticated"; session: AuthenticatedSession }
  | { status: "error"; message: string };

export interface AuthContextValue {
  state: AuthState;
  authProvider: "supabase" | "mock" | "unconfigured";
  login(input: LoginRequest): Promise<AuthenticatedSession>;
  loginWithGoogle(): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  authClient?: AuthClient;
  tokenStore?: AccessTokenStore;
  now?: () => number;
}

class HandledAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandledAuthError";
  }
}

function errorStatus(error: unknown): number | null {
  if (isMockApiError(error)) {
    return error.status;
  }
  if (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "We could not check your session.";
}

function mapServerSession(
  response: SessionResponse | Record<string, unknown> | unknown,
  clock: () => number,
): AuthenticatedSession {
  const record = response as Record<string, unknown>;
  const user = (record.user ?? {}) as Record<string, unknown>;
  const hub = (record.hub ?? {}) as Record<string, unknown>;
  const role = (record.role ??
    user.role) as AuthenticatedSession["user"]["role"];

  return {
    user: {
      id: String(user.id ?? user.name ?? ""),
      name: String(user.displayName ?? user.name ?? "Staff member"),
      email: typeof user.email === "string" ? user.email : null,
      role,
    },
    hub: {
      id: String(hub.id ?? ""),
      name: String(hub.name ?? hub.id ?? ""),
      tenantId: String(hub.tenantId ?? ""),
    },
    today: typeof record.today === "number" ? record.today : clock(),
  };
}

function pendingPasswordSetup(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const hash = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const query = new URLSearchParams(window.location.search);
  const type = hash.get("type") ?? query.get("type");
  return type === "invite" || type === "recovery";
}

function clearPasswordSetupUrl(): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  window.history.replaceState({}, "", url);
}

function createMockAuthClient(api: AppApi): AuthClient {
  return {
    provider: "mock",
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
      await api.login({ email, password });
    },
    async signInWithGoogle() {
      await api.login({
        email: "desk@example.com",
        password: "demo-google-sso",
      });
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

function defaultAuthClient(api: AppApi): {
  client?: AuthClient;
  error?: string;
} {
  try {
    const config = readSupabaseAuthConfig(import.meta.env);
    if (config) {
      return { client: createSupabaseAuthClient(config) };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Supabase configuration is invalid.",
    };
  }
  if (api.mode === "mock") {
    return { client: createMockAuthClient(api) };
  }
  return {};
}

export function AuthProvider({
  children,
  authClient,
  tokenStore: providedTokenStore,
  now,
}: AuthProviderProps) {
  const api = useApi();
  const [clock] = useState(() => now ?? (() => Date.now()));
  const [pendingSetup, setPendingSetup] = useState(() => pendingPasswordSetup());
  const [setup] = useState(() =>
    authClient ? { client: authClient } : defaultAuthClient(api),
  );
  const [tokenStore] = useState(
    () => providedTokenStore ?? createAccessTokenStore(),
  );
  const client = setup.client;
  const [state, setState] = useState<AuthState>(() =>
    setup.error
      ? { status: "error", message: setup.error }
      : { status: "loading" },
  );

  const clearLocalSession = useCallback(
    async (reason?: AuthFailureReason) => {
      tokenStore.set(null);
      try {
        await api.setAccountScope?.(null);
      } catch {
        // The local cache remains scoped to the previous account even when a
        // storage switch fails; clearing the token still blocks sync.
      }
      setState({ status: "unauthenticated", ...(reason ? { reason } : {}) });
    },
    [api, tokenStore],
  );

  const resolveSupabaseSession = useCallback(
    async (session: AuthClientSession | null): Promise<AuthenticatedSession> => {
      if (!session) {
        await clearLocalSession();
        throw new HandledAuthError("Please sign in to continue.");
      }

      tokenStore.set(session.accessToken);
      let current = session;
      if (
        current.expiresAt !== null &&
        current.expiresAt * 1000 <= clock() + 30_000
      ) {
        const refreshed = (await client?.refreshSession()) ?? null;
        if (!refreshed) {
          await client?.signOut().catch(() => undefined);
          await clearLocalSession("expired");
          throw new HandledAuthError(
            "Your session ended. Please sign in again.",
          );
        }
        current = refreshed;
        tokenStore.set(current.accessToken);
      }

      try {
        const response = await api.getSession();
        const mapped = mapServerSession(response, clock);
        await api.setAccountScope?.(accountScopeKey(mapped));
        setState({ status: "authenticated", session: mapped });
        return mapped;
      } catch (error) {
        const status = errorStatus(error);
        if (status === 401) {
          await client?.signOut().catch(() => undefined);
          await clearLocalSession("expired");
          throw new HandledAuthError(
            "Your session ended. Please sign in again.",
          );
        }
        if (status === 403) {
          await client?.signOut().catch(() => undefined);
          await clearLocalSession("revoked");
          throw new HandledAuthError(
            "Your access has been removed. Ask your manager to restore it.",
          );
        }
        setState({ status: "error", message: errorMessage(error) });
        throw error;
      }
    },
    [api, clearLocalSession, client, clock, tokenStore],
  );

  const resolveMockSession = useCallback(async () => {
    try {
      const response = await api.getSession();
      const mapped = mapServerSession(response, clock);
      await api.setAccountScope?.(accountScopeKey(mapped));
      setState({ status: "authenticated", session: mapped });
      return mapped;
    } catch (error) {
      if (errorStatus(error) === 401) {
        await clearLocalSession();
        return null;
      }
      setState({ status: "error", message: errorMessage(error) });
      throw error;
    }
  }, [api, clearLocalSession, clock]);

  const refresh = useCallback(async () => {
    if (setup.error) {
      return;
    }
    if (!client) {
      await clearLocalSession();
      return;
    }
    setState({ status: "loading" });
    try {
      if (client.provider === "mock") {
        await resolveMockSession();
        return;
      }

      let session = await client.getSession();
      if (!session) {
        await clearLocalSession();
        return;
      }
      if (
        session.expiresAt !== null &&
        session.expiresAt * 1000 <= clock() + 30_000
      ) {
        session = await client.refreshSession();
        if (!session) {
          await client.signOut().catch(() => undefined);
          await clearLocalSession("expired");
          return;
        }
      }
      tokenStore.set(session.accessToken);
      if (pendingSetup) {
        setState({
          status: "password_recovery",
          email: session.email,
        });
        return;
      }
      await resolveSupabaseSession(session);
    } catch (error) {
      if (error instanceof HandledAuthError) {
        return;
      }
      if (client.provider === "supabase") {
        const status = errorStatus(error);
        if (error instanceof AuthClientError || status === 401) {
          await clearLocalSession("expired");
          return;
        }
      }
      if (isMockApiError(error) && error.status === 401) {
        await clearLocalSession();
        return;
      }
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [
    clearLocalSession,
    client,
    clock,
    pendingSetup,
    resolveMockSession,
    resolveSupabaseSession,
    setup.error,
    tokenStore,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!client || client.provider === "mock") {
      return;
    }

    const subscription = client.onAuthStateChange((change) => {
      const event: AuthLifecycleEvent = change.event;
      if (event === "password_recovery") {
        if (change.session?.accessToken) {
          tokenStore.set(change.session.accessToken);
        }
        setState({
          status: "password_recovery",
          email: change.session?.email ?? null,
        });
        return;
      }
      if (event === "signed_out") {
        void clearLocalSession();
        return;
      }
      if (event === "token_refreshed" && change.session) {
        tokenStore.set(change.session.accessToken);
        return;
      }
      if (event === "signed_in" && change.session) {
        if (pendingSetup) {
          tokenStore.set(change.session.accessToken);
          setState({
            status: "password_recovery",
            email: change.session.email,
          });
          return;
        }
        void resolveSupabaseSession(change.session).catch(() => undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [clearLocalSession, client, pendingSetup, resolveSupabaseSession, tokenStore]);

  useEffect(() => {
    const handleAuthFailure = (event: Event) => {
      const detail = (event as CustomEvent<AuthFailureDetail>).detail;
      if (!detail) {
        return;
      }
      void clearLocalSession(
        detail.status === 403 ? "revoked" : "expired",
      );
    };
    const handleUnauthorized = () => {
      void clearLocalSession();
    };

    window.addEventListener(AUTH_FAILURE_EVENT, handleAuthFailure);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(AUTH_FAILURE_EVENT, handleAuthFailure);
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [clearLocalSession]);

  const login = useCallback(
    async (input: LoginRequest) => {
      if (!client) {
        throw new Error("Sign-in is unavailable.");
      }

      if (client.provider === "mock") {
        const response = await api.login(input);
        const mapped = mapServerSession(response, clock);
        await api.setAccountScope?.(accountScopeKey(mapped));
        setPendingSetup(false);
        setState({ status: "authenticated", session: mapped });
        return mapped;
      }

      await client.signIn(input.email, input.password);
      const session = await client.getSession();
      const mapped = await resolveSupabaseSession(session);
      setPendingSetup(false);
      return mapped;
    },
    [api, client, clock, resolveSupabaseSession],
  );

  const loginWithGoogle = useCallback(async () => {
    if (!client) {
      throw new AuthClientError(
        "provider_unavailable",
        "Google sign-in requires Supabase Auth configuration.",
      );
    }

    if (client.provider === "mock") {
      await client.signInWithGoogle();
      setPendingSetup(false);
      await resolveMockSession();
      return;
    }

    await client.signInWithGoogle();
  }, [client, resolveMockSession]);

  const logout = useCallback(async () => {
    try {
      await client?.signOut();
    } finally {
      await clearLocalSession();
    }
  }, [clearLocalSession, client]);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!client || client.provider !== "supabase") {
        throw new Error(
          "Password reset is only available when Supabase Auth is configured.",
        );
      }
      await client.requestPasswordReset(email);
    },
    [client],
  );

  const setPassword = useCallback(
    async (password: string) => {
      if (!client || client.provider !== "supabase") {
        throw new Error(
          "Password changes are only available when Supabase Auth is configured.",
        );
      }
      await client.updatePassword(password);
      clearPasswordSetupUrl();
      setPendingSetup(false);
      const session = await client.getSession();
      await resolveSupabaseSession(session);
    },
    [client, resolveSupabaseSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      authProvider: client?.provider ?? "unconfigured",
      login,
      loginWithGoogle,
      logout,
      refresh,
      requestPasswordReset,
      setPassword,
    }),
    [
      state,
      client?.provider,
      login,
      loginWithGoogle,
      logout,
      refresh,
      requestPasswordReset,
      setPassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
