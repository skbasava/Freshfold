import { and, asc, desc, eq, isNull, like, lt, or } from "drizzle-orm";
import type {
  BranchRecord,
  BranchRepository,
  CreateBranchInput,
  CreateCustomerAddressInput,
  CreateCustomerInput,
  CustomerAddressRecord,
  CustomerPreferenceRecord,
  CustomerRecord,
  CustomerRepository,
  UpdateCustomerInput,
  UpsertCustomerPreferencesInput,
} from "../../domain/repositories/customer.repository";
import type { AddressType } from "../../shared/constants";
import {
  buildCursorPage,
  type CursorPage,
  type CursorPayload,
} from "../../shared/pagination";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import {
  branches,
  customerAddresses,
  customerPreferences,
  customers,
  rateCardItems,
  rateCards,
} from "../db/schema";

export class D1BranchRepository implements BranchRepository {
  constructor(private readonly db: ApiDatabase) {}

  async findDefault(): Promise<BranchRecord | null> {
    const [row] = await this.db
      .select()
      .from(branches)
      .where(and(eq(branches.isDefault, true), eq(branches.isActive, true)))
      .limit(1);
    return row ?? null;
  }

  async findById(id: number): Promise<BranchRecord | null> {
    const [row] = await this.db
      .select()
      .from(branches)
      .where(eq(branches.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByCode(code: string): Promise<BranchRecord | null> {
    const [row] = await this.db
      .select()
      .from(branches)
      .where(eq(branches.code, code))
      .limit(1);
    return row ?? null;
  }

  async findByTenantId(tenantId: number): Promise<BranchRecord[]> {
    return this.db
      .select()
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), eq(branches.isActive, true)))
      .orderBy(asc(branches.name));
  }

