const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function formatToday(date: Date = new Date()): string {
  return dateFormatter.format(date);
}

export function formatDeliveryTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

export function localDateKey(date: number | Date = new Date()): string {
  const parts = dateKeyFormatter.formatToParts(
    typeof date === "number" ? new Date(date) : date,
  );
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDateKey(dateKey: string): string {
  const timestamp = Date.parse(`${dateKey}T12:00:00+05:30`);
  if (Number.isNaN(timestamp)) {
    return dateKey;
  }
  return dateFormatter.format(new Date(timestamp));
}

export function formatDateTime(timestamp: number): string {
  return `${dateFormatter.format(new Date(timestamp))} · ${timeFormatter.format(
    new Date(timestamp),
  )}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const timestamp = Date.parse(`${dateKey}T12:00:00+05:30`);
  if (Number.isNaN(timestamp)) {
    return dateKey;
  }
  return localDateKey(timestamp + days * 24 * 60 * 60 * 1000);
}

export function formatPhoneMasked(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    return "•••••";
  }
  return `••••• ${digits.slice(-4)}`;
}
