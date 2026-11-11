import {
  Alert,
  AppShell,
  Badge,
  Button,
  CalendarIcon,
  HomeIcon,
  LoadingState,
  OrdersIcon,
  Sidebar,
  Topbar,
  TruckIcon,
  UsersIcon,
  type SidebarItem,
} from "@freshfold/ui";
import type { Role } from "@laundry/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
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
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { formatToday } from "./lib/format";

const navigation: SidebarItem[] = [
  { label: "Dashboard", href: "/", icon: <HomeIcon className="h-5 w-5" /> },
  { label: "Orders", href: "/orders", icon: <OrdersIcon className="h-5 w-5" /> },
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
  {
    label: "Customers",
    href: "/customers",
    icon: <UsersIcon className="h-5 w-5" />,
  },
];

function pageTitle(pathname: string): string {
  if (pathname === "/orders/new") {
    return "New order";
  }
  if (pathname.startsWith("/orders/")) {
    return "Order details";
  }
  if (pathname.startsWith("/orders")) {
    return "Orders";
  }
  if (pathname.startsWith("/deliveries")) {
    return "Deliveries";
  }
  if (pathname.startsWith("/calendar")) {
    return "Calendar";
  }
  if (pathname.startsWith("/customers/")) {
    return "Customer details";
  }
  if (pathname.startsWith("/customers")) {
    return "Customers";
  }
  return "Dashboard";
}

function roleLabel(role: Role): string {
  switch (role) {
    case "manager":
      return "Manager";
    case "front_desk":
      return "Front desk";
    case "service":
      return "Service account";
  }
}

function useReconnectFlush(api: AppApi) {
  useEffect(() => {
    const flush = () => {
      void api.syncPendingMutations().catch(() => undefined);
    };
    window.addEventListener("online", flush);
    void api.getPendingCount().catch(() => undefined);
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
  const online = useOnlineStatus();
  useReconnectFlush(api);

  if (auth.state.status !== "authenticated") {
    return null;
  }

  const session = auth.state.session;
  const role = session.user.role;

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

  return (
    <AppShell
      sidebar={
        <Sidebar
          items={navigation}
          activePath={
            location.pathname === "/"
              ? "/"
              : `/${location.pathname.split("/")[1] ?? ""}`
          }
          renderLink={(item, props) => (
            <NavLink
              to={item.href}
              end={item.href === "/"}
              className={props.className}
              aria-current={props["aria-current"]}
            >
              {props.children}
            </NavLink>
          )}
          footer={
            <div className="rounded-md bg-canvas p-3">
              <p className="text-xs font-semibold text-text">
                {session.hub.name}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {roleLabel(role)} ·{" "}
                {api.mode === "mock"
                  ? "Demo data"
                  : "Changes save on this device."}
              </p>
            </div>
          }
        />
      }
      topbar={({ openNavigation }) => (
        <Topbar
          title={pageTitle(location.pathname)}
          subtitle={`${formatToday()} · ${session.hub.name}`}
          user={{ name: session.user.name, role: roleLabel(role) }}
          onMenuClick={openNavigation}
          actions={
            <>
              <Badge tone={online ? "success" : "warning"} dot>
                {online ? "Online" : "Offline"}
              </Badge>
              {api.mode === "mock" ? (
                <Badge tone="primary">Demo</Badge>
              ) : null}
              {api.capabilities.roleSwitch ? (
                <Button variant="secondary" size="sm" onClick={switchRole}>
                  {role === "manager" ? "View as front desk" : "View as manager"}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void auth.logout()}
              >
                Sign out
              </Button>
            </>
          }
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
