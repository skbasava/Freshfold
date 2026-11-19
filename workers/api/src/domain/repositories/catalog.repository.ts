import type { PricingBasis } from "../../shared/constants";
import type { CursorPage, CursorPayload } from "../../shared/pagination";

export interface ItemCategoryRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemRecord {
  id: number;
  categoryId: number;
  code: string;
  name: string;
  description: string | null;
  hsnSacCode: string | null;
  imageR2Key: string | null;
  imageContentType: string | null;
  imageSizeBytes: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemAttributeRecord {
  id: number;
  itemId: number;
  attributeKey: string;
  attributeValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategoryRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: number;
  categoryId: number;
  code: string;
  name: string;
  description: string | null;
  defaultPricingBasis: PricingBasis;
  defaultTaxRateId: number | null;
  turnaroundHours: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogRepository {
  createItemCategory(input: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
    nowIso: string;
  }): Promise<ItemCategoryRecord>;
  listItemCategories(includeInactive?: boolean): Promise<ItemCategoryRecord[]>;
  findItemCategoryById(id: number): Promise<ItemCategoryRecord | null>;

  createItem(input: {
    categoryId: number;
    code: string;
    name: string;
    description?: string | null;
    hsnSacCode?: string | null;
    nowIso: string;
  }): Promise<ItemRecord>;
  findItemById(id: number): Promise<ItemRecord | null>;
  listItems(params: {
    categoryId?: number;
    search?: string;
    includeInactive?: boolean;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<ItemRecord>>;
  updateItem(
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
  ): Promise<ItemRecord | null>;
  setItemAttribute(input: {
    itemId: number;
    attributeKey: string;
    attributeValue: string;
    nowIso: string;
  }): Promise<ItemAttributeRecord>;
  listItemAttributes(itemId: number): Promise<ItemAttributeRecord[]>;

  createServiceCategory(input: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
    nowIso: string;
  }): Promise<ServiceCategoryRecord>;
  listServiceCategories(includeInactive?: boolean): Promise<ServiceCategoryRecord[]>;

  createService(input: {
    categoryId: number;
    code: string;
    name: string;
    description?: string | null;
    defaultPricingBasis: PricingBasis;
    defaultTaxRateId?: number | null;
    turnaroundHours?: number;
    nowIso: string;
  }): Promise<ServiceRecord>;
  findServiceById(id: number): Promise<ServiceRecord | null>;
  listServices(params?: {
    categoryId?: number;
    includeInactive?: boolean;
  }): Promise<ServiceRecord[]>;
}
