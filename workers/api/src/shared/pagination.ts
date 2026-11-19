import { ValidationError } from "./errors";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface CursorPayload {
  createdAt: string;
  id: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function clampPageLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return DEFAULT_PAGE_LIMIT;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError("limit must be a positive integer");
  }
  return Math.min(limit, MAX_PAGE_LIMIT);
}

export function encodeCursor(payload: CursorPayload): string {
  const raw = JSON.stringify(payload);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const padded =
      cursor.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (cursor.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as Partial<CursorPayload>;
    if (
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "number" ||
      !Number.isSafeInteger(parsed.id)
    ) {
      throw new Error("Invalid cursor payload");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new ValidationError("Invalid pagination cursor");
  }
}

export function buildCursorPage<T extends { id: number; createdAt: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
