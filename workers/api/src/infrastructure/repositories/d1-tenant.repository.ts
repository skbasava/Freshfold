import { asc, eq } from "drizzle-orm";
import type {
  CreateTenantInput,
  TenantRecord,
  TenantRepository,
} from "../../domain/repositories/tenant.repository";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import { tenants } from "../db/schema";

export class D1TenantRepository implements TenantRepository {
  constructor(private readonly db: ApiDatabase) {}

  async findById(id: number): Promise<TenantRecord | null> {
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByCode(code: string): Promise<TenantRecord | null> {
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.code, code))
      .limit(1);
    return row ?? null;
  }

  async findAll(): Promise<TenantRecord[]> {
    return this.db
      .select()
      .from(tenants)
      .where(eq(tenants.status, "active"))
      .orderBy(asc(tenants.name));
  }

  async create(input: CreateTenantInput): Promise<TenantRecord> {
    try {
      const [row] = await this.db
        .insert(tenants)
        .values({
          code: input.code,
          name: input.name,
          slug: input.slug,
          planTier: input.planTier ?? "standard",
          status: "active",
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }
}
