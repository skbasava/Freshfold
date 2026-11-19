import { and, asc, desc, eq, isNull, like, lt, or } from "drizzle-orm";
import type {
  CatalogRepository,
  ItemAttributeRecord,
  ItemCategoryRecord,
  ItemRecord,
  ServiceCategoryRecord,
  ServiceRecord,
} from "../../domain/repositories/catalog.repository";
import type { PricingBasis } from "../../shared/constants";
import {
  buildCursorPage,
  type CursorPage,
  type CursorPayload,
} from "../../shared/pagination";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import {
  itemAttributes,
  itemCategories,
  items,
  serviceCategories,
  services,
} from "../db/schema";

export class D1CatalogRepository implements CatalogRepository {
  constructor(private readonly db: ApiDatabase) {}

  async createItemCategory(input: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
    nowIso: string;
  }): Promise<ItemCategoryRecord> {
    try {
      const [row] = await this.db
        .insert(itemCategories)
        .values({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async listItemCategories(includeInactive = false): Promise<ItemCategoryRecord[]> {
    return this.db
      .select()
      .from(itemCategories)
      .where(
        includeInactive
          ? undefined
          : and(eq(itemCategories.isActive, true), isNull(itemCategories.deletedAt)),
      )
      .orderBy(asc(itemCategories.sortOrder), asc(itemCategories.id));
  }

  async findItemCategoryById(id: number): Promise<ItemCategoryRecord | null> {
    const [row] = await this.db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.id, id))
      .limit(1);
    return row ?? null;
  }

  async createItem(input: {
    categoryId: number;
    code: string;
    name: string;
    description?: string | null;
    hsnSacCode?: string | null;
    nowIso: string;
  }): Promise<ItemRecord> {
    try {
      const [row] = await this.db
        .insert(items)
        .values({
          categoryId: input.categoryId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          hsnSacCode: input.hsnSacCode ?? null,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findItemById(id: number): Promise<ItemRecord | null> {
    const [row] = await this.db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .limit(1);
    return row ?? null;
  }

  async listItems(params: {
    categoryId?: number;
    search?: string;
    includeInactive?: boolean;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<ItemRecord>> {
    const conditions = [];
    if (params.categoryId !== undefined) {
      conditions.push(eq(items.categoryId, params.categoryId));
    }
    if (!params.includeInactive) {
      conditions.push(eq(items.isActive, true));
      conditions.push(isNull(items.deletedAt));
    }
    if (params.search && params.search.trim().length > 0) {
      const pattern = `%${params.search.trim()}%`;
      conditions.push(or(like(items.name, pattern), like(items.code, pattern)));
    }
    if (params.cursor) {
      conditions.push(
        or(
          lt(items.createdAt, params.cursor.createdAt),
          and(
            eq(items.createdAt, params.cursor.createdAt),
            lt(items.id, params.cursor.id),
          ),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(items)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(items.createdAt), desc(items.id))
      .limit(params.limit + 1);

    return buildCursorPage(rows, params.limit);
  }

  async updateItem(
    id: number,
    input: {
      name?: string;
      description?: string | null;
      hsnSacCode?: string | null;
      imageR2Key?: string | null;
      imageContentType?: string | null;
      imageSizeBytes?: number | null;
      isActive?: boolean;
      nowIso: string;
    },
  ): Promise<ItemRecord | null> {
    try {
      const patch: Partial<typeof items.$inferInsert> = {
        updatedAt: input.nowIso,
      };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.hsnSacCode !== undefined) patch.hsnSacCode = input.hsnSacCode;
      if (input.imageR2Key !== undefined) patch.imageR2Key = input.imageR2Key;
      if (input.imageContentType !== undefined)
        patch.imageContentType = input.imageContentType;
      if (input.imageSizeBytes !== undefined)
        patch.imageSizeBytes = input.imageSizeBytes;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const [row] = await this.db
        .update(items)
        .set(patch)
        .where(eq(items.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async setItemAttribute(input: {
    itemId: number;
    attributeKey: string;
    attributeValue: string;
    nowIso: string;
  }): Promise<ItemAttributeRecord> {
    try {
      const [existing] = await this.db
        .select()
        .from(itemAttributes)
        .where(
          and(
            eq(itemAttributes.itemId, input.itemId),
            eq(itemAttributes.attributeKey, input.attributeKey),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await this.db
          .update(itemAttributes)
          .set({
            attributeValue: input.attributeValue,
            updatedAt: input.nowIso,
          })
          .where(eq(itemAttributes.id, existing.id))
          .returning();
        return updated!;
      }

      const [created] = await this.db
        .insert(itemAttributes)
        .values({
          itemId: input.itemId,
          attributeKey: input.attributeKey,
          attributeValue: input.attributeValue,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return created!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async listItemAttributes(itemId: number): Promise<ItemAttributeRecord[]> {
    return this.db
      .select()
      .from(itemAttributes)
      .where(eq(itemAttributes.itemId, itemId))
      .orderBy(asc(itemAttributes.attributeKey));
  }

  async createServiceCategory(input: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
    nowIso: string;
  }): Promise<ServiceCategoryRecord> {
    try {
      const [row] = await this.db
        .insert(serviceCategories)
        .values({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async listServiceCategories(
    includeInactive = false,
  ): Promise<ServiceCategoryRecord[]> {
    return this.db
      .select()
      .from(serviceCategories)
      .where(
        includeInactive
          ? undefined
          : and(
              eq(serviceCategories.isActive, true),
              isNull(serviceCategories.deletedAt),
            ),
      )
      .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.id));
  }

  async createService(input: {
    categoryId: number;
    code: string;
    name: string;
    description?: string | null;
    defaultPricingBasis: PricingBasis;
    defaultTaxRateId?: number | null;
    turnaroundHours?: number;
    nowIso: string;
  }): Promise<ServiceRecord> {
    try {
      const [row] = await this.db
        .insert(services)
        .values({
          categoryId: input.categoryId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          defaultPricingBasis: input.defaultPricingBasis,
          defaultTaxRateId: input.defaultTaxRateId ?? null,
          turnaroundHours: input.turnaroundHours ?? 48,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return {
        ...row!,
        defaultPricingBasis: row!.defaultPricingBasis as PricingBasis,
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findServiceById(id: number): Promise<ServiceRecord | null> {
    const [row] = await this.db
      .select()
      .from(services)
      .where(eq(services.id, id))
      .limit(1);
    return row
      ? { ...row, defaultPricingBasis: row.defaultPricingBasis as PricingBasis }
      : null;
  }

  async listServices(params?: {
    categoryId?: number;
    includeInactive?: boolean;
  }): Promise<ServiceRecord[]> {
    const conditions = [];
    if (params?.categoryId !== undefined) {
      conditions.push(eq(services.categoryId, params.categoryId));
    }
    if (!params?.includeInactive) {
      conditions.push(eq(services.isActive, true));
      conditions.push(isNull(services.deletedAt));
    }
    const rows = await this.db
      .select()
      .from(services)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(services.id));
    return rows.map((r) => ({
      ...r,
      defaultPricingBasis: r.defaultPricingBasis as PricingBasis,
    }));
  }
}
