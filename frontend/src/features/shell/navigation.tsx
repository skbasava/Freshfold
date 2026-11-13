import {
  CalendarIcon,
  HomeIcon,
  OrdersIcon,
  TruckIcon,
  UsersIcon,
  type SidebarSection,
  type TopbarBreadcrumb,
} from "@freshfold/ui";
import type { Role } from "@laundry/contracts";

export const navigationSections: SidebarSection[] = [
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
  return { title: "Dashboard" };
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "manager":
      return "Manager";
    case "front_desk":
      return "Front desk";
    case "service":
      return "Service account";
  }
}

