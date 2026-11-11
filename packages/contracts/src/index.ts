import { z } from "zod";

export * from "./auth";
export * from "./calendar";
export * from "./changes";
export * from "./http";
export * from "./mutations";
export * from "./notifications";
export * from "./orders";
export * from "./queue-messages";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
