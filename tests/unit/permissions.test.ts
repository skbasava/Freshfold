import { describe, expect, it } from "vitest";
import { can, isPermission } from "../../packages/domain/src/permissions";

describe("role permission matrix", () => {
  it("allows front desk to run the counter workflow", () => {
    expect(can("front_desk", "view_orders")).toBe(true);
    expect(can("front_desk", "create_order")).toBe(true);
    expect(can("front_desk", "update_order_status")).toBe(true);
    expect(can("front_desk", "view_calendar")).toBe(true);
  });

  it("denies front desk manager-only actions", () => {
    expect(can("front_desk", "reschedule_order")).toBe(false);
    expect(can("front_desk", "cancel_order")).toBe(false);
    expect(can("front_desk", "manage_calendar")).toBe(false);
    expect(can("front_desk", "manage_users")).toBe(false);
    expect(can("front_desk", "replay_dlq")).toBe(false);
  });

  it("allows managers to administer the hub", () => {
    expect(can("manager", "view_orders")).toBe(true);
    expect(can("manager", "reschedule_order")).toBe(true);
    expect(can("manager", "cancel_order")).toBe(true);
    expect(can("manager", "manage_calendar")).toBe(true);
    expect(can("manager", "manage_users")).toBe(true);
    expect(can("manager", "replay_dlq")).toBe(true);
  });

  it("limits service identities to internal service calls", () => {
    expect(can("service", "internal_service")).toBe(true);
    expect(can("service", "view_orders")).toBe(false);
    expect(can("service", "manage_users")).toBe(false);
  });

  it("recognizes only declared permissions", () => {
    expect(isPermission("view_orders")).toBe(true);
    expect(isPermission("delete_everything")).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});
