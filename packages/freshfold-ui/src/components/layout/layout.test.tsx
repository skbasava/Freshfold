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
});
