import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { registerAccessTokenRefresher } from "@/lib/http/api-client";
import {
  clearActiveSessionContext,
  setActiveSessionContext,
} from "@/lib/http/session-store";
import { defaultAuthService } from "../services/auth.service";
import type {
  AuthService,
  AuthSession,
  AuthSessionOutcome,
  AuthState,
  AuthStatus,
} from "../types/auth.types";

export interface AuthContextValue {
  state: AuthState;
  status: AuthStatus;
  session: AuthSession | null;
  authService: AuthService;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function outcomeToState(outcome: AuthSessionOutcome): AuthState {
  switch (outcome.kind) {
    case "authenticated":
      return { status: "authenticated", session: outcome.session };
    case "unauthenticated":
      return { status: "unauthenticated" };
    case "password_recovery":
      return { status: "password_recovery" };
    case "denied":
      return {
        status: "denied",
        code: outcome.code,
        message: outcome.message,
        email: outcome.email,
      };
    case "error":
      return { status: "error", message: outcome.message };
  }
}

export interface AuthProviderProps {
  authService?: AuthService;
  children: ReactNode;
}

export function AuthProvider({
  authService = defaultAuthService,
  children,
}: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const applyOutcome = useCallback((outcome: AuthSessionOutcome) => {
    if (outcome.kind === "authenticated") {
      setActiveSessionContext({
        accessToken: outcome.session.accessToken,
        tenantId: outcome.session.user.tenantId,
        hubId: outcome.session.user.hubId,
        rcVersion: outcome.session.rcVersion,
      });
    } else {
      clearActiveSessionContext();
    }
    setState(outcomeToState(outcome));
  }, []);

  const refreshSession = useCallback(async () => {
    setState((prev) =>
      prev.status === "authenticated" ? prev : { status: "loading" },
    );
    const nextOutcome = await authService.getSession();
    applyOutcome(nextOutcome);
  }, [applyOutcome, authService]);

  const signOut = useCallback(async () => {
    await authService.signOut();
    applyOutcome({ kind: "unauthenticated" });
  }, [applyOutcome, authService]);

  useEffect(() => {
    let active = true;

    registerAccessTokenRefresher(() => authService.refreshAccessToken());

    void authService.getSession().then((initialOutcome) => {
      if (!active) {
        return;
      }
      applyOutcome(initialOutcome);
    });

    const unsubscribe = authService.onAuthStateChange((nextOutcome) => {
      if (!active) {
        return;
      }
      applyOutcome(nextOutcome);
    });

    return () => {
      active = false;
      unsubscribe();
      registerAccessTokenRefresher(null);
    };
  }, [applyOutcome, authService]);

  const session = state.status === "authenticated" ? state.session : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      status: state.status,
      session,
      authService,
      refreshSession,
      signOut,
    }),
    [authService, refreshSession, session, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
