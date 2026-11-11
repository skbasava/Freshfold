export function canonicalJsonStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? "null" : canonicalJsonStringify(item)))
      .join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`,
      );
    return `{${fields.join(",")}}`;
  }

  throw new TypeError(
    `Canonical JSON does not support values of type ${typeof value}`,
  );
}
