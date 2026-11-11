import { createContext, useContext, type ReactNode } from "react";
import type { AppApi } from "./types";

const ApiContext = createContext<AppApi | null>(null);

export interface ApiProviderProps {
  api: AppApi;
  children: ReactNode;
}

export function ApiProvider({ api, children }: ApiProviderProps) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): AppApi {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error("useApi must be used inside ApiProvider");
  }
  return api;
}

export function useOptionalApi(): AppApi | null {
  return useContext(ApiContext);
}
