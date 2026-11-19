import type { StoragePort } from "../../domain/repositories/storage.port";
import type {
  DatabaseStorageMetrics,
  SystemRepository,
} from "../../domain/repositories/system.repository";
import { STORAGE_ALERT_THRESHOLDS } from "../../shared/constants";
import type { Clock } from "../../shared/time";
import { sha256Hex } from "../services/idempotency.service";

export type StorageAlertLevel =
  | "normal"
  | "review_60"
  | "prepare_archive_75"
  | "action_required_85";

export interface StorageHealthReport {
  measuredAt: string;
  ceilingBytes: number;
  usedBytes: number;
  utilizationPercent: number;
  alertLevel: StorageAlertLevel;
  metrics: DatabaseStorageMetrics;
}

export interface ArchiveManifest {
  archiveId: string;
  createdAt: string;
  entityType: string;
  recordCount: number;
  dataObjectKey: string;
  dataSha256Hex: string;
  dataSizeBytes: number;
}

export interface HealthUseCasesDeps {
  system: SystemRepository;
  storage: StoragePort;
  clock: Clock;
  storageCeilingBytes: number;
}

export function evaluateStorageAlertLevel(
  utilizationPercent: number,
): StorageAlertLevel {
  if (utilizationPercent >= STORAGE_ALERT_THRESHOLDS.ACTION_REQUIRED_PERCENT) {
    return "action_required_85";
  }
  if (utilizationPercent >= STORAGE_ALERT_THRESHOLDS.PREPARE_ARCHIVE_PERCENT) {
    return "prepare_archive_75";
  }
  if (utilizationPercent >= STORAGE_ALERT_THRESHOLDS.REVIEW_PERCENT) {
    return "review_60";
  }
  return "normal";
}

export class HealthUseCases {
  constructor(private readonly deps: HealthUseCasesDeps) {}

  getHealth(): { status: "ok"; timestamp: string } {
    return {
      status: "ok",
      timestamp: this.deps.clock.nowIso(),
    };
  }

  async getDatabaseHealth(): Promise<{
    status: "ok" | "degraded";
    latencyMs: number;
    foreignKeysEnabled: boolean;
    timestamp: string;
  }> {
    const ping = await this.deps.system.ping();
    return {
      status: ping.ok && ping.foreignKeysEnabled ? "ok" : "degraded",
      latencyMs: ping.latencyMs,
      foreignKeysEnabled: ping.foreignKeysEnabled,
      timestamp: this.deps.clock.nowIso(),
    };
  }

  async getStorageHealth(): Promise<StorageHealthReport> {
    const metrics = await this.deps.system.getStorageMetrics();
    const ceiling = Math.max(1, this.deps.storageCeilingBytes);
    const utilizationPercent =
      Math.round((metrics.usedBytes / ceiling) * 10000) / 100;

    return {
      measuredAt: this.deps.clock.nowIso(),
      ceilingBytes: ceiling,
      usedBytes: metrics.usedBytes,
      utilizationPercent,
      alertLevel: evaluateStorageAlertLevel(utilizationPercent),
      metrics,
    };
  }

  /**
   * Writes a verified JSONL archive batch and its manifest (with SHA-256 checksum
   * and record count) to R2, then reads it back to confirm integrity before any
   * optional purge is ever permitted.
   */
  async createVerifiedArchiveBatch(params: {
    entityType: string;
    records: unknown[];
  }): Promise<{ manifest: ArchiveManifest; verified: boolean }> {
    const nowIso = this.deps.clock.nowIso();
    const archiveId = `${params.entityType}-${nowIso.replace(/[:.]/g, "-")}`;
    const ndjson = params.records.map((r) => JSON.stringify(r)).join("\n");
    const checksum = await sha256Hex(ndjson);

    const dataKey = `archives/${params.entityType}/${archiveId}.jsonl`;
    const manifestKey = `archives/${params.entityType}/${archiveId}.manifest.json`;

    const storedData = await this.deps.storage.putObject({
      key: dataKey,
      body: ndjson,
      contentType: "application/x-ndjson",
      customMetadata: {
        sha256: checksum,
        recordCount: String(params.records.length),
      },
    });

    const manifest: ArchiveManifest = {
      archiveId,
      createdAt: nowIso,
      entityType: params.entityType,
      recordCount: params.records.length,
      dataObjectKey: dataKey,
      dataSha256Hex: checksum,
      dataSizeBytes: storedData.sizeBytes,
    };

    await this.deps.storage.putObject({
      key: manifestKey,
      body: JSON.stringify(manifest, null, 2),
      contentType: "application/json",
    });

    // Read-back verification before any caller could consider deleting source rows
    const readBack = await this.deps.storage.getObject(dataKey);
    const readBackText = readBack
      ? new TextDecoder().decode(readBack.body)
      : null;
    const verified =
      readBackText !== null && (await sha256Hex(readBackText)) === checksum;

    return { manifest, verified };
  }
}
