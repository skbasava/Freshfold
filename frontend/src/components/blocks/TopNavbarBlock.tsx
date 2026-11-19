import { Link } from "react-router-dom";
import { ChevronDown, LogOut, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

        <Breadcrumb className="ff-topbar-breadcrumb">
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
