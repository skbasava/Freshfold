import {
  GoogleAccessTokenProvider,
  GoogleCalendarClient,
  type GoogleCalendarEvent,
} from "@laundry/calendar-client";
import type {
  CalendarEventPayload,
  CalendarEventResult,
  CalendarPort,
} from "../../domain/ports/calendar.port";

export interface GoogleCalendarConfig {
  serviceAccountEmail?: string;
  privateKey?: string;
  calendarId?: string;
}

export class GoogleCalendarAdapter implements CalendarPort {
  private client: GoogleCalendarClient | null = null;
  private calendarId: string | null = null;

  constructor(config: GoogleCalendarConfig) {
    if (config.serviceAccountEmail && config.privateKey && config.calendarId) {
      this.calendarId = config.calendarId;
      const tokenProvider = new GoogleAccessTokenProvider({
        credentials: {
          clientEmail: config.serviceAccountEmail,
          privateKey: config.privateKey,
        },
      });

      this.client = new GoogleCalendarClient({
        calendarId: config.calendarId,
        getAccessToken: () => tokenProvider.getAccessToken(),
      });
    }
  }

  async createShippingEvent(payload: CalendarEventPayload): Promise<CalendarEventResult> {
    if (!this.client || !this.calendarId) {
      // Graceful fallback when credentials are not configured (e.g. test / local dev without secrets)
      const simulatedStart = payload.promisedDeliveryAt;
      const simulatedEnd = new Date(
        new Date(payload.promisedDeliveryAt).getTime() + 60 * 60 * 1000,
      ).toISOString();

      return {
        success: true,
        eventId: `sim_${payload.orderNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        htmlLink: `https://calendar.google.com/calendar/r/eventedit?text=Ship+Order+${encodeURIComponent(payload.orderNumber)}`,
        summary: `📦 Ship Order #${payload.orderNumber} - ${payload.customerName}`,
        startIso: simulatedStart,
        endIso: simulatedEnd,
      };
    }

    try {
      const startIso = new Date(payload.promisedDeliveryAt).toISOString();
      const endIso = new Date(
        new Date(payload.promisedDeliveryAt).getTime() + 60 * 60 * 1000,
      ).toISOString();

      const inrAmount = (payload.totalAmountPaise / 100).toFixed(2);
      const deliveryAddress = payload.deliveryAddress ?? "In-Store Counter Pickup";
      const customerContact = payload.customerPhone
        ? `${payload.customerName} (${payload.customerPhone})`
        : payload.customerName;

      const description = [
        "📦 FRESHFOLD ORDER SHIPPING & DELIVERY DOCKET",
        "--------------------------------------------------",
        `Order Number: ${payload.orderNumber}`,
        `Customer: ${customerContact}`,
        `Shipping / Delivery Address: ${deliveryAddress}`,
        `Promised Delivery: ${startIso}`,
        `Total Amount: ₹${inrAmount}`,
        `Items to Ship: ${payload.serviceSummary}`,
        payload.specialInstructions
          ? `Special Instructions: ${payload.specialInstructions}`
          : null,
        "",
        "Status: Scheduled for Out-for-Delivery dispatch.",
      ]
        .filter(Boolean)
        .join("\n");

      // Valid Google Calendar event IDs must be lowercase base32hex/alphanumeric (5-1024 chars)
      const rawId = `ord${payload.orderId}${payload.orderNumber.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
      const safeEventId = rawId.padEnd(5, "0").slice(0, 1024);

      const event = await this.client.insert({
        id: safeEventId,
        summary: `📦 Ship Order #${payload.orderNumber} - ${payload.customerName}`,
        description,
        location: deliveryAddress,
        start: {
          dateTime: startIso,
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: endIso,
          timeZone: "Asia/Kolkata",
        },
        extendedProperties: {
          private: {
            orderId: String(payload.orderId),
            orderNumber: payload.orderNumber,
            appSource: "freshfold_laundry_erp",
          },
        },
      });

      return {
        success: true,
        eventId: event.id ?? safeEventId,
        htmlLink:
          event.htmlLink ??
          `https://calendar.google.com/calendar/r/eventedit?text=Ship+Order+${encodeURIComponent(payload.orderNumber)}`,
        summary: event.summary,
        startIso,
        endIso,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Google Calendar event creation error:", message);
      return {
        success: false,
        error: message,
      };
    }
  }

  async getEvent(eventId: string): Promise<CalendarEventResult | null> {
    if (!this.client) return null;
    try {
      const event: GoogleCalendarEvent | null = await this.client.get(eventId);
      if (!event) return null;
      return {
        success: true,
        eventId: event.id,
        htmlLink: event.htmlLink,
        summary: event.summary,
        startIso: "dateTime" in (event.start ?? {}) ? (event.start as { dateTime: string }).dateTime : undefined,
        endIso: "dateTime" in (event.end ?? {}) ? (event.end as { dateTime: string }).dateTime : undefined,
      };
    } catch {
      return null;
    }
  }
}
