import React, { useState } from 'react';
import { useOrders } from '../../../hooks/useOrders';
import type { OrderStatus, PaymentStatus } from '../../../domain/types';
import { Card } from '../data-display/Card';
import { Badge, type BadgeTone } from '../data-display/Badge';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Select } from '../primitives/Select';
import { EmptyState } from '../feedback/EmptyState';
import { LoadingState } from '../feedback/LoadingState';

import type { LaundryDatabase } from '../../../database/db';

export interface OperatorOrderQueueProps {
  tenantId: string;
  branchId?: string;
  deviceId?: string;
  db?: LaundryDatabase;
}

const NEXT_STATUS_MAP: Record<OrderStatus, OrderStatus | null> = {
  received: 'inspection',
  inspection: 'washing',
  washing: 'drying',
  drying: 'ironing',
  ironing: 'quality_check',
  quality_check: 'ready',
  ready: 'delivered',
  delivered: null,
  cancelled: null,
};

const ACTION_LABEL_MAP: Record<OrderStatus, string> = {
  received: 'Start Inspection',
  inspection: 'Start Washing',
  washing: 'Move to Drying',
  drying: 'Move to Ironing',
  ironing: 'Quality Check',
  quality_check: 'Mark Ready',
  ready: 'Mark Delivered',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_TONE_MAP: Record<OrderStatus, BadgeTone> = {
  received: 'neutral',
  inspection: 'primary',
  washing: 'primary',
  drying: 'primary',
  ironing: 'primary',
  quality_check: 'warning',
  ready: 'success',
  delivered: 'success',
  cancelled: 'danger',
};

export const OperatorOrderQueue: React.FC<OperatorOrderQueueProps> = ({
  tenantId,
  branchId,
  deviceId,
  db,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { orders, isLoading, advanceStatus } = useOrders({
    tenantId,
    branchId,
    deviceId,
    status: selectedStatus || undefined,
    search,
    db,
  });

  const handleAdvance = async (orderId: string, currentStatus: OrderStatus) => {
    const nextStatus = NEXT_STATUS_MAP[currentStatus];
    if (!nextStatus) return;

    setProcessingId(orderId);
    try {
      await advanceStatus(orderId, nextStatus);
    } catch (err) {
      console.error('Failed to advance order stage:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const formatCurrency = (minor: number) => {
    return '₹' + (minor / 100).toFixed(2);
  };

  return (
    <div className="space-y-4" data-testid="operator-order-queue">
      {/* Controls Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1 max-w-sm">
          <Input
            label="Search orders"
            placeholder="Search order number or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search orders"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select
            label="Filter by stage"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as OrderStatus | '')}
            aria-label="Filter by stage"
            options={[
              { value: '', label: 'All Active Stages' },
              { value: 'received', label: 'Received' },
              { value: 'inspection', label: 'Inspection' },
              { value: 'washing', label: 'Washing' },
              { value: 'drying', label: 'Drying' },
              { value: 'ironing', label: 'Ironing' },
              { value: 'quality_check', label: 'Quality Check' },
              { value: 'ready', label: 'Ready' },
              { value: 'delivered', label: 'Delivered' },
            ]}
          />
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <LoadingState label="Loading order queue from local database..." />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          description={
            search || selectedStatus
              ? 'No orders match your filter criteria.'
              : 'The order queue is currently clear.'
          }
        />
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => {
            const nextStatus = NEXT_STATUS_MAP[order.status];
            const isProcessing = processingId === order.id;

            return (
              <Card key={order.id} padding="md" className="transition-shadow hover:shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text text-base">
                        {order.orderNumber}
                      </span>
                      <Badge tone={STATUS_TONE_MAP[order.status]}>
                        {order.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <Badge
                        tone={
                          order.paymentStatus === 'paid'
                            ? 'success'
                            : order.paymentStatus === 'partially_paid'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {order.paymentStatus.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="text-sm text-text-muted flex items-center gap-3">
                      <span>Total: {formatCurrency(order.totalMinor)}</span>
                      <span>•</span>
                      <span>
                        Received: {new Date(order.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {order.notes && (
                      <p className="text-xs text-text-muted bg-canvas p-1.5 rounded border border-border mt-1">
                        Note: {order.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {nextStatus && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => handleAdvance(order.id, order.status)}
                      >
                        {isProcessing ? 'Saving...' : ACTION_LABEL_MAP[order.status]}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
