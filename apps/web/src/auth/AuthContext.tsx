import type { LoginRequest } from "@laundry/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UNAUTHORIZED_EVENT } from "../api/client";
import { useApi } from "../api/context";
import type { MockSession } from "../mocks/types";
import { isMockApiError } from "../mocks/errors";

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; session: MockSession }
  | { status: "error"; message: string };

export interface AuthContextValue {
  state: AuthState;
  login(input: LoginRequest): Promise<MockSession>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const api = useApi();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const session = await api.getSession();
      setState({ status: "authenticated", session });
    } catch (error) {
      if (isMockApiError(error) && error.status === 401) {
        setState({ status: "unauthenticated" });
        return;
      }
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not check your session.",
      });
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setState({ status: "unauthenticated" });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const login = useCallback(
    async (input: LoginRequest) => {
      const session = await api.login(input);
      setState({ status: "authenticated", session });
      return session;
    },
    [api],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState({ status: "unauthenticated" });
    }
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, refresh }),
    [state, login, logout, refresh],
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
