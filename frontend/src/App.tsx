import {
  Alert,
  AppShell,
  Badge,
  Button,
  HelpCircleIcon,
  LoadingState,
  LogOutIcon,
  Sidebar,
  Topbar,
  UsersIcon,
} from "@freshfold/ui";
import type { Role } from "@laundry/contracts";
import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { createAppApi, readApiConfig } from "./api/adapters";
import { ApiProvider, useApi } from "./api/context";
import type { AppApi } from "./api/types";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { readSupabaseAuthConfig } from "./auth/supabase-config";
import { createAccessTokenStore } from "./auth/token-store";
import { CalendarPage } from "./features/calendar/CalendarPage";
import { Dashboard } from "./features/dashboard/Dashboard";
import { CustomerDetailPage } from "./features/customers/CustomerDetailPage";
import { CustomersPage } from "./features/customers/CustomersPage";
import { DeliveriesPage } from "./features/deliveries/DeliveriesPage";
import { AuthCallbackPage } from "./features/auth/AuthCallbackPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { LoginPage } from "./features/auth/LoginPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { CreateOrderPage } from "./features/orders/CreateOrderPage";
import { OrderDetailPage } from "./features/orders/OrderDetailPage";
import { OrdersPage } from "./features/orders/OrdersPage";
import { ComingSoonPage } from "./features/shared/ComingSoonPage";
import {
  HelpGuideModal,
  NotificationsMenu,
  navigationSections,
  pageMeta,
  roleLabel,
} from "./features/shell";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { formatToday } from "./lib/format";
import { syncLogger } from "./lib/logger";

