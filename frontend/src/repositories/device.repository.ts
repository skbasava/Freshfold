import type { DeviceRegistration } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface RegisterDeviceInput {
  id?: string;
  userId: string;
  branchId?: string | null;
  deviceName: string;
  platform?: string;
}

export class DeviceRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async registerDevice(input: RegisterDeviceInput): Promise<DeviceRegistration> {
    const id = input.id ?? this.context.deviceId;
    const now = Date.now();

    const device: DeviceRegistration = {
      id,
      tenantId: this.context.tenantId,
      userId: input.userId,
      branchId: input.branchId ?? null,
      deviceName: input.deviceName.trim(),
      platform: input.platform ?? 'web',
      isRevoked: false,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.devices.put(device);
    return device;
  }

  public async getDevice(
    deviceId = this.context.deviceId
  ): Promise<DeviceRegistration | undefined> {
    const device = await this.db.devices.get(deviceId);
    if (!device || device.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return device;
  }

  public async updateLastSeen(deviceId = this.context.deviceId): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (device) {
      await this.db.devices.update(deviceId, {
        lastSeenAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  public async isRevoked(deviceId = this.context.deviceId): Promise<boolean> {
    const device = await this.getDevice(deviceId);
    return device ? device.isRevoked : false;
  }

  public async setRevoked(deviceId: string, isRevoked: boolean): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (device) {
      await this.db.devices.update(deviceId, {
        isRevoked,
        updatedAt: Date.now(),
      });
    }
  }

  public async listDevices(): Promise<DeviceRegistration[]> {
    const results = await this.db.devices
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return results;
  }
}

