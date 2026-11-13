declare const require: (module: string) => any;
declare const process: { cwd: () => string };

export function createTestD1Database(): D1Database {
  const fs = require('node:fs');
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');

  const sqlite = new DatabaseSync(':memory:');

  // Load and apply migrations
  const candidates = [
    path.resolve(process.cwd(), 'migrations/laundry'),
    path.resolve(process.cwd(), '../migrations/laundry'),
  ];
  const migrationsDir = candidates.find((d: string) => fs.existsSync(d));
  if (!migrationsDir) {
    throw new Error('Cannot find migrations/laundry directory');
  }
  const m1 = fs.readFileSync(path.join(migrationsDir, '0001_core.sql'), 'utf8');
  const m2 = fs.readFileSync(path.join(migrationsDir, '0002_indexes.sql'), 'utf8');
  const m3 = fs.readFileSync(path.join(migrationsDir, '0003_multi_tenant_local_first.sql'), 'utf8');

  sqlite.exec(m1);
  sqlite.exec(m2);
  sqlite.exec(m3);

  class PreparedStatement {
    private query: string;
    private boundValues: unknown[] = [];

    constructor(query: string, values: unknown[] = []) {
      this.query = query;
      this.boundValues = values;
    }

    bind(...values: unknown[]): D1PreparedStatement {
      return new PreparedStatement(this.query, values) as unknown as D1PreparedStatement;
    }

    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      try {
        const stmt = sqlite.prepare(this.query);
        const row = stmt.get(...(this.boundValues as any[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as unknown as T) ?? null;
        return row as unknown as T;
      } catch (err) {
        throw err;
      }
    }

    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      try {
        const stmt = sqlite.prepare(this.query);
        const results = stmt.all(...(this.boundValues as any[])) as T[];
        return {
          results,
          success: true,
          meta: {} as any,
        };
      } catch (err) {
        throw err;
      }
    }

    async raw(): Promise<any> {
      return [];
    }

    async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      try {
        const stmt = sqlite.prepare(this.query);
        stmt.run(...(this.boundValues as any[]));
        return {
          results: [] as T[],
          success: true,
          meta: {} as any,
        };
      } catch (err) {
        throw err;
      }
    }

    getInternal() {
      return { query: this.query, values: this.boundValues };
    }
  }

  const d1 = {
    prepare(query: string): D1PreparedStatement {
      return new PreparedStatement(query) as unknown as D1PreparedStatement;
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN TRANSACTION');
      try {
        const responses: D1Result<T>[] = [];
        for (const s of statements) {
          const { query, values } = (s as unknown as PreparedStatement).getInternal();
          const stmt = sqlite.prepare(query);
          stmt.run(...(values as any[]));
          responses.push({ results: [] as T[], success: true, meta: {} as any });
        }
        sqlite.exec('COMMIT');
        return responses;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },

    async exec(query: string): Promise<D1ExecResult> {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },

    dump(): Promise<ArrayBuffer> {
      throw new Error('Not implemented in test helper');
    },
  };

  return d1 as unknown as D1Database;
}
