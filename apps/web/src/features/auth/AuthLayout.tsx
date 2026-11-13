import type { ReactNode } from "react";

export interface AuthLayoutProps {
  children: ReactNode;
}

export function FreshFoldBrandMark() {
  return (
    <div className="inline-flex items-center gap-3">
      <div className="flex justify-center">
        <img
          alt="FreshFold Logo"
          src="/assets/img/logo.webp"
          className="h-25 w-80 object-contain"
        />
      </div>
    </div>
  );
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[#F7F8F3] px-4 py-10 sm:px-6">

      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#DCECC7]/50 blur-[100px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-52 -right-40 h-[450px] w-[450px] rounded-full bg-[#DCEBD4]/50 blur-[110px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-52 -left-40 h-[400px] w-[400px] rounded-full bg-[#EEF0D9]/60 blur-[100px]"
      />

      {/* Centered content */}
      <div className="relative z-10 flex w-full max-w-[440px] flex-col items-center">

        {/* Brand */}
        <div className="mb-9 flex justify-center">
          <FreshFoldBrandMark />
        </div>

        {/* Login content */}
        <div className="w-full">
          {children}
        </div>

        {/* Minimal footer */}
        <p className="mt-8 text-center text-xs text-[#A0A69A]">
          © {new Date().getFullYear()} FreshFold
        </p>
      </div>
    </main>
  );
}
