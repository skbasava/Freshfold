import type { Transaction } from 'dexie';
import type { SyncStateRecord, SyncStateStatus } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export class SyncStateRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  private makeId(dataset: string): string {
    return `${this.context.tenantId}:${dataset}`;
  }

  public async getCursor(dataset: string): Promise<number> {
    const id = this.makeId(dataset);
    const record = await this.db.syncState.get(id);
    return record?.lastCursor ?? 0;
  }

  public async setCursor(
    dataset: string,
    cursor: number,
    status: SyncStateStatus = 'idle',
    lastError: string | null = null,
    tx?: Transaction
  ): Promise<SyncStateRecord> {
    const id = this.makeId(dataset);
    const now = Date.now();

    const record: SyncStateRecord = {
      id,
      tenantId: this.context.tenantId,
      dataset,
      lastCursor: cursor,
      lastSyncAt: now,
      status,
      lastError,
    };

    if (tx) {
      await tx.table<SyncStateRecord, string>('syncState').put(record);
    } else {
      await this.db.syncState.put(record);
    }

    return record;
  }

  public async getState(dataset: string): Promise<SyncStateRecord | undefined> {
    const id = this.makeId(dataset);
    return await this.db.syncState.get(id);
  }

  public async getAllState(): Promise<SyncStateRecord[]> {
    const records = await this.db.syncState
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return records;
  }

  public async resetCursor(dataset: string): Promise<void> {
    const id = this.makeId(dataset);
    await this.db.syncState.delete(id);
  }
}

