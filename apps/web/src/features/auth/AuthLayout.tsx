import { SparkleIcon } from "@freshfold/ui";
import type { ReactNode } from "react";

export interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-primary text-surface shadow-card">
            <SparkleIcon className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight text-text">
              FreshFold
            </span>
            <span className="text-xs text-text-muted">Laundry workspace</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
