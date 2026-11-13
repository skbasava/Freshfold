import type { Customer } from "@laundry/contracts";
import { formatDateKey, localDateKey } from "../lib/format";
import type { LocalOrderSyncState } from "../sync/types";
import type {
  AttentionItem,
  CustomerSummary,
  DashboardData,
  DashboardOrder,
  DeliverySlotStatus,
  DeliverySlotSummary,
  MockApiOptions,
  MockDeliverySlot,
  MockOrderItem,
  MockOrderSummary,
} from "./types";

export const MOCK_HUB_ID = "hub-mumbai";
export const MOCK_HUB_NAME = "Mumbai hub";
export const MOCK_TODAY = Date.parse("2026-11-11T09:00:00+05:30");
export const MOCK_NOW = Date.parse("2026-11-11T12:30:00+05:30");

export const MOCK_SERVICES = [
  "Wash and fold",
  "Wash and iron",
  "Dry clean",
  "Ironing",
];

export interface MockOrderRecord extends MockOrderSummary {
  items: MockOrderItem[];
}

export interface MockStore {
  todayKey: string;
  now: number;
  customers: Customer[];
  orders: MockOrderRecord[];
  slots: MockDeliverySlot[];
  nextOrderNumber: number;
  nextItemNumber: number;
}

function at(dayKey: string, hour: number, minute = 0): number {
  return Date.parse(
    `${dayKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0",
    )}:00+05:30`,
  );
}

function dayKeyFor(timestamp: number): string {
  return localDateKey(timestamp);
}

const TODAY_KEY = dayKeyFor(MOCK_TODAY);

function baseCustomers(): Customer[] {
  return [
    {
      id: "C-238",
      hubId: MOCK_HUB_ID,
      name: "Rahul Mehta",
      phone: "00000 00001",
      notes: "Prefers an evening delivery.",
      createdAt: at(TODAY_KEY, 9, 10),
      updatedAt: at(TODAY_KEY, 10, 5),
    },
    {
      id: "C-239",
      hubId: MOCK_HUB_ID,
      name: "Anita Rao",
      phone: "00000 00002",
      notes: null,
      createdAt: at(TODAY_KEY, 9, 25),
      updatedAt: at(TODAY_KEY, 9, 25),
    },
    {
      id: "C-240",
      hubId: MOCK_HUB_ID,
      name: "Karan Shah",
      phone: "00000 00003",
      notes: "Call before delivery.",
      createdAt: at(TODAY_KEY, 10, 0),
      updatedAt: at(TODAY_KEY, 10, 0),
    },
    {
      id: "C-241",
      hubId: MOCK_HUB_ID,
      name: "Meera Iyer",
      phone: "00000 00004",
      notes: null,
      createdAt: at(TODAY_KEY, 10, 15),
      updatedAt: at(TODAY_KEY, 11, 0),
    },
    {
      id: "C-242",
      hubId: MOCK_HUB_ID,
      name: "Sana Khan",
      phone: "00000 00005",
      notes: null,
      createdAt: at(TODAY_KEY, 11, 20),
      updatedAt: at(TODAY_KEY, 11, 20),
    },
    {
      id: "C-243",
      hubId: MOCK_HUB_ID,
      name: "Vikram Singh",
      phone: "00000 00006",
      notes: "Large family order.",
      createdAt: at(TODAY_KEY, 12, 0),
      updatedAt: at(TODAY_KEY, 12, 0),
    },
  ];
}

function item(
  id: string,
  description: string,
  quantity: number,
  serviceType: string | null = null,
): MockOrderItem {
  return { id, description, quantity, serviceType };
}

function order(
  customer: Customer,
  input: {
    id: string;
    status: MockOrderSummary["status"];
    serviceType: string;
    deliverySlotId: string | null;
    deliveryAt: number | null;
    version: number;
    createdAt: number;
    updatedAt: number;
    holdComment?: string | null;
    cancelledAt?: number | null;
    syncState?: LocalOrderSyncState;
    lastError?: string | null;
    items: MockOrderItem[];
  },
): MockOrderRecord {
  const totalItems = input.items.reduce(
    (total, current) => total + current.quantity,
    0,
  );

  return {
    id: input.id,
    customerId: customer.id,
    customerName: customer.name,
    status: input.status,
    serviceType: input.serviceType,
    deliverySlotId: input.deliverySlotId,
    deliveryAt: input.deliveryAt,
    version: input.version,
    holdComment: input.holdComment ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    cancelledAt: input.cancelledAt ?? null,
    totalItems,
    syncState: input.syncState ?? "synced",
    lastError: input.lastError ?? null,
    items: input.items,
  };
}

