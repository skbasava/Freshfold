export {
  DashboardPage,
  type DashboardPageProps,
} from "./pages/DashboardPage";
export {
  DashboardHeaderBlock,
  DashboardKpiRow,
  OrdersQueueCard,
  QuickActionsCard,
  type DashboardHeaderBlockProps,
  type DashboardKpiRowProps,
  type OrdersQueueCardProps,
} from "./components";
export {
  useDashboardData,
  type UseDashboardDataOptions,
  type UseDashboardDataReturn,
} from "./hooks/useDashboardData";
export {
  createDashboardService,
  defaultDashboardService,
} from "./services/dashboard.service";
export type {
  DashboardFetchOptions,
  DashboardKpiSummary,
  DashboardOrder,
  DashboardOrderFilter,
  DashboardService,
  DashboardSlot,
  DashboardSlotDay,
  DashboardSnapshot,
} from "./types/dashboard.types";
