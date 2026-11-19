import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Inbox,
  Loader2,
  Package,
  Phone,
  RefreshCw,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks";
import { apiFetch } from "@/lib/http/api-client";
import { formatDateTime } from "@/features/orders/services/orders.service";

export interface DeliveryRecord {
  id: number;
  orderId: number;
  customerId: number;
  deliveryType: "pickup" | "delivery";
  status: "scheduled" | "dispatched" | "delivered" | "failed" | "cancelled";
  contactName: string | null;
  contactPhone: string | null;
  scheduledAt: string;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  dispatched: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function DeliveriesPage() {
  const isMobile = useIsMobile();
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadDeliveries() {
    setLoading(true);
    setError(null);
    try {
      const q = filter !== "all" ? `?status=${filter}` : "";
      const res = await apiFetch(`/api/v1/deliveries${q}`);
      if (!res.ok) {
        throw new Error(`Failed to load deliveries (HTTP ${res.status})`);
      }
      const json = (await res.json()) as {
        data: { items: DeliveryRecord[] };
      };
      setDeliveries(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDeliveries();
  }, [filter]);

  async function handleStatusTransition(
    id: number,
    toStatus: "dispatched" | "delivered" | "failed",
    reason?: string,
  ) {
    setActionLoadingId(id);
    try {
      const res = await apiFetch(`/api/v1/deliveries/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus, reason }),
      });
      if (!res.ok) {
        throw new Error("Failed to update delivery status");
      }
      await loadDeliveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update delivery status");
    } finally {
      setActionLoadingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deliveries;
    return deliveries.filter(
      (d) =>
        String(d.id).includes(q) ||
        String(d.orderId).includes(q) ||
        (d.contactName && d.contactName.toLowerCase().includes(q)) ||
        (d.contactPhone && d.contactPhone.includes(q)),
    );
  }, [deliveries, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Deliveries & Dispatch
          </h1>
          <p className="text-sm text-muted-foreground">
            Coordinate rider dispatch, delivery slot schedules, and handover confirmations.
          </p>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Delivery service warning</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void loadDeliveries()}>
              <RefreshCw className="mr-1.5 size-3.5" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border border-border/80 bg-surface shadow-xs overflow-hidden">
        {/* Controls */}
        <div className="p-4 border-b border-border/70 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search delivery ID, order #, contact..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList className="bg-canvas border border-border/60">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                <TabsTrigger value="dispatched">Dispatched</TabsTrigger>
                <TabsTrigger value="delivered">Delivered</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-canvas p-3 mb-3">
              <Truck className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No deliveries in this view
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Deliveries will appear as orders are dispatched or scheduled for rider delivery.
            </p>
          </div>
        ) : isMobile ? (
          <div className="divide-y divide-border/60 p-2 space-y-2">
            {filtered.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-border/60 bg-surface p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono text-muted-foreground">
                      Delivery #{d.id}
                    </span>
                    <Link
                      to={`/orders/${d.orderId}`}
                      className="block text-sm font-semibold text-primary hover:underline"
                    >
                      Order #{d.orderId}
                    </Link>
                  </div>
                  <Badge variant={d.status === "delivered" ? "default" : "outline"}>
                    {STATUS_LABELS[d.status] ?? d.status}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3 text-primary" />
                    <span>Scheduled: {formatDateTime(d.scheduledAt)}</span>
                  </div>
                  {d.contactName ? (
                    <div className="text-foreground font-medium">
                      {d.contactName} {d.contactPhone ? `(${d.contactPhone})` : ""}
                    </div>
                  ) : null}
                </div>

                {d.status === "scheduled" ? (
                  <Button
                    size="xs"
                    className="w-full"
                    disabled={actionLoadingId === d.id}
                    onClick={() => handleStatusTransition(d.id, "dispatched", "Out with rider")}
                  >
                    <Truck className="mr-1 size-3" />
                    <span>Dispatch to Rider</span>
                  </Button>
                ) : null}

                {d.status === "dispatched" ? (
                  <Button
                    size="xs"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={actionLoadingId === d.id}
                    onClick={() => handleStatusTransition(d.id, "delivered", "Delivered to customer")}
                  >
                    <CheckCircle className="mr-1 size-3" />
                    <span>Confirm Delivery</span>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-canvas/50">
                <TableRow>
                  <TableHead className="font-semibold">Delivery ID</TableHead>
                  <TableHead className="font-semibold">Order</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Scheduled Time</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id} className="hover:bg-canvas/40 transition-colors">
                    <TableCell className="font-mono text-xs text-muted-foreground font-medium">
                      #{d.id}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/orders/${d.orderId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Order #{d.orderId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px] font-normal">
                        {d.deliveryType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.contactName ? (
                        <div>
                          <div className="font-medium text-foreground">{d.contactName}</div>
                          {d.contactPhone ? (
                            <div className="text-muted-foreground">{d.contactPhone}</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="size-3 text-muted-foreground" />
                        <span>{formatDateTime(d.scheduledAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={d.status === "delivered" ? "default" : "secondary"}
                        className="text-[10px] font-normal"
                      >
                        {STATUS_LABELS[d.status] ?? d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status === "scheduled" ? (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={actionLoadingId === d.id}
                          onClick={() => handleStatusTransition(d.id, "dispatched", "Out with rider")}
                        >
                          <Truck className="mr-1 size-3" />
                          <span>Dispatch</span>
                        </Button>
                      ) : d.status === "dispatched" ? (
                        <Button
                          size="xs"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={actionLoadingId === d.id}
                          onClick={() => handleStatusTransition(d.id, "delivered", "Delivered to customer")}
                        >
                          <CheckCircle className="mr-1 size-3" />
                          <span>Deliver</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
