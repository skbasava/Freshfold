export const BUSINESS_TIMEZONE = "Asia/Kolkata";
export const BUSINESS_OPEN_MINUTES = 9 * 60;
export const BUSINESS_CLOSE_MINUTES = 20 * 60;

export type SlotTimingError =
  | "past"
  | "outside_business_hours"
  | "invalid_range";

type SlotTiming = {
  starts_at: number;
  ends_at: number;
};

type ZonedParts = {
  dateKey: string;
  secondOfDay: number;
};

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(epochMs: number): ZonedParts {
  const parts = formatter.formatToParts(new Date(epochMs));
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const year = values.get("year") ?? "0000";
  const month = values.get("month") ?? "00";
  const day = values.get("day") ?? "00";
  const hour = Number(values.get("hour") ?? "0");
  const minute = Number(values.get("minute") ?? "0");
  const second = Number(values.get("second") ?? "0");

  return {
    dateKey: `${year}-${month}-${day}`,
    secondOfDay: hour * 3600 + minute * 60 + second,
  };
}

export function validateSlotTiming(
  slot: SlotTiming,
  now: number,
): SlotTimingError | null {
  if (
    !Number.isFinite(slot.starts_at) ||
    !Number.isFinite(slot.ends_at) ||
    slot.ends_at <= slot.starts_at
  ) {
    return "invalid_range";
  }

  if (slot.starts_at <= now) {
    return "past";
  }

  const start = zonedParts(slot.starts_at);
  const end = zonedParts(slot.ends_at);

  if (start.dateKey !== end.dateKey) {
    return "outside_business_hours";
  }

  const opensAt = BUSINESS_OPEN_MINUTES * 60;
  const closesAt = BUSINESS_CLOSE_MINUTES * 60;

  if (start.secondOfDay < opensAt || end.secondOfDay > closesAt) {
    return "outside_business_hours";
  }

  return null;
}
