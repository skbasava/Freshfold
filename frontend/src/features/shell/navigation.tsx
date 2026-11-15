import {
  BuildingIcon,
  CalendarIcon,
  HomeIcon,
  HubIcon,
  OrdersIcon,
  TruckIcon,
  UsersIcon,
  type SidebarSection,
  type TopbarBreadcrumb,
} from "@freshfold/ui";
import type { Role } from "@laundry/contracts";

export function getNavigationSections(role?: Role): SidebarSection[] {
  const isSuperAdmin = role === "super_admin";

  const sections: SidebarSection[] = [
    {
      id: "workspace",
      label: "Workspace",
      items: [
        {
          label: "Dashboard",
          href: "/",
          icon: <HomeIcon className="h-5 w-5" />,
        },
        {
          label: "Orders",
          href: "/orders",
          icon: <OrdersIcon className="h-5 w-5" />,
          children: [
            { label: "All orders", href: "/orders" },
            { label: "New order", href: "/orders/new" },
          ],
        },
        {
          label: "Deliveries",
          href: "/deliveries",
          icon: <TruckIcon className="h-5 w-5" />,
        },
        {
          label: "Calendar",
          href: "/calendar",
          icon: <CalendarIcon className="h-5 w-5" />,
        },
      ],
    },
    {
      id: "directory",
      label: "Directory",
      items: [
        {
          label: "Customers",
          href: "/customers",
          icon: <UsersIcon className="h-5 w-5" />,
        },
      ],
    },
  ];

  if (isSuperAdmin) {
    sections.push({
      id: "admin",
      label: "Administration",
      items: [
        {
          label: "Tenants",
          href: "/tenants",
          icon: <BuildingIcon className="h-5 w-5" />,
          children: [
            { label: "All tenants", href: "/tenants" },
            { label: "New tenant", href: "/tenants/new" },
          ],
        },
        {
          label: "Hubs",
          href: "/hubs",
          icon: <HubIcon className="h-5 w-5" />,
          children: [
            { label: "All hubs", href: "/hubs" },
            { label: "New hub", href: "/hubs/new" },
          ],
        },
      ],
    });
  }

  return sections;
}

export const navigationSections: SidebarSection[] = getNavigationSections();

export interface PageMeta {
  title: string;
  breadcrumbs?: TopbarBreadcrumb[];
}

export function pageMeta(pathname: string): PageMeta {
  if (pathname === "/orders/new") {
    return {
      title: "New order",
      breadcrumbs: [{ label: "Orders", href: "/orders" }, { label: "New order" }],
    };
  }
  if (pathname.startsWith("/orders/")) {
    const orderId = decodeURIComponent(pathname.slice("/orders/".length));
    return {
      title: "Order details",
      breadcrumbs: [
        { label: "Orders", href: "/orders" },
        { label: orderId || "Order details" },
      ],
    };
  }
  if (pathname.startsWith("/orders")) {
    return { title: "Orders" };
  }
  if (pathname.startsWith("/deliveries")) {
    return { title: "Deliveries" };
  }
  if (pathname.startsWith("/calendar")) {
    return { title: "Calendar" };
  }
  if (pathname.startsWith("/customers/")) {
    const customerId = decodeURIComponent(
      pathname.slice("/customers/".length),
    );
    return {
      title: "Customer details",
      breadcrumbs: [
        { label: "Customers", href: "/customers" },
        { label: customerId || "Customer details" },
      ],
    };
  }
  if (pathname.startsWith("/customers")) {
    return { title: "Customers" };
  }
  if (pathname === "/tenants/new") {
    return {
      title: "New tenant",
      breadcrumbs: [{ label: "Tenants", href: "/tenants" }, { label: "New tenant" }],
    };
  }
  if (pathname.startsWith("/tenants/")) {
    const tenantId = decodeURIComponent(pathname.slice("/tenants/".length));
    return {
      title: "Tenant details",
      breadcrumbs: [
        { label: "Tenants", href: "/tenants" },
        { label: tenantId || "Tenant details" },
      ],
    };
  }
  if (pathname.startsWith("/tenants")) {
    return { title: "Tenants" };
  }
  if (pathname === "/hubs/new") {
    return {
      title: "New hub",
      breadcrumbs: [{ label: "Hubs", href: "/hubs" }, { label: "New hub" }],
    };
  }
  if (pathname.startsWith("/hubs/")) {
    const hubId = decodeURIComponent(pathname.slice("/hubs/".length));
    return {
      title: "Hub details",
      breadcrumbs: [
        { label: "Hubs", href: "/hubs" },
        { label: hubId || "Hub details" },
      ],
    };
  }
  if (pathname.startsWith("/hubs")) {
    return { title: "Hubs" };
  }
  return { title: "Dashboard" };
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "super_admin":
      return "Super Admin";
    case "manager":
      return "Manager";
    case "front_desk":
    case "counter_staff":
      return "Front desk";
    case "operator":
      return "Operator";
    case "finance":
      return "Finance";
    case "service":
      return "Service account";
  }
}

