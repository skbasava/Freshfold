import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncStatusBadge } from '../SyncStatusBadge';
import { OperatorOrderQueue } from '../OperatorOrderQueue';
import { LaundryDatabase, createDatabase } from '../../../../database/db';
import { OrderRepository } from '../../../../repositories/order.repository';
import type { UseSyncReturn } from '../../../../hooks/useSync';

describe('Phase 6: UI Hooks & Components', () => {
  describe('SyncStatusBadge', () => {
    it('renders "Synced" when online and idle with no pending ops', () => {
      const mockSync: UseSyncReturn = {
        isSyncing: false,
        isOnline: true,
        pendingCount: 0,
        failedCount: 0,
        conflictsCount: 0,
        lastSyncAt: Date.now() - 5000,
        lastError: null,
        triggerSync: vi.fn(),
      };

      render(<SyncStatusBadge sync={mockSync} />);

      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText(/Synced Just now/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /trigger manual synchronization/i })).toBeEnabled();
    });

    it('renders "Offline (3 pending)" when disconnected with pending operations', () => {
      const mockSync: UseSyncReturn = {
        isSyncing: false,
        isOnline: false,
        pendingCount: 3,
        failedCount: 0,
        conflictsCount: 0,
        lastSyncAt: null,
        lastError: null,
        triggerSync: vi.fn(),
      };

      render(<SyncStatusBadge sync={mockSync} />);

      expect(screen.getByText('Offline (3 pending)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /trigger manual synchronization/i })).toBeDisabled();
    });

    it('renders "Syncing..." and disables sync button during active synchronization', () => {
      const mockSync: UseSyncReturn = {
        isSyncing: true,
        isOnline: true,
        pendingCount: 2,
        failedCount: 0,
        conflictsCount: 0,
        lastSyncAt: null,
        lastError: null,
        triggerSync: vi.fn(),
      };

      render(<SyncStatusBadge sync={mockSync} />);

      expect(screen.getAllByText('Syncing...').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /trigger manual synchronization/i })).toBeDisabled();
    });

    it('calls triggerSync when "Sync Now" is clicked', () => {
      const triggerMock = vi.fn().mockResolvedValue(null);
      const mockSync: UseSyncReturn = {
        isSyncing: false,
        isOnline: true,
        pendingCount: 1,
        failedCount: 0,
        conflictsCount: 0,
        lastSyncAt: null,
        lastError: null,
        triggerSync: triggerMock,
      };

      render(<SyncStatusBadge sync={mockSync} />);

      const button = screen.getByRole('button', { name: /trigger manual synchronization/i });
      fireEvent.click(button);

      expect(triggerMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('OperatorOrderQueue', () => {
    let testDb: LaundryDatabase;
    const tenantId = 'tenant-test-ui';
    const deviceId = 'tablet-counter-1';

    beforeEach(async () => {
      testDb = createDatabase(`ui-test-${crypto.randomUUID()}`);
      await testDb.open();
    });

    afterEach(async () => {
      if (testDb && testDb.isOpen()) {
        await testDb.delete();
      }
    });

    it('renders active orders and advances order stage with atomic outbox mutation', async () => {
      const repo = new OrderRepository(testDb, { tenantId, deviceId });

      // Create an order in 'received' status
      const order = await repo.create({
        branchId: 'branch-1',
        customerId: 'cust-1',
        orderNumber: 'FF-2026-101',
        status: 'received',
        paymentStatus: 'paid',
        totalMinor: 45000,
        notes: 'Delicate silk garments',
      });

      render(
        <OperatorOrderQueue
          tenantId={tenantId}
          branchId="branch-1"
          deviceId={deviceId}
          db={testDb}
        />
      );

      // Verify order appears in queue
      await waitFor(() => {
        expect(screen.getByText('FF-2026-101')).toBeInTheDocument();
        expect(screen.getByText(/Delicate silk garments/i)).toBeInTheDocument();
      });

      // Action button for 'received' stage is 'Start Inspection'
      const advanceBtn = screen.getByRole('button', { name: 'Start Inspection' });
      expect(advanceBtn).toBeInTheDocument();

      // Click advance
      fireEvent.click(advanceBtn);

      // Verify order status advances to 'inspection' in local Dexie database
      await waitFor(async () => {
        const updated = await testDb.orders.get(order.id);
        expect(updated?.status).toBe('inspection');
      });

      // Verify corresponding atomic outbox operation was queued
      const outboxOps = await testDb.outbox
        .where('tenantId')
        .equals(tenantId)
        .toArray();

      const statusChangeOp = outboxOps.find(
        (op) => op.action === 'status_change' && op.entityId === order.id
      );
      expect(statusChangeOp).toBeDefined();
      expect((statusChangeOp?.payload as any)?.newStatus).toBe('inspection');
    });
  });
});
