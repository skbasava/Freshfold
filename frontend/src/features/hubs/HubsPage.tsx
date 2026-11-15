import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { HubSummary } from "@laundry/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  HubIcon,
  Input,
  LoadingState,
  MetricCard,
  PageContainer,
  PageHeader,
  RefreshIcon,
  Select,
  StatusPills,
  type DataTableColumn,
} from "@freshfold/ui";
import { useApi } from "../../api/context";
import { formatDateTime } from "../../lib/format";

type FilterStatus = "all" | "active" | "inactive";

interface LoadState {
  status: "loading" | "error" | "success";
  hubs: HubSummary[];
  error?: string;
}

export function HubsPage() {
  const api = useApi();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>({
    status: "loading",
    hubs: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    api
      .listHubs({ limit: 100 })
      .then((res: { items: HubSummary[] }) => {
        if (!cancelled) {
          setState({
            status: "success",
            hubs: res.items,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            hubs: [],
            error: err instanceof Error ? err.message : "Failed to load hubs",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  const filteredHubs = useMemo(() => {
    return state.hubs.filter((hub) => {
      if (statusFilter === "active" && !hub.isActive) return false;
      if (statusFilter === "inactive" && hub.isActive) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        hub.name.toLowerCase().includes(q) ||
        hub.code.toLowerCase().includes(q) ||
        hub.tenantId.toLowerCase().includes(q) ||
        (hub.address && hub.address.toLowerCase().includes(q))
      );
    });
  }, [state.hubs, statusFilter, searchQuery]);

  const columns: DataTableColumn<HubSummary>[] = [
    {
      key: "name",
      header: "Hub / Code",
      render: (hub) => (
        <div>
          <div className="flex items-center gap-2">
            <Link
              to={`/hubs/${encodeURIComponent(hub.id)}`}
              className="font-semibold text-primary hover:text-primary-hover hover:underline"
            >
              {hub.name}
            </Link>
            <Badge tone="neutral">
              {hub.code}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            ID: <span className="font-mono">{hub.id}</span>
          </div>
        </div>
      ),
    },
    {
      key: "tenantId",
      header: "Tenant Organization",
      render: (hub) => (
        <Link
          to={`/tenants/${encodeURIComponent(hub.tenantId)}`}
          className="font-mono text-xs text-text-muted hover:text-text hover:underline"
        >
          {hub.tenantId}
        </Link>
      ),
    },
    {
      key: "address",
      header: "Location & Phone",
      render: (hub) => (
        <div className="text-sm">
          <div className="text-text truncate max-w-xs">
            {hub.address || <span className="text-text-muted">No address specified</span>}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {hub.phone || "No phone"} • {hub.timezone}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (hub) => (
        <Badge tone={hub.isActive ? "success" : "neutral"}>
          {hub.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "updatedAt",
      header: "Last Updated",
      render: (hub) => (
        <span className="text-xs text-text-muted">
          {formatDateTime(hub.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (hub) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/hubs/${encodeURIComponent(hub.id)}`)}
        >
          View details
        </Button>
      ),
    },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Processing Hubs"
        description="Manage laundry processing facilities, intake centers, and drop hubs across organizations."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leadingIcon={<RefreshIcon className="h-4 w-4" />}
              onClick={() => setReloadToken((t) => t + 1)}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate("/hubs/new")}
            >
              New Hub
            </Button>
          </div>
        }
      />

      {/* KPI Metric Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total Hubs"
          value={state.status === "success" ? state.hubs.length : 0}
          subtext="Facilities registered"
          icon={<HubIcon className="h-5 w-5" />}
          tone="primary"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <MetricCard
          label="Active Facilities"
          value={state.status === "success" ? state.hubs.filter((h) => h.isActive).length : 0}
          subtext="Operational and taking orders"
          icon={<HubIcon className="h-5 w-5" />}
          tone="success"
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <MetricCard
          label="Inactive Facilities"
          value={state.status === "success" ? state.hubs.filter((h) => !h.isActive).length : 0}
          subtext="Decommissioned or paused"
          icon={<HubIcon className="h-5 w-5" />}
          tone="neutral"
          active={statusFilter === "inactive"}
          onClick={() => setStatusFilter("inactive")}
        />
      </div>

      <div className="space-y-6">
        <Card padding="md">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <Input
                  label="Search hubs"
                  placeholder="Search by name, code, tenant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="w-full sm:w-48">
                <Select
                  label="Operating status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "active", label: "Active Hubs" },
                    { value: "inactive", label: "Inactive Hubs" },
                  ]}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <StatusPills
                items={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                activeValue={statusFilter}
                onChange={(val) => setStatusFilter(val as FilterStatus)}
                showClear={searchQuery.trim() !== "" || statusFilter !== "all"}
                onClear={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              />
            </div>
          </div>
        </Card>

        {state.status === "loading" && (
          <Card padding="lg">
            <LoadingState label="Loading hubs directory..." />
          </Card>
        )}

        {state.status === "error" && (
          <Alert tone="danger" title="Error loading hubs">
            {state.error}
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReloadToken((t) => t + 1)}
              >
                Retry
              </Button>
            </div>
          </Alert>
        )}

        {state.status === "success" && filteredHubs.length === 0 && (
          <Card padding="lg">
            <EmptyState
              icon={<HubIcon className="h-10 w-10 text-text-muted" />}
              title={
                state.hubs.length === 0
                  ? "No hubs provisioned yet"
                  : "No hubs match your filter"
              }
              description={
                state.hubs.length === 0
                  ? "Set up processing plants, local intake centers, and drop facilities to route orders."
                  : "Try clearing your search query or changing the status filter."
              }
              action={
                state.hubs.length === 0 ? (
                  <Button
                    variant="primary"
                    onClick={() => navigate("/hubs/new")}
                  >
                    Create first hub
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                  >
                    Reset filters
                  </Button>
                )
              }
            />
          </Card>
        )}

        {state.status === "success" && filteredHubs.length > 0 && (
          <Card padding="none">
            <DataTable
              caption="Processing facilities directory"
              columns={columns}
              rows={filteredHubs}
              getRowKey={(hub) => hub.id}
            />
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
