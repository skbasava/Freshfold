import { assertOrderStatusTransition } from "../../domain/entities/order";
import type {
  CalendarEventResult,
  CalendarPort,
} from "../../domain/ports/calendar.port";
import type { CatalogRepository } from "../../domain/repositories/catalog.repository";
import type {
  BranchRepository,
  CustomerRepository,
} from "../../domain/repositories/customer.repository";
import type {
  OrderAdjustmentRecord,
  OrderNoteRecord,
  OrderRecord,
  OrderRepository,
  OrderWithDetails,
} from "../../domain/repositories/order.repository";
import type { PricingRepository } from "../../domain/repositories/pricing.repository";
import type { SystemRepository } from "../../domain/repositories/system.repository";
import {
  CURRENCY_INR,
  type OrderAdjustmentType,
  type OrderStatus,
} from "../../shared/constants";
import { NotFoundError, ValidationError } from "../../shared/errors";
import {
  clampPageLimit,
  decodeCursor,
  type CursorPage,
} from "../../shared/pagination";
import type { Clock } from "../../shared/time";
import {
  IdempotencyService,
  type IdempotentResult,
} from "../services/idempotency.service";
import {
  PricingEngineService,
  type QuoteLineInput,
} from "../services/pricing-engine.service";

export interface OrderUseCasesDeps {
  branches: BranchRepository;
  customers: CustomerRepository;
  catalog: CatalogRepository;
  pricing: PricingRepository;
  orders: OrderRepository;
  system: SystemRepository;
  clock: Clock;
  calendar: CalendarPort;
}

export class OrderUseCases {
  private readonly pricingEngine: PricingEngineService;
  private readonly idempotency: IdempotencyService;

  constructor(private readonly deps: OrderUseCasesDeps) {
    this.pricingEngine = new PricingEngineService({
      branches: deps.branches,
      customers: deps.customers,
      catalog: deps.catalog,
      pricing: deps.pricing,
      system: deps.system,
    });
    this.idempotency = new IdempotencyService(deps.system, deps.clock);
  }

