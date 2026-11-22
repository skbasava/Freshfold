import type { AddressType } from "../../shared/constants";
import type { CursorPage, CursorPayload } from "../../shared/pagination";

export interface CustomerRecord {
  id: number;
  tenantId: number;
  branchId: number;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  stateCode: string | null;
  avatarR2Key: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CustomerAddressRecord {
  id: number;
  customerId: number;
  addressType: AddressType;
  label: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  isDefaultPickup: boolean;
  isDefaultDelivery: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CustomerPreferenceRecord {
  id: number;
  customerId: number;
  detergentPreference: string | null;
  starchLevel: string | null;
  foldOrHanger: string | null;
  fragranceFree: boolean;
  specialInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  tenantId?: number;
  branchId: number;
  customerCode: string;
  fullName: string;
  phone: string;
  email?: string | null;
  gstin?: string | null;
  stateCode?: string | null;
  nowIso: string;
}

export interface UpdateCustomerInput {
  fullName?: string;
  phone?: string;
  email?: string | null;
  gstin?: string | null;
  stateCode?: string | null;
  avatarR2Key?: string | null;
  isActive?: boolean;
  deletedAt?: string | null;
  nowIso: string;
}

export interface CreateCustomerAddressInput {
  customerId: number;
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
  nowIso: string;
}

export interface UpsertCustomerPreferencesInput {
  customerId: number;
  detergentPreference?: string | null;
  starchLevel?: string | null;
  foldOrHanger?: string | null;
  fragranceFree?: boolean;
  specialInstructions?: string | null;
  nowIso: string;
}

export interface CustomerRepository {
  create(input: CreateCustomerInput): Promise<CustomerRecord>;
  findById(id: number): Promise<CustomerRecord | null>;
  findByCode(code: string): Promise<CustomerRecord | null>;
  list(params: {
    tenantId?: number;
    branchId?: number;
    search?: string;
    includeInactive?: boolean;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<CustomerRecord>>;
  update(id: number, input: UpdateCustomerInput): Promise<CustomerRecord | null>;
  addAddress(input: CreateCustomerAddressInput): Promise<CustomerAddressRecord>;
  listAddresses(customerId: number): Promise<CustomerAddressRecord[]>;
  findAddressById(id: number): Promise<CustomerAddressRecord | null>;
  getPreferences(customerId: number): Promise<CustomerPreferenceRecord | null>;
  upsertPreferences(
    input: UpsertCustomerPreferencesInput,
  ): Promise<CustomerPreferenceRecord>;
}
