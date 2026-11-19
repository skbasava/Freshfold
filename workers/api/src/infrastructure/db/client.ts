import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import {
  ConflictError,
  InvariantViolationError,
  ValidationError,
} from "../../shared/errors";
import * as schema from "./schema";

export type ApiDatabase = DrizzleD1Database<typeof schema>;

export function createDbClient(d1: D1Database): ApiDatabase {
  return drizzle(d1, { schema });
}

/**
 * Translates SQLite/D1 constraint and trigger errors into typed application errors.
 */
export function mapSqliteError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("UNIQUE constraint failed")) {
    throw new ConflictError("Duplicate business identifier or unique constraint violation", {
      sqliteError: message,
    });
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    throw new InvariantViolationError(
      "Operation violates referential integrity (foreign key constraint)",
      { sqliteError: message },
    );
  }
  if (message.includes("CHECK constraint failed")) {
    throw new ValidationError("Value violates database CHECK constraint", {
      sqliteError: message,
    });
  }
  if (
    message.includes("Overlapping effective period") ||
    message.includes("immutable") ||
    message.includes("cannot be hard-deleted")
  ) {
    throw new InvariantViolationError(message);
  }

  throw error;
}