function useReconnectFlush(api: AppApi) {
  useEffect(() => {
    const flush = () => {
      syncLogger.info("network_online_flushing");
      void api.syncPendingMutations().catch((err) => {
        syncLogger.error("flush_reconnect_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    };
    window.addEventListener("online", flush);
    void api
      .getPendingCount()
      .then((pendingCount) => {
        syncLogger.info("offline_storage_ready", { pendingCount });
      })
      .catch((err) => {
        syncLogger.error("offline_storage_check_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      window.removeEventListener("online", flush);
    };
  }, [api]);
}

function SessionLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <LoadingState label="Checking your session" rows={2} />
      </div>
    </main>
  );
}

function SessionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <Alert
          tone="danger"
          title="We could not check your session"
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {message}
        </Alert>
      </div>
    </main>
  );
}

function Workspace() {
  const api = useApi();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [globalSearch, setGlobalSearch] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  useReconnectFlush(api);

  useEffect(() => {
    if (location.pathname === "/orders") {
      const params = new URLSearchParams(location.search);
      setGlobalSearch(params.get("q") ?? "");
    }
  }, [location.pathname, location.search]);

  if (auth.state.status !== "authenticated") {
    return null;
  }

  const session = auth.state.session;
  const role = session.user.role;
  const meta = pageMeta(location.pathname);

  if (role === "service") {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4">
        <div className="w-full max-w-md">
          <Alert
            tone="warning"
            title="This workspace is for front desk and manager accounts."
            action={
              <Button variant="secondary" size="sm" onClick={() => void auth.logout()}>
                Sign out
              </Button>
            }
          >
            Ask your manager for a staff account.
          </Alert>
        </div>
      </main>
    );
  }

  const switchRole = () => {
    const nextRole: Role = role === "manager" ? "front_desk" : "manager";
    api.setRole(nextRole);
    void auth.refresh();
  };

  const handleGlobalSearchSubmit = (value: string) => {
    const trimmed = value.trim();
    navigate(trimmed ? `/orders?q=${encodeURIComponent(trimmed)}` : "/orders");
  };

  const userMenuItems = [
    ...(api.capabilities.roleSwitch
      ? [
          {
            id: "switch-role",
            label:
              role === "manager" ? "View as front desk" : "View as manager",
            icon: <UsersIcon className="h-4 w-4" />,
            onSelect: switchRole,
          },
        ]
      : []),
    {
      id: "help",
      label: "Help & guide",
      icon: <HelpCircleIcon className="h-4 w-4" />,
      onSelect: () => setHelpOpen(true),
    },
    {
      id: "sign-out",
      label: "Sign out",
      icon: <LogOutIcon className="h-4 w-4" />,
      onSelect: () => void auth.logout(),
      tone: "danger" as const,
    },
  ];

  return (
    <>
      <AppShell
        sidebar={({ collapsed, toggleCollapsed }) => (
          <Sidebar
            sections={navigationSections}
            utilityItems={[
              {
                id: "help",
                label: "Help & guide",
                icon: <HelpCircleIcon className="h-5 w-5" />,
                onClick: () => setHelpOpen(true),
                active: helpOpen,
              },
            ]}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
            activePath={location.pathname}
            renderLink={(item, props) => (
              <NavLink
                to={item.href}
                end={item.href === "/" || item.href === "/orders"}
                className={props.className}
                aria-current={props["aria-current"]}
                aria-label={props["aria-label"]}
                title={props.title}
              >
                {props.children}
              </NavLink>
            )}
            footer={
              <div className="rounded-lg bg-canvas/80 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      online ? "bg-success" : "bg-warning"
                    }`}
                  />
                  <p className="truncate text-xs font-semibold text-text">
                    {session.hub.name}
                  </p>
                </div>
                <p className="mt-1 pl-4 text-xs leading-5 text-text-muted">
                  {roleLabel(role)} ·{" "}
                  {api.mode === "mock"
                    ? "Demo data"
                    : "Changes save on this device."}
                </p>
              </div>
            }
          />
        )}
        topbar={({ openNavigation }) => (
          <Topbar
            title={meta.title}
            breadcrumbs={meta.breadcrumbs}
            renderBreadcrumbLink={(crumb, className) => (
              <Link to={crumb.href ?? "/"} className={className}>
                {crumb.label}
              </Link>
            )}
            subtitle={`${formatToday()} · ${session.hub.name}`}
            search={{
              value: globalSearch,
              onChange: setGlobalSearch,
              onSubmit: handleGlobalSearchSubmit,
              placeholder: "Search orders or customers",
              label: "Search orders or customers",
            }}
            actions={
              <>
                <Badge tone={online ? "success" : "warning"} dot>
                  {online ? "Online" : "Offline"}
                </Badge>
                {api.mode === "mock" ? (
                  <Badge tone="accent">Demo</Badge>
                ) : null}
              </>
            }
            notifications={
              <NotificationsMenu
                api={api}
                online={online}
                pathname={location.pathname}
              />
            }
            user={{ name: session.user.name, role: roleLabel(role) }}
            userMenuHeader={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-text-muted">
                  {session.hub.name}
                </span>
                {api.mode === "mock" ? (
                  <Badge tone="accent">Demo</Badge>
                ) : null}
              </div>
            }
            userMenuItems={userMenuItems}
            onMenuClick={openNavigation}
          />
        )}
      >
        <Routes key={role}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<CreateOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
          <Route
            path="*"
            element={
              <ComingSoonPage
                title="Page not found"
                description="The page you asked for is not available."
              />
            }
          />
        </Routes>
      </AppShell>

      <HelpGuideModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        hubName={session.hub.name}
      />
    </>
  );
}

interface RouteLocationState {
  from?: { pathname?: string; search?: string };
}

function intendedPath(state: unknown): string {
  const from = (state as RouteLocationState | null)?.from;
  return from?.pathname ? `${from.pathname}${from.search ?? ""}` : "/";
}

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.state.status === "loading") {
    return <SessionLoading />;
  }
  if (auth.state.status === "error") {
    return (
      <SessionError
        message={auth.state.message}
        onRetry={() => void auth.refresh()}
      />
    );
  }
  if (auth.state.status === "password_recovery") {
    return <Navigate to="/reset-password" replace />;
  }
  if (auth.state.status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.state.status === "loading") {
    return <SessionLoading />;
  }
  if (auth.state.status === "password_recovery") {
    return <Navigate to="/reset-password" replace />;
  }
  if (auth.state.status === "authenticated") {
    return <Navigate to={intendedPath(location.state)} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnly>
            <ForgotPasswordPage />
          </PublicOnly>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login/callback" element={<AuthCallbackPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Workspace />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export interface AppProps {
  api?: AppApi;
}

export function App({ api: providedApi }: AppProps = {}) {
  const [tokenStore] = useState(() => createAccessTokenStore());
  const [bearerAuthRequired] = useState(() => {
    try {
      return Boolean(readSupabaseAuthConfig(import.meta.env));
    } catch {
      return true;
    }
  });
  const [api] = useState(
    () =>
      providedApi ??
      createAppApi(readApiConfig(), {
        getAccessToken: () => tokenStore.get(),
        setAccessToken: (token) => tokenStore.set(token),
        requireBearerAuth: bearerAuthRequired,
      }),
  );

  return (
    <ApiProvider api={api}>
      <AuthProvider tokenStore={tokenStore}>
        <AppRoutes />
      </AuthProvider>
    </ApiProvider>
  );
}
