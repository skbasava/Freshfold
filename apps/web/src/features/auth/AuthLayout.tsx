import { SparkleIcon } from "@freshfold/ui";
import type { ReactNode } from "react";

export interface AuthLayoutProps {
  children: ReactNode;
  aside?: ReactNode;
}

export function FreshFoldBrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary text-surface shadow-card">
        <SparkleIcon className="h-5 w-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-lg font-semibold tracking-tight text-text">
          FreshFold
        </span>
        <span className="text-xs font-medium text-text-muted">
          Hub operations workspace
        </span>
      </span>
    </div>
  );
}

export function AuthLayout({ children, aside }: AuthLayoutProps) {
  if (!aside) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 right-1/4 h-72 w-72 rounded-full bg-primary/5 blur-3xl"
        />
        <div className="relative w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <FreshFoldBrandMark />
          </div>
          {children}
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-36 -left-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-36 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid w-full items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <section
            aria-label="FreshFold workspace overview"
            className="hidden lg:col-span-6 lg:flex lg:flex-col lg:justify-between"
          >
            {aside}
          </section>

          <section className="mx-auto w-full max-w-md lg:col-span-6 lg:max-w-lg">
            <div className="mb-6 flex justify-center lg:hidden">
              <FreshFoldBrandMark />
            </div>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
