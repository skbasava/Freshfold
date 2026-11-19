import type {
  StoragePort,
  StoredObjectContent,
  StoredObjectMetadata,
} from "../../domain/repositories/storage.port";

export class R2StorageAdapter implements StoragePort {
  constructor(private readonly bucket: R2Bucket) {}

  async putObject(input: {
    key: string;
    body: ArrayBuffer | Uint8Array | string;
    contentType: string;
    customMetadata?: Record<string, string>;
  }): Promise<StoredObjectMetadata> {
    const result = await this.bucket.put(input.key, input.body, {
      httpMetadata: { contentType: input.contentType },
      customMetadata: input.customMetadata,
    });

    const sizeBytes =
      result?.size ??
      (typeof input.body === "string"
        ? new TextEncoder().encode(input.body).byteLength
        : input.body.byteLength);

    return {
      key: input.key,
      contentType: input.contentType,
      sizeBytes,
      etag: result?.etag,
    };
  }

  async getObject(key: string): Promise<StoredObjectContent | null> {
    const obj = await this.bucket.get(key);
    if (!obj) {
      return null;
    }
    const body = await obj.arrayBuffer();
    return {
      key: obj.key,
      body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      sizeBytes: obj.size,
      etag: obj.etag,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
