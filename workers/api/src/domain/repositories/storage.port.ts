export interface StoredObjectMetadata {
  key: string;
  contentType: string;
  sizeBytes: number;
  etag?: string;
  sha256Hex?: string;
}

export interface StoredObjectContent {
  key: string;
  body: ArrayBuffer;
  contentType: string;
  sizeBytes: number;
  etag?: string;
}

export interface StoragePort {
  putObject(input: {
    key: string;
    body: ArrayBuffer | Uint8Array | string;
    contentType: string;
    customMetadata?: Record<string, string>;
  }): Promise<StoredObjectMetadata>;
  getObject(key: string): Promise<StoredObjectContent | null>;
  deleteObject(key: string): Promise<void>;
}

export interface PaymentWebhookPayload {
  provider: string;
  providerReference: string;
  providerEventId: string;
  eventType: "payment.captured" | "payment.failed" | "payment.authorized";
  amountPaise: number;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface PaymentProviderPort {
  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | undefined,
    secret: string,
  ): Promise<boolean>;
}