  async create(input: CreateBranchInput): Promise<BranchRecord> {
    try {
      const [branch] = await this.db
        .insert(branches)
        .values({
          tenantId: input.tenantId,
          code: input.code,
          name: input.name,
          legalName: input.legalName ?? input.name,
          gstin: input.gstin ?? null,
          stateCode: input.stateCode ?? "29",
          addressLine1: input.addressLine1 ?? "Hub Location",
          addressLine2: input.addressLine2 ?? null,
          city: input.city ?? "Bengaluru",
          state: input.state ?? "Karnataka",
          postalCode: input.postalCode ?? "560001",
          phone: input.phone ?? "+919900000000",
          email: input.email ?? null,
          isDefault: Boolean(input.isDefault),
          isActive: input.isActive ?? true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();

      // Auto-clone default rate card for the new hub
      const [sourceRateCard] = await this.db
        .select()
        .from(rateCards)
        .where(
          and(
            eq(rateCards.tenantId, input.tenantId),
            eq(rateCards.isDefault, true),
            eq(rateCards.isActive, true),
          ),
        )
        .limit(1);

      if (sourceRateCard) {
        const [newRateCard] = await this.db
          .insert(rateCards)
          .values({
            tenantId: input.tenantId,
            branchId: branch!.id,
            code: `RATE_${input.code}_${Date.now().toString(36).toUpperCase()}`,
            name: `${input.name} Standard Rate Card`,
            description: `Auto-cloned rate card for hub ${input.name}`,
            isDefault: true,
            isActive: true,
            effectiveFrom: input.nowIso,
            effectiveTo: null,
            createdAt: input.nowIso,
            updatedAt: input.nowIso,
          })
          .returning();

        if (newRateCard) {
          const itemsToClone = await this.db
            .select()
            .from(rateCardItems)
            .where(
              and(
                eq(rateCardItems.rateCardId, sourceRateCard.id),
                eq(rateCardItems.isActive, true),
              ),
            );

          for (const item of itemsToClone) {
            await this.db.insert(rateCardItems).values({
              rateCardId: newRateCard.id,
              serviceId: item.serviceId,
              itemId: item.itemId,
              taxRateId: item.taxRateId,
              pricingBasis: item.pricingBasis,
              pricingKey: item.pricingKey,
              unitPricePaise: item.unitPricePaise,
              minQuantity: item.minQuantity,
              effectiveFrom: input.nowIso,
              effectiveTo: null,
              isActive: true,
              createdAt: input.nowIso,
              updatedAt: input.nowIso,
            });
          }
        }
      }

      return branch!;
    } catch (error) {
      mapSqliteError(error);
    }
  }
}

export class D1CustomerRepository implements CustomerRepository {
  constructor(private readonly db: ApiDatabase) {}

  async create(input: CreateCustomerInput): Promise<CustomerRecord> {
    try {
      const [row] = await this.db
        .insert(customers)
        .values({
          tenantId: input.tenantId ?? 1,
          branchId: input.branchId,
          customerCode: input.customerCode,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email ?? null,
          gstin: input.gstin ?? null,
          stateCode: input.stateCode ?? null,
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

  async findById(id: number): Promise<CustomerRecord | null> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByCode(code: string): Promise<CustomerRecord | null> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.customerCode, code))
      .limit(1);
    return row ?? null;
  }

  async list(params: {
    tenantId?: number;
    branchId?: number;
    search?: string;
    includeInactive?: boolean;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<CustomerRecord>> {
    const conditions = [];
    if (params.tenantId !== undefined) {
      conditions.push(eq(customers.tenantId, params.tenantId));
    }
    if (params.branchId !== undefined) {
      conditions.push(eq(customers.branchId, params.branchId));
    }
    if (!params.includeInactive) {
      conditions.push(eq(customers.isActive, true));
      conditions.push(isNull(customers.deletedAt));
    }
    if (params.search && params.search.trim().length > 0) {
      const pattern = `%${params.search.trim()}%`;
      conditions.push(
        or(
          like(customers.fullName, pattern),
          like(customers.phone, pattern),
          like(customers.customerCode, pattern),
        ),
      );
    }
    if (params.cursor) {
      conditions.push(
        or(
          lt(customers.createdAt, params.cursor.createdAt),
          and(
            eq(customers.createdAt, params.cursor.createdAt),
            lt(customers.id, params.cursor.id),
          ),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(customers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(customers.createdAt), desc(customers.id))
      .limit(params.limit + 1);

    return buildCursorPage(rows, params.limit);
  }

  async update(
    id: number,
    input: UpdateCustomerInput,
  ): Promise<CustomerRecord | null> {
    try {
      const patch: Partial<typeof customers.$inferInsert> = {
        updatedAt: input.nowIso,
      };
      if (input.fullName !== undefined) patch.fullName = input.fullName;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.email !== undefined) patch.email = input.email;
      if (input.gstin !== undefined) patch.gstin = input.gstin;
      if (input.stateCode !== undefined) patch.stateCode = input.stateCode;
      if (input.avatarR2Key !== undefined) patch.avatarR2Key = input.avatarR2Key;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.deletedAt !== undefined) patch.deletedAt = input.deletedAt;

      const [row] = await this.db
        .update(customers)
        .set(patch)
        .where(eq(customers.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async addAddress(
    input: CreateCustomerAddressInput,
  ): Promise<CustomerAddressRecord> {
    try {
      const [row] = await this.db
        .insert(customerAddresses)
        .values({
          customerId: input.customerId,
          addressType: input.addressType,
          label: input.label ?? null,
          line1: input.line1,
          line2: input.line2 ?? null,
          landmark: input.landmark ?? null,
          city: input.city,
          state: input.state,
          stateCode: input.stateCode,
          postalCode: input.postalCode,
          isDefaultPickup: Boolean(input.isDefaultPickup),
          isDefaultDelivery: Boolean(input.isDefaultDelivery),
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return {
        ...row!,
        addressType: row!.addressType as AddressType,
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async listAddresses(customerId: number): Promise<CustomerAddressRecord[]> {
    const rows = await this.db
      .select()
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.customerId, customerId),
          isNull(customerAddresses.deletedAt),
        ),
      )
      .orderBy(asc(customerAddresses.id));
    return rows.map((r) => ({ ...r, addressType: r.addressType as AddressType }));
  }

  async findAddressById(id: number): Promise<CustomerAddressRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.id, id))
      .limit(1);
    return row ? { ...row, addressType: row.addressType as AddressType } : null;
  }

  async getPreferences(
    customerId: number,
  ): Promise<CustomerPreferenceRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerPreferences)
      .where(eq(customerPreferences.customerId, customerId))
      .limit(1);
    return row ?? null;
  }

  async upsertPreferences(
    input: UpsertCustomerPreferencesInput,
  ): Promise<CustomerPreferenceRecord> {
    try {
      const existing = await this.getPreferences(input.customerId);
      if (existing) {
        const [updated] = await this.db
          .update(customerPreferences)
          .set({
            detergentPreference:
              input.detergentPreference !== undefined
                ? input.detergentPreference
                : existing.detergentPreference,
            starchLevel:
              input.starchLevel !== undefined
                ? input.starchLevel
                : existing.starchLevel,
            foldOrHanger:
              input.foldOrHanger !== undefined
                ? input.foldOrHanger
                : existing.foldOrHanger,
            fragranceFree:
              input.fragranceFree !== undefined
                ? input.fragranceFree
                : existing.fragranceFree,
            specialInstructions:
              input.specialInstructions !== undefined
                ? input.specialInstructions
                : existing.specialInstructions,
            updatedAt: input.nowIso,
          })
          .where(eq(customerPreferences.id, existing.id))
          .returning();
        return updated!;
      }

      const [created] = await this.db
        .insert(customerPreferences)
        .values({
          customerId: input.customerId,
          detergentPreference: input.detergentPreference ?? null,
          starchLevel: input.starchLevel ?? null,
          foldOrHanger: input.foldOrHanger ?? null,
          fragranceFree: Boolean(input.fragranceFree),
          specialInstructions: input.specialInstructions ?? null,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .returning();
      return created!;
    } catch (error) {
      mapSqliteError(error);
    }
  }
}
