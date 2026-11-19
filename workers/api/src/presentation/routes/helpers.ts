import { ValidationError } from "../../shared/errors";

export function parsePositiveIntParam(raw: string, name = "id"): number {
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new ValidationError(`Path parameter '${name}' must be a positive integer`);
  }
  return num;
}

export function parseOptionalIntQuery(
  raw: string | undefined,
  name: string,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new ValidationError(`Query parameter '${name}' must be a positive integer`);
  }
  return num;
}
