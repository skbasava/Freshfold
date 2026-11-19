const BUSINESS_TIMEZONE = "Asia/Kolkata";

export function formatTodayLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TIMEZONE,
  }).format(date);
}

export function getTimeGreeting(date: Date = new Date()): string {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: BUSINESS_TIMEZONE,
  }).format(date);
  const hour = Number.parseInt(hourStr, 10);

  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function getOffsetDateKey(
  offsetDays = 0,
  baseDate: Date = new Date(),
): string {
  const shifted = new Date(baseDate.getTime() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  }).formatToParts(shifted);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getTodayDateKey(date: Date = new Date()): string {
  return getOffsetDateKey(0, date);
}
