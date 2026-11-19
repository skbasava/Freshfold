import { useEffect, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Building2,
  ChevronsUpDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Shirt,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Logo from "/assets/img/light_theme_logo.webp";

export interface NavItemConfig {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
}

export interface NavGroupConfig {
  label: string;
  items: NavItemConfig[];
}

export const WORKSPACE_NAV_GROUPS: NavGroupConfig[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
      { label: "Orders", href: "/orders", icon: ClipboardList },
    ],
  },
  {
    label: "Directory",
    items: [
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Items & Rates", href: "/items", icon: Shirt },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export interface SidebarUserInfo {
  displayName: string;
  email: string;
  roleLabel: string;
}

export interface AppSidebarBlockProps {
  user: SidebarUserInfo;
  navGroups?: NavGroupConfig[];
  onSignOut: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "FF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function isRouteActive(pathname: string, item: NavItemConfig): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppSidebarBlock({
  user,
  navGroups = WORKSPACE_NAV_GROUPS,
  onSignOut,
}: AppSidebarBlockProps) {
  const { pathname } = useLocation();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const initials = getInitials(user.displayName);
  const isCollapsed = state === "collapsed" && !isMobile;

  // Automatically close the mobile drawer when navigating to a new route
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 px-2.5 pt-3 pb-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/"
                aria-label="FreshFold Home"
                className="ff-sidebar-brand focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
              />
            }
          >
            <span className="ff-sidebar-brand-full">
              <img
                src={Logo}
                alt="FreshFold"
                className="h-9 w-auto max-w-[148px] object-contain object-left"
              />
            </span>
            <span aria-hidden="true" className="ff-sidebar-brand-compact">
              FF
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            hidden={!isCollapsed}
          >
            FreshFold
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/orders/new"
                aria-label="New Order"
                className="ff-sidebar-cta focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
              />
            }
          >
            <PlusCircle aria-hidden="true" className="size-4 shrink-0" />
            <span className="ff-sidebar-cta-label">New Order</span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            hidden={!isCollapsed}
          >
            New Order
          </TooltipContent>
        </Tooltip>
      </SidebarHeader>

      <SidebarContent className="ff-sidebar-scroll gap-1 px-1.5 py-1">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 ? (
              <div
                aria-hidden="true"
                className="ff-sidebar-collapsed-divider"
              />
            ) : null}
            <SidebarGroup className="p-1.5">
              <SidebarGroupLabel className="ff-sidebar-group-label">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(pathname, item);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          className="ff-sidebar-nav-item"
                          render={<Link to={item.href} />}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={`${user.displayName} (${user.roleLabel})`}
                    className="ff-sidebar-user-trigger data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar size="sm" className="size-8 shrink-0 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="ff-sidebar-user-meta grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium text-foreground">
                    {user.displayName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.roleLabel}
                  </span>
                </div>
                <ChevronsUpDown className="ff-sidebar-user-meta ml-auto size-4 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                sideOffset={8}
                className="min-w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {user.displayName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user.roleLabel}
                      </p>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
