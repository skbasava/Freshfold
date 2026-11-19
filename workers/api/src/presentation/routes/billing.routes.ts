import { Hono } from "hono";
import {
  allocatePaymentSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createRefundSchema,
  cursorQuerySchema,
  paymentWebhookSchema,
} from "../../application/dto/schemas";
import { UnauthorizedError } from "../../shared/errors";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const billingRoutes = new Hono<ApiHonoEnv>();

/* Order & Customer Billing Summaries */
billingRoutes.get("/orders/:id/billing", requireAuth, async (c) => {
  const orderId = parsePositiveIntParam(c.req.param("id"));
  const summary = await c.var.container.billingUseCases.getOrderBillingSummary(orderId);
  return c.json({ data: summary }, 200);
});

billingRoutes.post("/orders/:id/payments", requireAuth, async (c) => {
  const orderId = parsePositiveIntParam(c.req.param("id"));
  const rawBody = (await c.req.json()) as {
    paymentMethod: any;
    amountPaise: number;
    notes?: string;
  };
  const idempotencyKey =
    c.req.header("idempotency-key") ??
    c.req.header("x-idempotency-key") ??
    null;

  const result = await c.var.container.billingUseCases.recordOrderPayment({
    orderId,
    paymentMethod: rawBody.paymentMethod,
    amountPaise: rawBody.amountPaise,
    notes: rawBody.notes,
    idempotencyKey,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ data: result }, 201);
});

billingRoutes.get("/customers/:id/billing", requireAuth, async (c) => {
  const customerId = parsePositiveIntParam(c.req.param("id"));
  const summary = await c.var.container.billingUseCases.getCustomerBillingSummary(customerId);
  return c.json({ data: summary }, 200);
});

/* Invoices */
billingRoutes.post("/orders/:id/invoices", requireAuth, async (c) => {
  const orderId = parsePositiveIntParam(c.req.param("id"));
  const rawBody = await c.req.text();
  const parsed = createInvoiceSchema.parse(rawBody ? JSON.parse(rawBody) : {});
  const created = await c.var.container.billingUseCases.createInvoiceForOrder(
    orderId,
    {
      ...parsed,
      actorUserId: c.var.actor?.id ?? null,
      requestId: c.var.requestId,
    },
  );
  return c.json({ data: created }, 201);
});

billingRoutes.get("/invoices", requireAuth, async (c) => {
  const q = cursorQuerySchema.parse({
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const page = await c.var.container.billingUseCases.listInvoices({
    customerId: parseOptionalIntQuery(c.req.query("customerId"), "customerId"),
    orderId: parseOptionalIntQuery(c.req.query("orderId"), "orderId"),
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

billingRoutes.get("/invoices/:id", requireAuth, async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const invoice = await c.var.container.billingUseCases.getInvoice(id);
  return c.json({ data: invoice }, 200);
});

billingRoutes.put("/invoices/:id/pdf", requireAuth, async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const bytes = await c.req.arrayBuffer();
  const updated = await c.var.container.billingUseCases.uploadInvoicePdf({
    invoiceId: id,
    bytes,
  });
  return c.json({ data: updated }, 200);
});

billingRoutes.get("/invoices/:id/pdf", requireAuth, async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const obj = await c.var.container.billingUseCases.downloadInvoicePdf(id);
  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": obj.contentType,
      "content-length": String(obj.sizeBytes),
      "content-disposition": `inline; filename="invoice-${id}.pdf"`,
    },
  });
});

/* Payments, Allocations & Refunds */
billingRoutes.post("/payments", requireAuth, async (c) => {
  const body = createPaymentSchema.parse(await c.req.json());
  const idempotencyKey =
    c.req.header("idempotency-key") ??
    c.req.header("x-idempotency-key") ??
    null;

  const result = await c.var.container.billingUseCases.createPayment({
    ...body,
    idempotencyKey,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });

  if (result.replayed) {
    c.header("x-idempotent-replayed", "true");
  }
  return c.json({ data: result.data }, result.statusCode as 201);
});

billingRoutes.get("/payments", requireAuth, async (c) => {
  const q = cursorQuerySchema.parse({
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const page = await c.var.container.billingUseCases.listPayments({
    customerId: parseOptionalIntQuery(c.req.query("customerId"), "customerId"),
    orderId: parseOptionalIntQuery(c.req.query("orderId"), "orderId"),
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

billingRoutes.get("/payments/:id", requireAuth, async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const payment = await c.var.container.billingUseCases.getPayment(id);
  return c.json({ data: payment }, 200);
});

billingRoutes.post("/payments/:id/allocations", requireAuth, async (c) => {
  const paymentId = parsePositiveIntParam(c.req.param("id"));
  const body = allocatePaymentSchema.parse(await c.req.json());
  const result = await c.var.container.billingUseCases.allocatePayment(
    paymentId,
    {
      ...body,
      actorUserId: c.var.actor?.id ?? null,
    },
  );
  return c.json({ data: result }, 201);
});

billingRoutes.post("/payments/:id/refunds", requireAuth, async (c) => {
  const paymentId = parsePositiveIntParam(c.req.param("id"));
  const body = createRefundSchema.parse(await c.req.json());
  const result = await c.var.container.billingUseCases.createRefund(paymentId, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ data: result }, 201);
});

/* Signature-Verified Payment Provider Webhook (No Bearer JWT; HMAC-SHA256 verified) */
billingRoutes.post("/webhooks/payments", async (c) => {
  const secret = c.env.PAYMENT_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    throw new UnauthorizedError("Payment webhook secret is not configured");
  }
  const rawBody = await c.req.text();
  const signatureHeader = c.req.header("x-payment-signature");
  const payload = paymentWebhookSchema.parse(JSON.parse(rawBody));

  const result = await c.var.container.billingUseCases.handlePaymentWebhook({
    rawBody,
    signatureHeader,
    webhookSecret: secret,
    payload,
  });

  return c.json({ data: result }, 200);
});