function baseOrders(
  customers: Customer[],
  syncIssues: boolean,
): MockOrderRecord[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const rahul = byId.get("C-238") as Customer;
  const anita = byId.get("C-239") as Customer;
  const karan = byId.get("C-240") as Customer;
  const meera = byId.get("C-241") as Customer;
  const sana = byId.get("C-242") as Customer;
  const vikram = byId.get("C-243") as Customer;

  return [
    order(rahul, {
      id: "ORD-1042",
      status: "processing",
      serviceType: "Wash and fold",
      deliverySlotId: "slot-1600",
      deliveryAt: at(TODAY_KEY, 16, 0),
      version: syncIssues ? 3 : 4,
      createdAt: at(TODAY_KEY, 9, 45),
      updatedAt: at(TODAY_KEY, 11, 30),
      syncState: syncIssues ? "pending" : "synced",
      items: [
        item("ITEM-1042-1", "Shirt", 2, "Wash and fold"),
        item("ITEM-1042-2", "Trousers", 2),
        item("ITEM-1042-3", "Bed sheet", 2),
      ],
    }),
    order(anita, {
      id: "ORD-1043",
      status: "confirmed",
      serviceType: "Wash and iron",
      deliverySlotId: "slot-1800",
      deliveryAt: at(TODAY_KEY, 18, 0),
      version: 2,
      createdAt: at(TODAY_KEY, 10, 10),
      updatedAt: at(TODAY_KEY, 10, 40),
      items: [
        item("ITEM-1043-1", "Shirt", 2),
        item("ITEM-1043-2", "Saree", 1, "Wash and iron"),
      ],
    }),
    order(karan, {
      id: "ORD-1044",
      status: "out_for_delivery",
      serviceType: "Dry clean",
      deliverySlotId: "slot-1400",
      deliveryAt: at(TODAY_KEY, 14, 0),
      version: 5,
      createdAt: at(TODAY_KEY, 8, 30),
      updatedAt: at(TODAY_KEY, 12, 10),
      items: [
        item("ITEM-1044-1", "Suit jacket", 1, "Dry clean"),
        item("ITEM-1044-2", "Trousers", 1),
      ],
    }),
    order(meera, {
      id: "ORD-1045",
      status: "hold",
      serviceType: "Wash and fold",
      deliverySlotId: "slot-1800",
      deliveryAt: at(TODAY_KEY, 19, 0),
      version: 3,
      createdAt: at(TODAY_KEY, 11, 0),
      updatedAt: at(TODAY_KEY, 11, 15),
      holdComment: "The customer asked us to check a stain before washing.",
      syncState: syncIssues ? "conflict" : "synced",
      lastError: syncIssues
        ? "This order changed on another device while you were offline."
        : null,
      items: [
        item("ITEM-1045-1", "Shirt", 3),
        item("ITEM-1045-2", "Trousers", 2),
      ],
    }),
    order(sana, {
      id: "ORD-1046",
      status: "delivered",
      serviceType: "Ironing",
      deliverySlotId: "slot-1200",
      deliveryAt: at(TODAY_KEY, 12, 0),
      version: 2,
      createdAt: at(TODAY_KEY, 7, 50),
      updatedAt: at(TODAY_KEY, 12, 5),
      items: [item("ITEM-1046-1", "Shirt", 4, "Ironing")],
    }),
    order(vikram, {
      id: "ORD-1047",
      status: "confirmed",
      serviceType: "Wash and fold",
      deliverySlotId: "slot-1800",
      deliveryAt: at(TODAY_KEY, 19, 30),
      version: 1,
      createdAt: at(TODAY_KEY, 12, 20),
      updatedAt: at(TODAY_KEY, 12, 20),
      syncState: syncIssues ? "rejected" : "synced",
      lastError: syncIssues
        ? "The server could not accept this change. Please try again."
        : null,
      items: [item("ITEM-1047-1", "Shirt", 8)],
    }),
  ];
}

