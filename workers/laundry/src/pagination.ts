import { listQuerySchema, type ListQuery } from "../../../packages/contracts/src/orders";

export type Cursor = {
  createdAt: number;
  id: string;
};

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify({ c: cursor.createdAt, i: cursor.id });
  return btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(value: string): Cursor | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { c?: unknown; i?: unknown };

    if (
      typeof parsed.c !== "number" ||
      !Number.isInteger(parsed.c) ||
      typeof parsed.i !== "string" ||
      parsed.i.length === 0
    ) {
      return null;
    }

    return { createdAt: parsed.c, id: parsed.i };
  } catch {
    return null;
  }
}

export function parseListQuery(
  query: Record<string, string | undefined>,
): ListQuery | null {
  const parsed = listQuerySchema.safeParse(query);
  return parsed.success ? parsed.data : null;
}
