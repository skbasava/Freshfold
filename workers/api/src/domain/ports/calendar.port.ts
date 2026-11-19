export interface CalendarEventPayload {
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  promisedDeliveryAt: string; // ISO timestamp
  serviceSummary: string; // e.g. "Wash & Fold (2.0 kg), Dry Cleaning (1 pcs)"
  totalAmountPaise: number;
  specialInstructions?: string | null;
}

export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  summary?: string;
  startIso?: string;
  endIso?: string;
  error?: string;
}

export interface CalendarPort {
  createShippingEvent(payload: CalendarEventPayload): Promise<CalendarEventResult>;
  getEvent(eventId: string): Promise<CalendarEventResult | null>;
}
