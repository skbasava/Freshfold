import { SparkleIcon } from "@freshfold/ui";
import type { ReactNode } from "react";

export interface AuthLayoutProps {
  children: ReactNode;
  aside?: ReactNode;
}

export function FreshFoldBrandMark({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-surface shadow-card">
        <SparkleIcon className="h-5 w-5" />
      </span>
      <span className="flex flex-col text-left">
        <span className="text-lg font-semibold leading-tight tracking-tight text-text">
          FreshFold
        </span>
        {!compact ? (
          <span className="text-xs font-medium text-text-muted">
            Hub operations
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function AuthLayout({ children, aside }: AuthLayoutProps) {
  if (!aside) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10 sm:px-6 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/5 blur-3xl sm:h-96 sm:w-96"
        />
        <div className="relative w-full max-w-md">
          <div className="mb-7 flex justify-center">
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
