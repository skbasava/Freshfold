import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon, PanelLeftIcon, SparkleIcon } from "../icons";

export interface SidebarItem {
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: ReactNode;
  children?: SidebarItem[];
  defaultOpen?: boolean;
}

export interface SidebarSection {
  id: string;
  label?: string;
  items: SidebarItem[];
}

export interface SidebarUtilityItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: ReactNode;
  active?: boolean;
}

export interface SidebarLinkProps {
  className: string;
  "aria-current": "page" | undefined;
  "aria-label"?: string;
  title?: string;
  children: ReactNode;
}

export type SidebarLinkRenderer = (
  item: SidebarItem,
  props: SidebarLinkProps,
) => ReactNode;

export interface SidebarProps {
  items?: SidebarItem[];
  sections?: SidebarSection[];
  utilityItems?: SidebarUtilityItem[];
  activePath?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  brand?: ReactNode;
  footer?: ReactNode;
  renderLink?: SidebarLinkRenderer;
  className?: string;
}

function DefaultBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent-hover text-surface shadow-card">
        <SparkleIcon className="h-4 w-4" />
      </span>
      {!collapsed ? (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base font-semibold leading-tight tracking-tight text-text">
            FreshFold
          </span>
          <span className="truncate text-[11px] font-medium text-text-muted">
            Hub workspace
          </span>
        </span>
      ) : null}
    </div>
  );
}

function isExactMatch(href: string, activePath: string | undefined): boolean {
  return Boolean(activePath && href === activePath);
}

function isBranchMatch(item: SidebarItem, activePath: string | undefined): boolean {
  if (!activePath) {
    return false;
  }
  if (item.href === activePath) {
    return true;
  }
  if (item.children?.some((child) => isBranchMatch(child, activePath))) {
    return true;
  }
  return item.href !== "/" && activePath.startsWith(`${item.href}/`);
}

function renderNavAnchor(
  item: SidebarItem,
  active: boolean,
  className: string,
  content: ReactNode,
  collapsed: boolean,
  renderLink?: SidebarLinkRenderer,
) {
  const linkProps: SidebarLinkProps = {
    className,
    "aria-current": active ? "page" : undefined,
    ...(collapsed ? { "aria-label": item.label, title: item.label } : {}),
    children: content,
  };

  if (renderLink) {
    return renderLink(item, linkProps);
  }

  return (
    <a
      href={item.href}
      className={linkProps.className}
      aria-current={linkProps["aria-current"]}
      aria-label={linkProps["aria-label"]}
      title={linkProps.title}
    >
      {linkProps.children}
    </a>
  );
}