interface SlotSeed {
  id: string;
  localDate: string;
  startsAt: number;
  endsAt: number;
  label: string;
  capacity: number;
  booked: number;
  closedReason?: string;
}

function slotSeeds(): SlotSeed[] {
  const seeds: SlotSeed[] = [];

  for (const [hour, label] of [
    [10, "10:00 AM – 12:00 PM"],
    [12, "12:00 – 2:00 PM"],
    [14, "2:00 – 4:00 PM"],
    [16, "4:00 – 6:00 PM"],
  ] as const) {
    seeds.push({
      id: `slot-1010-${hour}00`,
      localDate: "2026-11-10",
      startsAt: at("2026-11-10", hour),
      endsAt: at("2026-11-10", hour + 2),
      label,
      capacity: 12,
      booked: 5,
    });
  }

  seeds.push(
    {
      id: "slot-1200",
      localDate: TODAY_KEY,
      startsAt: at(TODAY_KEY, 12),
      endsAt: at(TODAY_KEY, 14),
      label: "12:00 – 2:00 PM",
      capacity: 12,
      booked: 12,
    },
    {
      id: "slot-1400",
      localDate: TODAY_KEY,
      startsAt: at(TODAY_KEY, 14),
      endsAt: at(TODAY_KEY, 16),
      label: "2:00 – 4:00 PM",
      capacity: 12,
      booked: 8,
    },
    {
      id: "slot-1600",
      localDate: TODAY_KEY,
      startsAt: at(TODAY_KEY, 16),
      endsAt: at(TODAY_KEY, 18),
      label: "4:00 – 6:00 PM",
      capacity: 12,
      booked: 9,
    },
    {
      id: "slot-1800",
      localDate: TODAY_KEY,
      startsAt: at(TODAY_KEY, 18),
      endsAt: at(TODAY_KEY, 20),
      label: "6:00 – 8:00 PM",
      capacity: 12,
      booked: 4,
    },
    {
      id: "slot-1202",
      localDate: "2026-11-12",
      startsAt: at("2026-11-12", 12),
      endsAt: at("2026-11-12", 14),
      label: "12:00 – 2:00 PM",
      capacity: 10,
      booked: 3,
    },
    {
      id: "slot-1402",
      localDate: "2026-11-12",
      startsAt: at("2026-11-12", 14),
      endsAt: at("2026-11-12", 16),
      label: "2:00 – 4:00 PM",
      capacity: 10,
      booked: 7,
    },
    {
      id: "slot-1602",
      localDate: "2026-11-12",
      startsAt: at("2026-11-12", 16),
      endsAt: at("2026-11-12", 18),
      label: "4:00 – 6:00 PM",
      capacity: 10,
      booked: 10,
    },
    {
      id: "slot-1802",
      localDate: "2026-11-12",
      startsAt: at("2026-11-12", 18),
      endsAt: at("2026-11-12", 20),
      label: "6:00 – 8:00 PM",
      capacity: 10,
      booked: 2,
      closedReason: "Hub closed for maintenance",
    },
  );

  return seeds;
}

function slotStatus(
  localDate: string,
  booked: number,
  capacity: number,
  closedReason: string | null,
  todayKey: string,
): DeliverySlotStatus {
  if (localDate < todayKey) {
    return "past";
  }
  if (closedReason) {
    return "closed";
  }
  if (booked >= capacity) {
    return "full";
  }
  return "open";
}

export function refreshSlot(slot: MockDeliverySlot, todayKey: string): void {
  slot.available = Math.max(0, slot.capacity - slot.booked);
  slot.status = slotStatus(
    slot.localDate,
    slot.booked,
    slot.capacity,
    slot.closedReason,
    todayKey,
  );
}

