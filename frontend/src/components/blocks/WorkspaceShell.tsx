import { useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import type { Role } from "@laundry/contracts";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/features/auth";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  AppSidebarBlock,
  type SidebarUserInfo,
} from "./AppSidebarBlock";
import {
  TopNavbarBlock,
  type TopNavbarBreadcrumb,
} from "./TopNavbarBlock";

export interface WorkspaceOutletContext {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}

export function useWorkspaceSearch(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}

function formatRoleLabel(role: Role): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "manager":
      return "Manager";
    case "front_desk":
      return "Front Desk";
    case "service":
      return "Service";
    default:
      return String(role);
  }
}

function resolveBreadcrumbs(pathname: string): TopNavbarBreadcrumb[] {
  if (pathname === "/" || pathname === "") {
    return [{ label: "FreshFold", href: "/" }, { label: "Dashboard" }];
  }

  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "Dashboard";
  const label = first.charAt(0).toUpperCase() + first.slice(1);
  return [{ label: "FreshFold", href: "/" }, { label }];
}

export interface WorkspaceShellProps {
  defaultSidebarOpen?: boolean;
}

export function WorkspaceShell({
  defaultSidebarOpen = true,
}: WorkspaceShellProps) {
  const { session, signOut } = useAuth();
  const { pathname } = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const userInfo: SidebarUserInfo = {
    displayName: session?.user.displayName ?? "Staff Member",
    email: session?.user.email ?? "",
    roleLabel: formatRoleLabel(session?.user.role ?? "front_desk")
  };

  const breadcrumbs = resolveBreadcrumbs(pathname);

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AppSidebarBlock
        user={userInfo}
        onSignOut={() => void signOut()}
      />

      <SidebarInset className="overflow-x-hidden md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/60">
        <TopNavbarBlock
          breadcrumbs={breadcrumbs}
          user={userInfo}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onSignOut={() => void signOut()}
        />

        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <ErrorBoundary fallbackTitle="Could not load page">
            <Outlet
              context={
                {
                  searchQuery,
                  setSearchQuery,
                } satisfies WorkspaceOutletContext
              }
            />
          </ErrorBoundary>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