export function Sidebar({
  items,
  sections,
  utilityItems,
  activePath,
  collapsed = false,
  onToggleCollapse,
  brand,
  footer,
  renderLink,
  className,
}: SidebarProps) {
  const navId = useId();
  const resolvedSections: SidebarSection[] =
    sections ?? (items ? [{ id: "primary", items }] : []);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of resolvedSections) {
      for (const item of section.items) {
        if (item.children?.length) {
          initial[item.href] = Boolean(
            item.defaultOpen || isBranchMatch(item, activePath),
          );
        }
      }
    }
    return initial;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const section of resolvedSections) {
        for (const item of section.items) {
          if (item.children?.length && isBranchMatch(item, activePath) && !next[item.href]) {
            next[item.href] = true;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [activePath, resolvedSections.length]);

  const leafLinkClasses = (active: boolean, nested = false): string =>
    cn(
      "group flex items-center rounded-full text-sm transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
      collapsed
        ? "mx-auto h-10 w-10 justify-center p-0"
        : nested
          ? "min-h-9 gap-2.5 px-3 py-1.5"
          : "min-h-10 gap-3 px-3.5 py-2",
      active
        ? collapsed
          ? "bg-accent text-surface font-semibold shadow-card"
          : "bg-accent/10 text-accent-strong font-semibold"
        : "font-medium text-text-muted hover:bg-canvas hover:text-text",
    );

  const toggleGroup = (href: string) => {
    setOpenGroups((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <div className={cn("flex h-full flex-col bg-surface", className)}>
      <div
        className={cn(
          "flex min-h-16 shrink-0 items-center border-b border-border/50",
          collapsed ? "justify-center px-2" : "justify-between gap-2 px-4",
        )}
      >
        <div className="min-w-0">
          {brand ?? <DefaultBrand collapsed={collapsed} />}
        </div>

        {onToggleCollapse && !collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-canvas hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:inline-flex"
          >
            <PanelLeftIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {onToggleCollapse && collapsed ? (
        <div className="hidden justify-center border-b border-border/50 py-2.5 lg:flex">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-canvas hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <PanelLeftIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <nav
        aria-label="Main navigation"
        className={cn(
          "flex-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <div className="flex flex-col gap-5">
          {resolvedSections.map((section, sectionIndex) => (
            <div key={section.id}>
              {section.label && !collapsed ? (
                <p className="px-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {section.label}
                </p>
              ) : sectionIndex > 0 && collapsed ? (
                <div
                  aria-hidden="true"
                  className="mx-2 mb-3 border-t border-border/60"
                />
              ) : null}

              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const hasChildren = Boolean(item.children?.length);

                  if (!hasChildren || collapsed) {
                    const active = hasChildren
                      ? isBranchMatch(item, activePath)
                      : isExactMatch(item.href, activePath) ||
                        (item.href !== "/" &&
                          Boolean(activePath?.startsWith(`${item.href}/`)));

                    const content = (
                      <>
                        {item.icon ? (
                          <span
                            className={cn(
                              "grid h-5 w-5 shrink-0 place-items-center transition-colors",
                              active
                                ? collapsed
                                  ? "text-surface"
                                  : "text-accent"
                                : "text-text-muted group-hover:text-text",
                            )}
                          >
                            {item.icon}
                          </span>
                        ) : null}
                        {!collapsed ? (
                          <span className="truncate">{item.label}</span>
                        ) : null}
                        {!collapsed && item.badge ? (
                          <span
                            className={cn(
                              "ml-auto rounded-full px-2 py-0.5 text-xs font-semibold",
                              active
                                ? "bg-accent/15 text-accent-strong"
                                : "bg-canvas text-text-muted",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : !collapsed && active ? (
                          <span
                            aria-hidden="true"
                            className="ml-auto h-1.5 w-1.5 rounded-full bg-accent"
                          />
                        ) : null}
                      </>
                    );

                    return (
                      <li key={item.href}>
                        {renderNavAnchor(
                          item,
                          active,
                          leafLinkClasses(active),
                          content,
                          collapsed,
                          renderLink,
                        )}
                      </li>
                    );
                  }

                  const groupActive = isBranchMatch(item, activePath);
                  const isOpen = Boolean(openGroups[item.href]);
                  const panelId = `${navId}-${item.href.replace(/[^a-zA-Z0-9]/g, "-")}`;

                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggleGroup(item.href)}
                        className={cn(
                          "group flex min-h-10 w-full items-center gap-3 rounded-full px-3.5 py-2 text-left text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                          groupActive
                            ? "bg-accent/[0.06] font-semibold text-accent-strong"
                            : "font-medium text-text-muted hover:bg-canvas hover:text-text",
                        )}
                      >
                        {item.icon ? (
                          <span
                            className={cn(
                              "grid h-5 w-5 shrink-0 place-items-center transition-colors",
                              groupActive
                                ? "text-accent"
                                : "text-text-muted group-hover:text-text",
                            )}
                          >
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        <ChevronDownIcon
                          className={cn(
                            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>

                      {isOpen ? (
                        <ul
                          id={panelId}
                          className="mt-1 ml-6 flex flex-col gap-0.5 border-l-2 border-accent/25 pl-2.5"
                        >
                          {item.children?.map((child) => {
                            const exact = isExactMatch(child.href, activePath);
                            const siblingHasExact = Boolean(
                              item.children?.some((sibling) =>
                                isExactMatch(sibling.href, activePath),
                              ),
                            );
                            const childActive =
                              exact ||
                              (!siblingHasExact &&
                                child.href === item.href &&
                                Boolean(activePath?.startsWith(`${item.href}/`)));

                            const childContent = (
                              <>
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "h-1.5 w-1.5 shrink-0 rounded-full",
                                    childActive
                                      ? "bg-accent"
                                      : "bg-border group-hover:bg-text-muted",
                                  )}
                                />
                                <span className="truncate">{child.label}</span>
                                {child.badge ? (
                                  <span
                                    className={cn(
                                      "ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                                      childActive
                                        ? "bg-accent/15 text-accent-strong"
                                        : "bg-canvas text-text-muted",
                                    )}
                                  >
                                    {child.badge}
                                  </span>
                                ) : null}
                              </>
                            );

                            return (
                              <li key={child.href}>
                                {renderNavAnchor(
                                  child,
                                  childActive,
                                  leafLinkClasses(childActive, true),
                                  childContent,
                                  false,
                                  renderLink,
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {utilityItems?.length ? (
        <div
          className={cn(
            "border-t border-border/50 py-2.5",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <ul className="flex flex-col gap-1">
            {utilityItems.map((utility) => {
              const classes = cn(
                "group flex items-center rounded-full text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                collapsed
                  ? "mx-auto h-10 w-10 justify-center p-0"
                  : "min-h-10 w-full gap-3 px-3.5 py-2 text-left",
                utility.active
                  ? "bg-accent/10 font-semibold text-accent-strong"
                  : "text-text-muted hover:bg-canvas hover:text-text",
              );

              const content = (
                <>
                  {utility.icon ? (
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center",
                        utility.active
                          ? "text-accent"
                          : "text-text-muted group-hover:text-text",
                      )}
                    >
                      {utility.icon}
                    </span>
                  ) : null}
                  {!collapsed ? (
                    <span className="min-w-0 flex-1 truncate">
                      {utility.label}
                    </span>
                  ) : null}
                  {!collapsed && utility.badge ? (
                    <span className="ml-auto rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-text-muted">
                      {utility.badge}
                    </span>
                  ) : null}
                </>
              );

              return (
                <li key={utility.id}>
                  {utility.href ? (
                    <a
                      href={utility.href}
                      className={classes}
                      aria-label={collapsed ? utility.label : undefined}
                      title={collapsed ? utility.label : undefined}
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={utility.onClick}
                      data-close-navigation="true"
                      aria-label={collapsed ? utility.label : undefined}
                      title={collapsed ? utility.label : undefined}
                      className={classes}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {footer && !collapsed ? (
        <div className="border-t border-border/50 p-3">{footer}</div>
      ) : null}
    </div>
  );
}
