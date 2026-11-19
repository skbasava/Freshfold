import type {
  CatalogRepository,
  ItemAttributeRecord,
  ItemCategoryRecord,
  ItemRecord,
  ServiceCategoryRecord,
  ServiceRecord,
} from "../../domain/repositories/catalog.repository";
import type {
  StoragePort,
  StoredObjectContent,
} from "../../domain/repositories/storage.port";
import type { PricingBasis } from "../../shared/constants";
import { NotFoundError, ValidationError } from "../../shared/errors";
import {
  clampPageLimit,
  decodeCursor,
  type CursorPage,
} from "../../shared/pagination";
import type { Clock } from "../../shared/time";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface CatalogUseCasesDeps {
  catalog: CatalogRepository;
  storage: StoragePort;
  clock: Clock;
}

export class CatalogUseCases {
  constructor(private readonly deps: CatalogUseCasesDeps) {}

  createItemCategory(input: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
  }): Promise<ItemCategoryRecord> {
    return this.deps.catalog.createItemCategory({
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listItemCategories(includeInactive = false): Promise<ItemCategoryRecord[]> {
    return this.deps.catalog.listItemCategories(includeInactive);
  }

  async createItem(input: {
    categoryId: number;
    code: string;
    name: string;
    description?: string | null;
    hsnSacCode?: string | null;
  }): Promise<ItemRecord> {
    const category = await this.deps.catalog.findItemCategoryById(input.categoryId);
    if (!category) {
      throw new NotFoundError(`Item category #${input.categoryId} not found`);
    }
    return this.deps.catalog.createItem({
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listItems(params: {
    categoryId?: number;
    search?: string;
    includeInactive?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<ItemRecord>> {
    return this.deps.catalog.listItems({
      categoryId: params.categoryId,
      search: params.search,
      includeInactive: params.includeInactive,
      limit: clampPageLimit(params.limit),
      cursor: params.cursor ? decodeCursor(params.cursor) : undefined,
    });
  }

  async updateItem(
    id: number,
    input: {
      name?: string;
      description?: string | null;
      hsnSacCode?: string | null;
      isActive?: boolean;
    },
  ): Promise<ItemRecord> {
    const updated = await this.deps.catalog.updateItem(id, {
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
    if (!updated) {
      throw new NotFoundError(`Item #${id} not found`);
    }
    return updated;
  }

  async setItemAttribute(
    itemId: number,
    input: { attributeKey: string; attributeValue: string },
  ): Promise<ItemAttributeRecord> {
    const item = await this.deps.catalog.findItemById(itemId);
    if (!item) {
      throw new NotFoundError(`Item #${itemId} not found`);
    }
    return this.deps.catalog.setItemAttribute({
      itemId,
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  async uploadItemImage(params: {
    itemId: number;
    contentType: string;
    bytes: ArrayBuffer;
  }): Promise<ItemRecord> {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(params.contentType)) {
      throw new ValidationError(
        `Unsupported image content type '${params.contentType}'. Allowed: image/jpeg, image/png, image/webp`,
      );
    }
    if (params.bytes.byteLength === 0 || params.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ValidationError("Image size must be between 1 byte and 5 MB");
    }

    const item = await this.deps.catalog.findItemById(params.itemId);
    if (!item) {
      throw new NotFoundError(`Item #${params.itemId} not found`);
    }

    const ext = params.contentType.split("/")[1] ?? "bin";
    const key = `items/${item.id}/${Date.now()}.${ext}`;
    const stored = await this.deps.storage.putObject({
      key,
      body: params.bytes,
      contentType: params.contentType,
      customMetadata: { itemId: String(item.id), itemCode: item.code },
    });

    const updated = await this.deps.catalog.updateItem(item.id, {
      imageR2Key: stored.key,
      imageContentType: stored.contentType,
      imageSizeBytes: stored.sizeBytes,
      nowIso: this.deps.clock.nowIso(),
    });
    if (!updated) {
      throw new NotFoundError(`Item #${params.itemId} not found`);
    }
    return updated;
  }

  async downloadItemImage(itemId: number): Promise<StoredObjectContent> {
    const item = await this.deps.catalog.findItemById(itemId);
    if (!item || !item.imageR2Key) {
      throw new NotFoundError(`Image for item #${itemId} not found`);
    }
    const obj = await this.deps.storage.getObject(item.imageR2Key);
    if (!obj) {
      throw new NotFoundError(`Stored R2 object '${item.imageR2Key}' not found`);
    }
    return obj;
  }

  createServiceCategory(input: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
  }): Promise<ServiceCategoryRecord> {
    return this.deps.catalog.createServiceCategory({
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listServiceCategories(includeInactive = false): Promise<ServiceCategoryRecord[]> {
    return this.deps.catalog.listServiceCategories(includeInactive);
  }

  createService(input: {
    categoryId: number;
    code: string;
    name: string;
    description?: string | null;
    defaultPricingBasis: PricingBasis;
    defaultTaxRateId?: number | null;
    turnaroundHours?: number;
  }): Promise<ServiceRecord> {
    return this.deps.catalog.createService({
      ...input,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  listServices(params?: {
    categoryId?: number;
    includeInactive?: boolean;
  }): Promise<ServiceRecord[]> {
    return this.deps.catalog.listServices(params);
  }
}