  async createOrder(input: {
    customerId: number;
    rateCardId?: number;
    pickupAddressId?: number | null;
    deliveryAddressId?: number | null;
    placeOfSupplyStateCode?: string;
    promisedDeliveryAt?: string | null;
    specialInstructions?: string | null;
    lines: QuoteLineInput[];
    idempotencyKey?: string | null;
    actorUserId?: number | null;
    requestId?: string;
  }): Promise<IdempotentResult<OrderWithDetails>> {
    return this.idempotency.execute<OrderWithDetails>({
      operation: "orders.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        customerId: input.customerId,
        rateCardId: input.rateCardId ?? null,
        pickupAddressId: input.pickupAddressId ?? null,
        deliveryAddressId: input.deliveryAddressId ?? null,
        placeOfSupplyStateCode: input.placeOfSupplyStateCode ?? null,
        promisedDeliveryAt: input.promisedDeliveryAt ?? null,
        specialInstructions: input.specialInstructions ?? null,
        lines: input.lines,
      },
      statusCode: 201,
      run: async () => {
        const nowIso = this.deps.clock.nowIso();

        if (input.pickupAddressId) {
          const addr = await this.deps.customers.findAddressById(input.pickupAddressId);
          if (!addr || addr.customerId !== input.customerId) {
            throw new ValidationError("Invalid pickupAddressId for customer");
          }
        }
        let deliveryAddrState: string | undefined;
        if (input.deliveryAddressId) {
          const addr = await this.deps.customers.findAddressById(
            input.deliveryAddressId,
          );
          if (!addr || addr.customerId !== input.customerId) {
            throw new ValidationError("Invalid deliveryAddressId for customer");
          }
          deliveryAddrState = addr.stateCode;
        }

        const quote = await this.pricingEngine.calculateQuote({
          customerId: input.customerId,
          rateCardId: input.rateCardId,
          placeOfSupplyStateCode:
            input.placeOfSupplyStateCode ?? deliveryAddrState,
          asOfIso: nowIso,
          lines: input.lines,
        });

        const orderNumber = `ORD-${nowIso.slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        const branch = await this.deps.branches.findById(quote.branchId);
        const tenantId = branch?.tenantId ?? 1;

        const created = await this.deps.orders.createOrderAggregate({
          order: {
            tenantId,
            branchId: quote.branchId,
            customerId: quote.customerId,
            rateCardId: quote.rateCardId,
            pickupAddressId: input.pickupAddressId ?? null,
            deliveryAddressId: input.deliveryAddressId ?? null,
            orderNumber,
            status: "confirmed",
            currency: CURRENCY_INR,
            supplierStateCode: quote.supplierStateCode,
            placeOfSupplyStateCode: quote.placeOfSupplyStateCode,
            taxSupplyType: quote.taxSupplyType,
            subtotalPaise: quote.subtotalPaise,
            discountPaise: quote.discountPaise,
            taxableAmountPaise: quote.taxableAmountPaise,
            cgstPaise: quote.cgstPaise,
            sgstPaise: quote.sgstPaise,
            igstPaise: quote.igstPaise,
            totalTaxPaise: quote.totalTaxPaise,
            adjustmentsPaise: 0,
            totalAmountPaise: quote.totalAmountPaise,
            promisedDeliveryAt: input.promisedDeliveryAt ?? null,
            specialInstructions: input.specialInstructions ?? null,
            createdByUserId: input.actorUserId ?? null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          items: quote.lines.map((line) => ({
            ...line,
            createdAt: nowIso,
          })),
          initialStatusReason: "Order created and confirmed",
          changedByUserId: input.actorUserId ?? null,
        });

        await this.deps.system.recordAudit({
          actorUserId: input.actorUserId ?? null,
          action: "order.created",
          entityType: "order",
          entityId: String(created.order.id),
          requestId: input.requestId ?? null,
          summaryJson: JSON.stringify({
            orderNumber: created.order.orderNumber,
            totalAmountPaise: created.order.totalAmountPaise,
            lineCount: created.items.length,
          }),
          nowIso,
        });

        let calendarEvent: CalendarEventResult | undefined;
        try {
          const customer = await this.deps.customers.findById(input.customerId);
          let deliveryAddressText: string | null = null;
          if (created.order.deliveryAddressId) {
            const addr = await this.deps.customers.findAddressById(created.order.deliveryAddressId);
            if (addr) {
              deliveryAddressText = `${addr.line1}${addr.line2 ? `, ${addr.line2}` : ""}, ${addr.city}, ${addr.stateCode} ${addr.postalCode}`;
            }
          }

          const serviceSummary = created.items
            .map((it) => `${it.serviceNameSnapshot}${it.itemNameSnapshot ? ` (${it.itemNameSnapshot})` : ""}`)
            .join(", ");

          // Delivery/Ship date is promisedDeliveryAt or +48h standard turnaround
          const promisedShipDate =
            created.order.promisedDeliveryAt ??
            new Date(new Date(nowIso).getTime() + 48 * 60 * 60 * 1000).toISOString();

          calendarEvent = await this.deps.calendar.createShippingEvent({
            orderId: created.order.id,
            orderNumber: created.order.orderNumber,
            customerName: customer?.fullName ?? `Customer #${input.customerId}`,
            customerPhone: customer?.phone ?? null,
            deliveryAddress: deliveryAddressText,
            promisedDeliveryAt: promisedShipDate,
            serviceSummary: serviceSummary || "General Laundry Service",
            totalAmountPaise: created.order.totalAmountPaise,
            specialInstructions: created.order.specialInstructions,
          });

          if (calendarEvent && calendarEvent.success) {
            await this.deps.system.upsertSetting({
              key: `order_calendar_${created.order.id}`,
              value: calendarEvent,
              description: `Google Calendar shipping event for order #${created.order.orderNumber}`,
              updatedByUserId: input.actorUserId ?? null,
              nowIso,
            });

            await this.deps.system.recordAudit({
              actorUserId: input.actorUserId ?? null,
              action: "calendar.event_created",
              entityType: "order",
              entityId: String(created.order.id),
              requestId: input.requestId ?? null,
              summaryJson: JSON.stringify(calendarEvent),
              nowIso,
            });
          }
        } catch (calError) {
          console.error("Non-fatal Google Calendar sync error during order creation:", calError);
        }

