export interface Clock {
  now(): Date;
  nowIso(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
};

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

export function addHoursIso(baseIso: string, hours: number): string {
  const ms = Date.parse(baseIso) + hours * 3_600_000;
  return new Date(ms).toISOString();
}
