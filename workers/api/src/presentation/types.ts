import type { BillingUseCases } from "../application/use-cases/billing.use-cases";
import type { CatalogUseCases } from "../application/use-cases/catalog.use-cases";
import type { CustomerUseCases } from "../application/use-cases/customer.use-cases";
import type { DeliveryUseCases } from "../application/use-cases/delivery.use-cases";
import type { HealthUseCases } from "../application/use-cases/health.use-cases";
import type { OrderUseCases } from "../application/use-cases/order.use-cases";
import type { PricingUseCases } from "../application/use-cases/pricing.use-cases";
import type { CalendarPort } from "../domain/ports/calendar.port";
import type { BranchRepository } from "../domain/repositories/customer.repository";
import type { TenantRepository } from "../domain/repositories/tenant.repository";
import type {
  AccessRepository,
  StaffUserRecord,
  SystemRepository,
} from "../domain/repositories/system.repository";
import type { SupabaseJwtVerifier } from "../infrastructure/auth/supabase-jwt";
import type { Clock } from "../shared/time";

export interface ApiEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
  ENVIRONMENT?: string;
  D1_STORAGE_LIMIT_BYTES?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWKS_URL?: string;
  SUPABASE_JWT_ISSUER?: string;
  SUPABASE_JWT_AUDIENCE?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_CALENDAR_ID?: string;
  /** Optional dependency injection hooks for deterministic tests */
  TEST_SUPABASE_VERIFIER?: SupabaseJwtVerifier;
  TEST_NOW?: () => Date;
  TEST_CALENDAR?: CalendarPort;
}

export interface AppContainer {
  tenants: TenantRepository;
  branches: BranchRepository;
  access: AccessRepository;
  system: SystemRepository;
  clock: Clock;
  calendar: CalendarPort;
  customerUseCases: CustomerUseCases;
  catalogUseCases: CatalogUseCases;
  pricingUseCases: PricingUseCases;
  orderUseCases: OrderUseCases;
  billingUseCases: BillingUseCases;
  deliveryUseCases: DeliveryUseCases;
  healthUseCases: HealthUseCases;
}

export interface HonoVariables {
  requestId: string;
  container: AppContainer;
  actor: StaffUserRecord | null;
}

export interface ApiHonoEnv {
  Bindings: ApiEnv;
  Variables: HonoVariables;
}
