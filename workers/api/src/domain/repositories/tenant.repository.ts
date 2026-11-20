export interface TenantRecord {
  id: number;
  code: string;
  name: string;
  slug: string;
  planTier: string;
  status: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantInput {
  code: string;
  name: string;
  slug: string;
  planTier?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  nowIso: string;
}

export interface TenantRepository {
  findById(id: number): Promise<TenantRecord | null>;
  findByCode(code: string): Promise<TenantRecord | null>;
  findAll(): Promise<TenantRecord[]>;
  create(input: CreateTenantInput): Promise<TenantRecord>;
}
