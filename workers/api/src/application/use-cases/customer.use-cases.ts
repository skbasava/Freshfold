import type {
  BranchRepository,
  CustomerAddressRecord,
  CustomerPreferenceRecord,
  CustomerRecord,
  CustomerRepository,
} from "../../domain/repositories/customer.repository";
import type { SystemRepository } from "../../domain/repositories/system.repository";
import type { AddressType } from "../../shared/constants";
import { ConflictError, NotFoundError } from "../../shared/errors";
import {
  clampPageLimit,
  decodeCursor,
  type CursorPage,
} from "../../shared/pagination";
import type { Clock } from "../../shared/time";

export interface CustomerUseCasesDeps {
  branches: BranchRepository;
  customers: CustomerRepository;
  system: SystemRepository;
  clock: Clock;
}

export class CustomerUseCases {
  constructor(private readonly deps: CustomerUseCasesDeps) {}

  async createCustomer(input: {
    tenantId?: number;
    branchId?: number;
    customerCode?: string;
    fullName: string;
    phone: string;
    email?: string | null;
    gstin?: string | null;
    stateCode?: string | null;
    actorUserId?: number | null;
    requestId?: string;
  }): Promise<CustomerRecord> {
    const branch = input.branchId
      ? await this.deps.branches.findById(input.branchId)
      : await this.deps.branches.findDefault();
    if (!branch) {
      throw new NotFoundError(
        input.branchId
          ? `Branch #${input.branchId} not found`
          : "Default branch is not configured",
      );
    }

    const nowIso = this.deps.clock.nowIso();
    const code =
      input.customerCode ??
      `CUST-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    const existing = await this.deps.customers.findByCode(code);
    if (existing) {
      throw new ConflictError(`Customer code '${code}' already exists`);
    }

    const created = await this.deps.customers.create({
      tenantId: input.tenantId ?? branch.tenantId,
      branchId: branch.id,
      customerCode: code,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      stateCode: input.stateCode ?? branch.stateCode,
      nowIso,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "customer.created",
      entityType: "customer",
      entityId: String(created.id),
      requestId: input.requestId ?? null,
      summaryJson: JSON.stringify({ customerCode: created.customerCode }),
      nowIso,
    });

    return created;
  }

  async getCustomer(id: number): Promise<{
    customer: CustomerRecord;
    addresses: CustomerAddressRecord[];
    preferences: CustomerPreferenceRecord | null;
  }> {
    const customer = await this.deps.customers.findById(id);
    if (!customer) {
      throw new NotFoundError(`Customer #${id} not found`);
    }
    const [addresses, preferences] = await Promise.all([
      this.deps.customers.listAddresses(id),
      this.deps.customers.getPreferences(id),
    ]);
    return { customer, addresses, preferences };
  }

  async listCustomers(params: {
    tenantId?: number;
    branchId?: number;
    search?: string;
    includeInactive?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<CustomerRecord>> {
    const limit = clampPageLimit(params.limit);
    const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;
    return this.deps.customers.list({
      tenantId: params.tenantId,
      branchId: params.branchId,
      search: params.search,
      includeInactive: params.includeInactive,
      limit,
      cursor,
    });
  }

  async updateCustomer(
    id: number,
    input: {
      fullName?: string;
      phone?: string;
      email?: string | null;
      gstin?: string | null;
      stateCode?: string | null;
      isActive?: boolean;
      actorUserId?: number | null;
      requestId?: string;
    },
  ): Promise<CustomerRecord> {
    const existing = await this.deps.customers.findById(id);
    if (!existing) {
      throw new NotFoundError(`Customer #${id} not found`);
    }

    const nowIso = this.deps.clock.nowIso();
    const deletedAt =
      input.isActive === false
        ? existing.deletedAt ?? nowIso
        : input.isActive === true
          ? null
          : existing.deletedAt;

    const updated = await this.deps.customers.update(id, {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      stateCode: input.stateCode,
      isActive: input.isActive,
      deletedAt,
      nowIso,
    });

    if (!updated) {
      throw new NotFoundError(`Customer #${id} not found`);
    }

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: input.isActive === false ? "customer.deactivated" : "customer.updated",
      entityType: "customer",
      entityId: String(id),
      requestId: input.requestId ?? null,
      nowIso,
    });

    return updated;
  }

  async addAddress(
    customerId: number,
    input: {
      addressType: AddressType;
      label?: string | null;
      line1: string;
      line2?: string | null;
      landmark?: string | null;
      city: string;
      state: string;
      stateCode: string;
      postalCode: string;
      isDefaultPickup?: boolean;
      isDefaultDelivery?: boolean;
    },
  ): Promise<CustomerAddressRecord> {
    const customer = await this.deps.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }
    return this.deps.customers.addAddress({
      customerId,
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  async listAddresses(customerId: number): Promise<CustomerAddressRecord[]> {
    const customer = await this.deps.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }
    return this.deps.customers.listAddresses(customerId);
  }

  async upsertPreferences(
    customerId: number,
    input: {
      detergentPreference?: string | null;
      starchLevel?: string | null;
      foldOrHanger?: string | null;
      fragranceFree?: boolean;
      specialInstructions?: string | null;
    },
  ): Promise<CustomerPreferenceRecord> {
    const customer = await this.deps.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }
    return this.deps.customers.upsertPreferences({
      customerId,
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }
}