export function createMockStore(options: MockApiOptions = {}): MockStore {
  const todayKey = dayKeyFor(options.today ?? MOCK_TODAY);
  const customers = options.empty ? [] : baseCustomers();
  const orders = options.empty
    ? []
    : baseOrders(customers, options.syncIssues ?? true);
  const slots = options.empty
    ? []
    : slotSeeds().map((seed) => {
        const slot: MockDeliverySlot = {
          id: seed.id,
          localDate: seed.localDate,
          label: seed.label,
          startsAt: seed.startsAt,
          endsAt: seed.endsAt,
          capacity: seed.capacity,
          booked: seed.booked,
          available: Math.max(0, seed.capacity - seed.booked),
          status: "open",
          closedReason: seed.closedReason ?? null,
        };
        refreshSlot(slot, todayKey);
        return slot;
      });

  return {
    todayKey,
    now: options.today ?? MOCK_NOW,
    customers,
    orders,
    slots,
    nextOrderNumber: 1048,
    nextItemNumber: 1,
  };
}

export function toOrderSummary(order: MockOrderRecord): MockOrderSummary {
  const { items: _items, ...summary } = order;
  return summary;
}

export function dayKey(timestamp: number): string {
  return dayKeyFor(timestamp);
}

export function formatScheduleDate(dateKey: string): string {
  return formatDateKey(dateKey);
}

function attentionItems(syncIssues: boolean): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      id: "att-hold",
      orderId: "ORD-1045",
      customerName: "Meera Iyer",
      reason: "The customer asked us to check a stain before washing.",
      status: "hold",
      tone: "warning",
      actionLabel: "Open order",
      href: "/orders/ORD-1045",
    },
    {
      id: "att-delivery",
      orderId: "ORD-1042",
      customerName: "Rahul Mehta",
      reason: "Delivery is due in 2 hours and the order is not packed.",
      status: "processing",
      tone: "warning",
      actionLabel: "Open order",
      href: "/orders/ORD-1042",
    },
  ];

  if (syncIssues) {
    items.unshift({
      id: "att-conflict",
      orderId: "ORD-1045",
      customerName: "Meera Iyer",
      reason: "A change was made on another device while this order waited.",
      status: "conflict",
      tone: "danger",
      actionLabel: "Review changes",
      href: "/orders/ORD-1045",
    });
  }

  return items;
}

function emptyData(): DashboardData {
  return {
    summary: {
      ordersToday: 0,
      readyForDelivery: 0,
      outForDelivery: 0,
      needsAttention: 0,
      capacityUsed: 0,
      capacityTotal: 48,
    },
    attention: [],
    recentOrders: [],
    customers: [],
    deliverySlots: [],
    deliveryOrders: [],
  };
}

function toDashboardOrder(
  record: MockOrderRecord,
  customers: Customer[],
): DashboardOrder {
  const customer = customers.find((entry) => entry.id === record.customerId);
  return {
    id: record.id,
    customerName: record.customerName,
    customerPhone: customer?.phone ?? "",
    status: record.status,
    serviceType: record.serviceType,
    deliveryAt: record.deliveryAt,
    totalItems: record.totalItems,
    syncState: record.syncState,
    version: record.version,
  };
}

function toSlotSummary(slot: MockDeliverySlot): DeliverySlotSummary {
  return {
    id: slot.id,
    label: slot.label,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    capacity: slot.capacity,
    booked: slot.booked,
    available: slot.available,
  };
}

// Synthetic fixtures only. No real customer names, phone numbers, or orders.
export function createMockData(options: MockApiOptions = {}): DashboardData {
  if (options.empty) {
    return emptyData();
  }

  const store = createMockStore(options);
  const syncIssues = options.syncIssues ?? true;
  const attention = attentionItems(syncIssues);
  const recentOrders = store.orders.map((record) =>
    toDashboardOrder(record, store.customers),
  );
  const todaySlots = store.slots.filter(
    (slot) => slot.localDate === store.todayKey,
  );

  return {
    summary: {
      ordersToday: 24,
      readyForDelivery: 8,
      outForDelivery: 5,
      needsAttention: attention.length,
      capacityUsed: 31,
      capacityTotal: 48,
    },
    attention,
    recentOrders,
    customers: store.customers,
    deliverySlots: todaySlots.map(toSlotSummary),
    deliveryOrders: recentOrders.filter(
      (order) =>
        order.deliveryAt !== null &&
        order.status !== "delivered" &&
        order.status !== "cancelled",
    ),
  };
}