        return {
          ...created,
          calendarEvent: calendarEvent ?? null,
        };
      },
    });
  }

  async getOrder(id: number): Promise<OrderWithDetails> {
    const details = await this.deps.orders.findWithDetails(id);
    if (!details) {
      throw new NotFoundError(`Order #${id} not found`);
    }
    const calendarEvent = await this.deps.system.getSetting<CalendarEventResult>(
      `order_calendar_${id}`,
    );
    return {
      ...details,
      calendarEvent: calendarEvent ?? null,
    };
  }

  async getOrderCalendarEvent(orderId: number): Promise<CalendarEventResult | null> {
    const event = await this.deps.system.getSetting<CalendarEventResult>(
      `order_calendar_${orderId}`,
    );
    return event ?? null;
  }

  async syncOrderCalendarEvent(
    orderId: number,
    actorUserId?: number | null,
  ): Promise<CalendarEventResult> {
    const details = await this.deps.orders.findWithDetails(orderId);
    if (!details) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }

    const customer = await this.deps.customers.findById(details.order.customerId);
    let deliveryAddressText: string | null = null;
    if (details.order.deliveryAddressId) {
      const addr = await this.deps.customers.findAddressById(details.order.deliveryAddressId);
      if (addr) {
        deliveryAddressText = `${addr.line1}${addr.line2 ? `, ${addr.line2}` : ""}, ${addr.city}, ${addr.stateCode} ${addr.postalCode}`;
      }
    }

    const serviceSummary = details.items
      .map((it) => `${it.serviceNameSnapshot}${it.itemNameSnapshot ? ` (${it.itemNameSnapshot})` : ""}`)
      .join(", ");

    const nowIso = this.deps.clock.nowIso();
    const promisedShipDate =
      details.order.promisedDeliveryAt ??
      new Date(new Date(nowIso).getTime() + 48 * 60 * 60 * 1000).toISOString();

    const result = await this.deps.calendar.createShippingEvent({
      orderId: details.order.id,
      orderNumber: details.order.orderNumber,
      customerName: customer?.fullName ?? `Customer #${details.order.customerId}`,
      customerPhone: customer?.phone ?? null,
      deliveryAddress: deliveryAddressText,
      promisedDeliveryAt: promisedShipDate,
      serviceSummary: serviceSummary || "General Laundry Service",
      totalAmountPaise: details.order.totalAmountPaise,
      specialInstructions: details.order.specialInstructions,
    });

    if (result.success) {
      await this.deps.system.upsertSetting({
        key: `order_calendar_${details.order.id}`,
        value: result,
        description: `Google Calendar shipping event for order #${details.order.orderNumber}`,
        updatedByUserId: actorUserId ?? null,
        nowIso,
      });

      await this.deps.system.recordAudit({
        actorUserId: actorUserId ?? null,
        action: "calendar.event_synced",
        entityType: "order",
        entityId: String(details.order.id),
        summaryJson: JSON.stringify(result),
        nowIso,
      });
    }

    return result;
  }

  listOrders(params: {
    tenantId?: number;
    branchId?: number;
    customerId?: number;
    status?: OrderStatus;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<OrderRecord>> {
    return this.deps.orders.list({
      tenantId: params.tenantId,
      branchId: params.branchId,
      customerId: params.customerId,
      status: params.status,
      limit: clampPageLimit(params.limit),
      cursor: params.cursor ? decodeCursor(params.cursor) : undefined,
    });
  }

  async transitionStatus(
    orderId: number,
    input: {
      toStatus: OrderStatus;
      reason?: string | null;
      actorUserId?: number | null;
      requestId?: string;
    },
  ): Promise<OrderRecord> {
    const existing = await this.deps.orders.findById(orderId);
    if (!existing) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }
    assertOrderStatusTransition(existing.status, input.toStatus);

    const nowIso = this.deps.clock.nowIso();
    const updated = await this.deps.orders.transitionStatus({
      orderId,
      fromStatus: existing.status,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
      changedByUserId: input.actorUserId ?? null,
      nowIso,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "order.status_changed",
      entityType: "order",
      entityId: String(orderId),
      requestId: input.requestId ?? null,
      summaryJson: JSON.stringify({
        fromStatus: existing.status,
        toStatus: input.toStatus,
      }),
      nowIso,
    });

    return updated;
  }

  async addNote(
    orderId: number,
    input: {
      note: string;
      isInternal: boolean;
      actorUserId?: number | null;
    },
  ): Promise<OrderNoteRecord> {
    const existing = await this.deps.orders.findById(orderId);
    if (!existing) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }
    return this.deps.orders.addNote({
      orderId,
      note: input.note,
      isInternal: input.isInternal,
      createdByUserId: input.actorUserId ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  async addAdjustment(
    orderId: number,
    input: {
      adjustmentType: OrderAdjustmentType;
      description: string;
      amountPaise: number;
      actorUserId?: number | null;
    },
  ): Promise<{ adjustment: OrderAdjustmentRecord; order: OrderRecord }> {
    const existing = await this.deps.orders.findById(orderId);
    if (!existing) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }
    if (existing.totalAmountPaise + input.amountPaise < 0) {
      throw new ValidationError("Adjustment would make order total negative");
    }
    return this.deps.orders.addAdjustment({
      orderId,
      adjustmentType: input.adjustmentType,
      description: input.description,
      amountPaise: input.amountPaise,
      createdByUserId: input.actorUserId ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  async updateOrder(
    id: number,
    input: {
      lines: QuoteLineInput[];
      specialInstructions?: string | null;
      promisedDeliveryAt?: string | null;
      actorUserId?: number | null;
      requestId?: string | null;
    },
  ): Promise<OrderWithDetails> {
    const existing = await this.deps.orders.findWithDetails(id);
    if (!existing) {
      throw new NotFoundError(`Order #${id} not found`);
    }

    if (existing.order.status === "delivered" || existing.order.status === "cancelled") {
      throw new ValidationError(`Cannot edit an order that is already ${existing.order.status}`);
    }

    if (!input.lines || input.lines.length === 0) {
      throw new ValidationError("An order must contain at least one line item");
    }

    const nowIso = this.deps.clock.nowIso();

    const quote = await this.pricingEngine.calculateQuote({
      customerId: existing.order.customerId,
      rateCardId: existing.order.rateCardId,
      placeOfSupplyStateCode: existing.order.placeOfSupplyStateCode,
      asOfIso: nowIso,
      lines: input.lines,
    });

    const updated = await this.deps.orders.updateOrderLines({
      orderId: id,
      items: quote.lines.map((line) => ({
        ...line,
        createdAt: nowIso,
      })),
      totals: {
        subtotalPaise: quote.subtotalPaise,
        discountPaise: quote.discountPaise,
        taxableAmountPaise: quote.taxableAmountPaise,
        cgstPaise: quote.cgstPaise,
        sgstPaise: quote.sgstPaise,
        igstPaise: quote.igstPaise,
        totalTaxPaise: quote.totalTaxPaise,
        totalAmountPaise: quote.totalAmountPaise,
      },
      specialInstructions: input.specialInstructions,
      promisedDeliveryAt: input.promisedDeliveryAt,
      changedByUserId: input.actorUserId ?? null,
      nowIso,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "order.lines_updated",
      entityType: "order",
      entityId: String(id),
      requestId: input.requestId ?? null,
      summaryJson: JSON.stringify({
        orderNumber: existing.order.orderNumber,
        oldTotalPaise: existing.order.totalAmountPaise,
        newTotalPaise: quote.totalAmountPaise,
        lineCount: quote.lines.length,
      }),
      nowIso,
    });

    return updated;
  }
}
