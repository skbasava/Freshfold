import {
  AppShell,
  PageContainer,
  PageHeader,
  Sidebar,
  Topbar,
} from "@freshfold/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const items = [
  { label: "Dashboard", href: "/" },
  { label: "Orders", href: "/orders" },
];

describe("Sidebar", () => {
  it("marks the active page and exposes navigation", () => {
    render(
      <Sidebar
        brand={<span>FreshFold</span>}
        items={items}
        activePath="/orders"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: /main navigation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("supports a custom link renderer for client-side routing", async () => {
    const renderLink = vi.fn(
      (
        item: { href: string },
        props: { className: string; children: ReactNode },
      ) => (
        <button type="button" data-href={item.href} className={props.className}>
          {props.children}
        </button>
      ),
    );

    render(
      <Sidebar
        items={items}
        activePath="/"
        renderLink={renderLink}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(renderLink).toHaveBeenCalled();
  });

  it("renders sections, expandable navigation groups, utility actions, and collapse control", async () => {
    const user = userEvent.setup();
    const onHelpClick = vi.fn();
    const onToggleCollapse = vi.fn();

    render(
      <Sidebar
        sections={[
          {
            id: "workspace",
            label: "Workspace",
            items: [
              { label: "Dashboard", href: "/" },
              {
                label: "Orders",
                href: "/orders",
                children: [
                  { label: "All orders", href: "/orders" },
                  { label: "New order", href: "/orders/new" },
                ],
              },
            ],
          },
          {
            id: "directory",
            label: "Directory",
            items: [{ label: "Customers", href: "/customers" }],
          },
        ]}
        utilityItems={[
          { id: "help", label: "Help & guide", onClick: onHelpClick },
        ]}
        activePath="/orders/new"
        onToggleCollapse={onToggleCollapse}
      />,
    );

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Directory")).toBeInTheDocument();

    const ordersToggle = screen.getByRole("button", { name: "Orders" });
    expect(ordersToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "New order" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "All orders" }),
    ).not.toHaveAttribute("aria-current");

    await user.click(ordersToggle);
    expect(ordersToggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "New order" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Help & guide" }));
    expect(onHelpClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders icon-rail tooltips and expand toggle when collapsed", async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();

    render(
      <Sidebar
        sections={[
          {
            id: "workspace",
            label: "Workspace",
            items: [{ label: "Dashboard", href: "/" }],
          },
        ]}
        utilityItems={[{ id: "help", label: "Help & guide" }]}
        activePath="/"
        collapsed
        onToggleCollapse={onToggleCollapse}
      />,
    );

    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Help & guide" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

describe("Topbar", () => {
  it("shows the page title, user and menu control", async () => {
    const onMenuClick = vi.fn();
    render(
      <Topbar
        title="Dashboard"
        subtitle="Wednesday, 11 November"
        user={{ name: "Riya Sharma", role: "Front desk" }}
        onMenuClick={onMenuClick}
      />,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Riya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Front desk")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /open navigation/i }),
    );
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("renders breadcrumbs, search form, notifications, and accessible user menu", async () => {
    const user = userEvent.setup();
    const onSearchSubmit = vi.fn();
    const onSignOut = vi.fn();
    let searchValue = "";

    const { rerender } = render(
      <Topbar
        title="New order"
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "New order" }]}
        search={{
          value: searchValue,
          onChange: (value) => {
            searchValue = value;
          },
          onSubmit: onSearchSubmit,
        }}
        notifications={<button type="button">Alerts</button>}
        user={{ name: "Riya Sharma", role: "Front desk" }}
        userMenuItems={[
          { id: "sign-out", label: "Sign out", onSelect: onSignOut, tone: "danger" },
        ]}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/orders",
    );

    rerender(
      <Topbar
        title="New order"
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "New order" }]}
        search={{
          value: "Priya",
          onChange: () => undefined,
          onSubmit: onSearchSubmit,
        }}
        notifications={<button type="button">Alerts</button>}
        user={{ name: "Riya Sharma", role: "Front desk" }}
        userMenuItems={[
          { id: "sign-out", label: "Sign out", onSelect: onSignOut, tone: "danger" },
        ]}
      />,
    );

    const searchInput = screen.getByRole("searchbox", { name: "Global search" });
    await user.type(searchInput, "{Enter}");
    expect(onSearchSubmit).toHaveBeenCalledWith("Priya");

    const accountButton = screen.getByRole("button", { name: /Riya Sharma/i });
    await user.click(accountButton);
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("menu", { name: "Account menu" }),
    ).not.toBeInTheDocument();

    await user.click(accountButton);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("PageHeader and PageContainer", () => {
  it("renders a page heading with description and actions", () => {
    render(
      <PageHeader
        title="Today at FreshFold"
        description="A simple view of what needs your attention."
        actions={<button type="button">New order</button>}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Today at FreshFold" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A simple view of what needs your attention."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New order" }),
    ).toBeInTheDocument();
  });

  it("renders page content inside a container", () => {
    render(
      <PageContainer>
        <p>Page content</p>
      </PageContainer>,
    );

    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("provides a skip link and opens the mobile navigation", async () => {
    const { container } = render(
      <AppShell
        sidebar={<Sidebar items={items} activePath="/" />}
        topbar={({ openNavigation }) => (
          <Topbar title="Dashboard" onMenuClick={openNavigation} />
        )}
      >
        <p>Workspace</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: /skip to main content/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();

    const aside = container.querySelector("aside");
    expect(aside).toHaveAttribute("aria-hidden", "true");

    await userEvent.click(
      screen.getByRole("button", { name: /open navigation/i }),
    );
    expect(aside).toHaveAttribute("aria-hidden", "false");
  });

  it("keeps mobile navigation open when toggling an expandable group and closes on link click or Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppShell
        sidebar={({ collapsed, toggleCollapsed }) => (
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
            sections={[
              {
                id: "workspace",
                items: [
                  { label: "Dashboard", href: "/" },
                  {
                    label: "Orders",
                    href: "/orders",
                    children: [
                      { label: "All orders", href: "/orders" },
                      { label: "New order", href: "/orders/new" },
                    ],
                  },
                ],
              },
            ]}
            activePath="/"
          />
        )}
        topbar={({ openNavigation }) => (
          <Topbar title="Dashboard" onMenuClick={openNavigation} />
        )}
      >
        <p>Workspace</p>
      </AppShell>,
    );

    const aside = container.querySelector("aside");
    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(aside).toHaveAttribute("aria-hidden", "false");

    await user.click(screen.getByRole("button", { name: "Orders" }));
    expect(aside).toHaveAttribute("aria-hidden", "false");
    expect(
      screen.getByRole("link", { name: "All orders" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(aside).toHaveAttribute("aria-hidden", "true");
  });
});
