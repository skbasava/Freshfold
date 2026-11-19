import { Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary, WorkspaceShell } from "@/components/blocks";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AuthCallbackPage,
  AuthProvider,
  ForgotPasswordPage,
  LoginPage,
  PublicOnly,
  RequireAuth,
  ResetPasswordPage,
  type AuthService,
} from "@/features/auth";
import { CustomersPage } from "@/features/customers";
import { ItemsPage } from "@/features/catalog";
import { DashboardPage, type DashboardService } from "@/features/dashboard";
import { DeliveriesPage } from "@/features/deliveries";
import {
  CreateOrderPage,
  OrderDetailPage,
  OrdersPage,
  type OrdersService,
} from "@/features/orders";
import { SettingsPage } from "@/features/settings";

export interface AppRoutesProps {
  dashboardService?: DashboardService;
  ordersService?: OrdersService;
}

export function AppRoutes({
  dashboardService,
  ordersService,
}: AppRoutesProps = {}) {
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
      <Route path="/login/callback" element={<AuthCallbackPage />} />
      <Route
        path="/forgot-password"
        element={
          <PublicOnly>
            <ForgotPasswordPage />
          </PublicOnly>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <RequireAuth>
            <WorkspaceShell />
          </RequireAuth>
        }
      >
        <Route
          path="/"
          element={<DashboardPage dashboardService={dashboardService} />}
        />
        <Route
          path="/orders"
          element={<OrdersPage ordersService={ordersService} />}
        />
        <Route
          path="/orders/new"
          element={<CreateOrderPage ordersService={ordersService} />}
        />
        <Route
          path="/orders/:id"
          element={<OrderDetailPage ordersService={ordersService} />}
        />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/deliveries" element={<DeliveriesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export interface AppProps {
  authService?: AuthService;
  dashboardService?: DashboardService;
  ordersService?: OrdersService;
}

export function App({
  authService,
  dashboardService,
  ordersService,
}: AppProps = {}) {
  return (
    <TooltipProvider>
      <AuthProvider authService={authService}>
        <ErrorBoundary fallbackTitle="Application Error">
          <AppRoutes
            dashboardService={dashboardService}
            ordersService={ordersService}
          />
        </ErrorBoundary>
      </AuthProvider>
    </TooltipProvider>
  );
}
