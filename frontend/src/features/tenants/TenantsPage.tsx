import {
  Alert,
  Badge,
  BuildingIcon,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageContainer,
  PageHeader,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  Select,
  StatusPills,
  type DataTableColumn,
} from "@freshfold/ui";
import type { TenantSummary } from "@laundry/contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDateTime } from "../../lib/format";
import { useApi } from "../../api/context";

type LoadState =
  | { status: "loading" }
  | { status: "success"; items: TenantSummary[] }
  | { status: "error"; message?: string };

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Trial" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

function statusTone(status: string): "success" | "info" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "trial":
      return "info";
    case "suspended":
      return "warning";
    case "deleted":
      return "danger";
    default:
      return "neutral";
  }
}

function planTierTone(tier: string): "primary" | "accent" | "info" | "neutral" {
  switch (tier) {
    case "enterprise":
      return "primary";
    case "pro":
      return "accent";
    case "standard":
      return "info";
    default:
      return "neutral";
  }
}

const columns: DataTableColumn<TenantSummary>[] = [
  {
    key: "tenant",
    header: "Tenant",
    render: (tenant) => (
      <div>
        <p className="font-semibold text-text">{tenant.name}</p>
        <p className="text-xs text-text-muted">{tenant.slug}</p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (tenant) => (
      <Badge tone={statusTone(tenant.status)} dot>
        {tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)}
      </Badge>
    ),
  },
  {
    key: "planTier",
    header: "Plan Tier",
    render: (tenant) => (
      <Badge tone={planTierTone(tenant.planTier)}>
        {tenant.planTier.toUpperCase()}
      </Badge>
    ),
  },
  {
    key: "hubs",
    header: "Hubs",
    render: (tenant) =>
      `${tenant.hubCount ?? 1} hub${(tenant.hubCount ?? 1) === 1 ? "" : "s"}`,
  },
  {
    key: "created",
    header: "Created",
    render: (tenant) => (
      <span className="text-xs text-text-muted">
        {formatDateTime(tenant.createdAt)}
      </span>
    ),
  },
  {
    key: "actions",
    header: "",
    align: "right",
    render: (tenant) => (
      <Link
        to={`/tenants/${tenant.id}`}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-accent-strong underline-offset-2 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        View details
      </Link>
    ),
  },
];

export function TenantsPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    const query =
      selectedStatus !== "all"
        ? { status: selectedStatus }
        : undefined;

    api
      .listTenants(query)
      .then((res) => {
        if (!cancelled) {
          setState({ status: "success", items: res.items });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load tenants",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, selectedStatus, reloadToken]);

  const filteredItems = useMemo(() => {
    if (state.status !== "success") return [];
    const query = search.trim().toLowerCase();
    if (!query) return state.items;
    return state.items.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(query) ||
        tenant.slug.toLowerCase().includes(query) ||
        tenant.id.toLowerCase().includes(query),
    );
  }, [state, search]);

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Tenants"
        description="Manage multi-tenant organizations, service branches, and platform plans."
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
              onClick={() => navigate("/tenants/new")}
              leadingIcon={<PlusIcon className="h-4 w-4" />}
            >
              New tenant
            </Button>
          </div>
        }
      />

      {/* KPI Metric Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Tenants"
          value={state.status === "success" ? state.items.length : 0}
          subtext="Organizations registered"
          icon={<BuildingIcon className="h-5 w-5" />}
          tone="primary"
          active={selectedStatus === "all"}
          onClick={() => setSelectedStatus("all")}
        />
        <MetricCard
          label="Active"
          value={state.status === "success" ? state.items.filter((t) => t.status === "active").length : 0}
          subtext="In good standing"
          icon={<BuildingIcon className="h-5 w-5" />}
          tone="success"
          active={selectedStatus === "active"}
          onClick={() => setSelectedStatus("active")}
        />
        <MetricCard
          label="Trial"
          value={state.status === "success" ? state.items.filter((t) => t.status === "trial").length : 0}
          subtext="Evaluation period"
          icon={<BuildingIcon className="h-5 w-5" />}
          tone="primary"
          active={selectedStatus === "trial"}
          onClick={() => setSelectedStatus("trial")}
        />
        <MetricCard
          label="Suspended / Deleted"
          value={
            state.status === "success"
              ? state.items.filter((t) => t.status === "suspended" || t.status === "deleted").length
              : 0
          }
          subtext="Inactive accounts"
          icon={<BuildingIcon className="h-5 w-5" />}
          tone="warning"
          active={selectedStatus === "suspended" || selectedStatus === "deleted"}
          onClick={() => setSelectedStatus("suspended")}
        />
      </div>

      <Card
        title="Find a tenant"
        description="Filter by organization name, slug, or status."
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Search tenants"
              placeholder="Name or slug"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="Status"
              value={selectedStatus}
              options={statusOptions}
              onChange={(e) => setSelectedStatus(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-border">
            <StatusPills
              items={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "trial", label: "Trial" },
                { value: "suspended", label: "Suspended" },
                { value: "deleted", label: "Deleted" },
              ]}
              activeValue={selectedStatus}
              onChange={(val) => setSelectedStatus(val)}
              showClear={search.trim() !== "" || selectedStatus !== "all"}
              onClear={() => {
                setSearch("");
                setSelectedStatus("all");
              }}
            />
          </div>
        </div>
      </Card>

      {state.status === "loading" ? (
        <LoadingState label="Loading tenants" variant="table" rows={3} />
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load tenants"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadToken((t) => t + 1)}
            >
              Try again
            </Button>
          }
        >
          {state.message ?? "Check your connection and try again."}
        </Alert>
      ) : null}

      {state.status === "success" ? (
        <DataTable
          caption="Tenants"
          columns={columns}
          rows={filteredItems}
          getRowKey={(tenant) => tenant.id}
          emptyState={
            search.trim() || selectedStatus !== "all" ? (
              <EmptyState
                icon={<SearchIcon className="h-6 w-6" />}
                title="No tenants found"
                description="Try changing your search terms or filter selection."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setSelectedStatus("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<BuildingIcon className="h-6 w-6" />}
                title="No tenants registered"
                description="Get started by creating your first laundry tenant organization."
                action={
                  <Button
                    variant="primary"
                    onClick={() => navigate("/tenants/new")}
                    leadingIcon={<PlusIcon className="h-4 w-4" />}
                  >
                    Create tenant
                  </Button>
                }
              />
            )
          }
        />
      ) : null}
    </PageContainer>
  );
}

