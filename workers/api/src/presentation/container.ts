import { BillingUseCases } from "../application/use-cases/billing.use-cases";
import { CatalogUseCases } from "../application/use-cases/catalog.use-cases";
import { CustomerUseCases } from "../application/use-cases/customer.use-cases";
import { DeliveryUseCases } from "../application/use-cases/delivery.use-cases";
import { HealthUseCases } from "../application/use-cases/health.use-cases";
import { OrderUseCases } from "../application/use-cases/order.use-cases";
import { PricingUseCases } from "../application/use-cases/pricing.use-cases";
import { createDbClient } from "../infrastructure/db/client";
import { HmacPaymentProviderAdapter } from "../infrastructure/payments/payment-provider.adapter";
import { D1BillingRepository } from "../infrastructure/repositories/d1-billing.repository";
import { D1CatalogRepository } from "../infrastructure/repositories/d1-catalog.repository";
import {
  D1BranchRepository,
  D1CustomerRepository,
} from "../infrastructure/repositories/d1-customer.repository";
import { D1TenantRepository } from "../infrastructure/repositories/d1-tenant.repository";
import { D1DeliveryRepository } from "../infrastructure/repositories/d1-delivery.repository";
import { D1OrderRepository } from "../infrastructure/repositories/d1-order.repository";
import { D1PricingRepository } from "../infrastructure/repositories/d1-pricing.repository";
import {
  D1AccessRepository,
  D1SystemRepository,
} from "../infrastructure/repositories/d1-system.repository";
import { GoogleCalendarAdapter } from "../infrastructure/calendar/google-calendar.adapter";
import type { CalendarPort } from "../domain/ports/calendar.port";
import { R2StorageAdapter } from "../infrastructure/storage/r2-storage.adapter";
import { systemClock, type Clock } from "../shared/time";
import type { ApiEnv, AppContainer } from "./types";

const DEFAULT_D1_CEILING_BYTES = 524_288_000; // 500 MB conservative ceiling

/**
 * Per-request composition root — avoids global database connections and wires
 * infrastructure adapters to pure application use cases via DI.
 */
export function createAppContainer(env: ApiEnv): AppContainer {
  const db = createDbClient(env.DB);
  const clock: Clock = env.TEST_NOW
    ? {
        now: () => env.TEST_NOW!(),
        nowIso: () => env.TEST_NOW!().toISOString(),
      }
    : systemClock;

  const tenants = new D1TenantRepository(db);
  const branches = new D1BranchRepository(db);
  const customers = new D1CustomerRepository(db);
  const catalog = new D1CatalogRepository(db);
  const pricing = new D1PricingRepository(db);
  const orders = new D1OrderRepository(db, env.DB);
  const billing = new D1BillingRepository(db, env.DB);
  const deliveries = new D1DeliveryRepository(db, env.DB);
  const access = new D1AccessRepository(db);
  const system = new D1SystemRepository(db, env.DB);
  const storage = new R2StorageAdapter(env.STORAGE);
  const paymentProvider = new HmacPaymentProviderAdapter();
  const calendar: CalendarPort =
    env.TEST_CALENDAR ??
    new GoogleCalendarAdapter({
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY,
      calendarId: env.GOOGLE_CALENDAR_ID,
    });

  const parsedCeiling = Number(env.D1_STORAGE_LIMIT_BYTES);
  const storageCeilingBytes =
    Number.isFinite(parsedCeiling) && parsedCeiling > 0
      ? parsedCeiling
      : DEFAULT_D1_CEILING_BYTES;

  return {
    tenants,
    branches,
    access,
    system,
    clock,
    calendar,
    customerUseCases: new CustomerUseCases({ branches, customers, system, clock }),
    catalogUseCases: new CatalogUseCases({ catalog, storage, clock }),
    pricingUseCases: new PricingUseCases({
      branches,
      customers,
      catalog,
      pricing,
      system,
      clock,
    }),
    orderUseCases: new OrderUseCases({
      branches,
      customers,
      catalog,
      pricing,
      orders,
      system,
      clock,
      calendar,
    }),
    billingUseCases: new BillingUseCases({
      branches,
      customers,
      orders,
      billing,
      storage,
      paymentProvider,
      system,
      clock,
    }),
    deliveryUseCases: new DeliveryUseCases({
      orders,
      customers,
      deliveries,
      system,
      clock,
    }),
    healthUseCases: new HealthUseCases({
      system,
      storage,
      clock,
      storageCeilingBytes,
    }),
  };
}
