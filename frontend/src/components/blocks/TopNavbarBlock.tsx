import { Link } from "react-router-dom";
import { Building2, Check, ChevronDown, LogOut, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { HubOption } from "@/features/auth/types/auth.types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SidebarUserInfo } from "./AppSidebarBlock";

export interface TopNavbarBreadcrumb {
  label: string;
  href?: string;
}

export interface TopNavbarBlockProps {
  breadcrumbs: TopNavbarBreadcrumb[];
  user: SidebarUserInfo;
  tenantName?: string;
  currentHubName?: string;
  currentHubCode?: string;
  availableHubs?: HubOption[];
  onSelectHub?: (hub: HubOption) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSignOut: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "FF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TopNavbarBlock({
  breadcrumbs,
  user,
  tenantName = "FreshFold India",
  currentHubName = "Main Branch",
  currentHubCode = "MAIN",
  availableHubs = [],
  onSelectHub,
  searchValue,
  onSearchChange,
  onSignOut,
}: TopNavbarBlockProps) {
  const initials = getInitials(user.displayName);

  return (
    <header className="ff-topbar">
      <div className="ff-topbar-left">
        <SidebarTrigger
          className="ff-topbar-trigger"
          aria-label="Toggle sidebar"
        />
        <Separator orientation="vertical" className="ff-topbar-divider" />

        {/* Tenant & Hub Selector */}
        {availableHubs.length > 0 && onSelectHub ? (
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs font-medium border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 hover:border-blue-300 text-blue-900 transition-colors"
                    aria-label="Select Hub"
                  />
                }
              >
                <Building2 className="size-3.5 text-primary shrink-0" />
                <span className="font-semibold text-primary truncate max-w-[130px] sm:max-w-[180px]">
                  {currentHubName}
                </span>
                <ChevronDown className="size-3 text-blue-500 shrink-0 ml-0.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-1.5">
                <div className="px-2 py-1.5 border-b border-border/60 mb-1">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tenant
                  </div>
                  <div className="text-xs font-bold text-foreground truncate">
                    {tenantName}
                  </div>
                </div>
                <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Switch Hub / Outlet
                </div>
                {availableHubs.map((hub) => {
                  const isSelected = hub.code === currentHubCode;
                  return (
                    <DropdownMenuItem
                      key={hub.code}
                      onClick={() => onSelectHub(hub)}
                      className="flex items-center justify-between text-xs py-2 px-2 cursor-pointer rounded-md"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className={`font-semibold truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {hub.name}
                        </span>
                        <span className="text-2xs text-muted-foreground">
                          {hub.code} {hub.stateCode ? `• State ${hub.stateCode}` : ""}
                        </span>
                      </div>
                      {isSelected ? (
                        <Check className="size-4 text-primary shrink-0 ml-2" />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="ff-topbar-divider ml-2" />
          </div>
        ) : null}

        <Breadcrumb className="ff-topbar-breadcrumb hidden sm:flex">
          <BreadcrumbList className="ff-topbar-breadcrumb-list">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={crumb.label} className="ff-topbar-crumb-group">
                  <BreadcrumbItem className="min-w-0">
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage className="ff-topbar-crumb-current">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="ff-topbar-crumb-link"
                        render={<Link to={crumb.href} />}
                      >
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast ? <BreadcrumbSeparator /> : null}
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="ff-topbar-right">
        <div className="ff-topbar-search">
          <Search aria-hidden="true" className="ff-topbar-search-icon" />
          <Input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search orders or customers..."
            aria-label="Search orders or customers"
            className="ff-topbar-search-input"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="ff-topbar-account-btn"
                aria-label="Account menu"
              />
            }
          >
            <Avatar size="sm" className="ff-topbar-avatar">
              <AvatarFallback className="ff-topbar-avatar-fallback">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="ff-topbar-user-name">{user.displayName}</span>
            <ChevronDown aria-hidden="true" className="ff-topbar-chevron" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="ff-topbar-menu"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="ff-topbar-menu-header">
                  <p className="ff-topbar-menu-name">{user.displayName}</p>
                  <p className="ff-topbar-menu-email">{user.email}</p>
                  <span className="ff-topbar-role-pill">{user.roleLabel}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <LogOut className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
