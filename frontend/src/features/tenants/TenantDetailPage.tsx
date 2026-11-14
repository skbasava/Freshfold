import {
  Alert,
  Badge,
  BuildingIcon,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  HubIcon,
  Input,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  PlusIcon,
  Select,
} from "@freshfold/ui";
import type { HubSummary, PlanTier, Tenant, TenantStatus } from "@laundry/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDateTime } from "../../lib/format";
import { useApi } from "../../api/context";

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message?: string }
  | { status: "success"; tenant: Tenant };

const planTierOptions = [
  { value: "trial", label: "Trial" },
  { value: "standard", label: "Standard" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "trial", label: "Trial" },
  { value: "suspended", label: "Suspended" },
];

const currencyOptions = [
  { value: "INR", label: "INR (₹) - Indian Rupee" },
  { value: "USD", label: "USD ($) - US Dollar" },
  { value: "EUR", label: "EUR (€) - Euro" },
  { value: "GBP", label: "GBP (£) - British Pound" },
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

export function TenantDetailPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { tenantId = "" } = useParams();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editPlanTier, setEditPlanTier] = useState<PlanTier>("standard");
  const [editStatus, setEditStatus] = useState<TenantStatus>("active");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editCurrency, setEditCurrency] = useState("INR");
  const [editTimezone, setEditTimezone] = useState("Asia/Kolkata");
  const [editTaxRate, setEditTaxRate] = useState("18");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hubs state
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsReloadToken, setHubsReloadToken] = useState(0);

  // Create hub modal state
  const [createHubModalOpen, setCreateHubModalOpen] = useState(false);
  const [newHubName, setNewHubName] = useState("");
  const [newHubCode, setNewHubCode] = useState("");
  const [newHubAddress, setNewHubAddress] = useState("");
  const [newHubPhone, setNewHubPhone] = useState("");
  const [newHubTimezone, setNewHubTimezone] = useState("Asia/Kolkata");
  const [newHubCapacity, setNewHubCapacity] = useState("500");
  const [newHubExpress, setNewHubExpress] = useState(true);
  const [newHubSubmitting, setNewHubSubmitting] = useState(false);
  const [newHubError, setNewHubError] = useState<string | null>(null);

  // Edit hub modal state
  const [editHubModalOpen, setEditHubModalOpen] = useState(false);
  const [editingHubId, setEditingHubId] = useState("");
  const [editHubName, setEditHubName] = useState("");
  const [editHubCode, setEditHubCode] = useState("");
  const [editHubAddress, setEditHubAddress] = useState("");
  const [editHubPhone, setEditHubPhone] = useState("");
  const [editHubTimezone, setEditHubTimezone] = useState("Asia/Kolkata");
  const [editHubIsActive, setEditHubIsActive] = useState(true);
  const [editHubCapacity, setEditHubCapacity] = useState("500");
  const [editHubBaseVersion, setEditHubBaseVersion] = useState<number | undefined>(undefined);
  const [editHubSubmitting, setEditHubSubmitting] = useState(false);
  const [editHubError, setEditHubError] = useState<string | null>(null);

  // Delete hub confirmation state
  const [deleteHubTarget, setDeleteHubTarget] = useState<HubSummary | null>(null);
  const [deletingHub, setDeletingHub] = useState(false);
  const [deleteHubError, setDeleteHubError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    api
      .getTenant(tenantId)
      .then((tenant) => {
        if (!cancelled) {
          if (!tenant) {
            setState({ status: "not_found" });
          } else {
            setState({ status: "success", tenant });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load tenant",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, tenantId, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setHubsLoading(true);

    api
      .listHubs({ tenantId, limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setHubs(res.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setHubsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, tenantId, hubsReloadToken]);

  const openEditModal = (tenant: Tenant) => {
    setEditName(tenant.name);
    setEditSlug(tenant.slug);
    setEditPlanTier(tenant.planTier);
    setEditStatus(tenant.status === "deleted" ? "suspended" : tenant.status);
    setEditContactEmail(tenant.contactEmail ?? "");
    setEditContactPhone(tenant.contactPhone ?? "");
    setEditCurrency(
      typeof tenant.settings?.currency === "string"
        ? tenant.settings.currency
        : "INR",
    );
    setEditTimezone(
      typeof tenant.settings?.timezone === "string"
        ? tenant.settings.timezone
        : "Asia/Kolkata",
    );
    setEditTaxRate(
      tenant.settings?.taxRatePercent !== undefined
        ? String(tenant.settings.taxRatePercent)
        : "18",
    );
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e?: FormEvent | React.MouseEvent) => {
    e?.preventDefault?.();
    if (state.status !== "success") return;

    if (!editName.trim()) {
      setEditError("Tenant name cannot be empty.");
      return;
    }

    setEditSubmitting(true);
    setEditError(null);

    try {
      const updated = await api.updateTenant(state.tenant.id, {
        name: editName.trim(),
        slug: editSlug.trim() || undefined,
        planTier: editPlanTier,
        status: editStatus,
        contactEmail: editContactEmail.trim() || null,
        contactPhone: editContactPhone.trim() || null,
        settings: {
          ...state.tenant.settings,
          currency: editCurrency,
          timezone: editTimezone,
          taxRatePercent: editTaxRate ? Number(editTaxRate) : undefined,
        },
        baseVersion: state.tenant.version,
      });

      setState({ status: "success", tenant: updated });
      setEditModalOpen(false);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update tenant details.",
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (state.status !== "success") return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteTenant(state.tenant.id);
      setDeleteDialogOpen(false);
      // Reload updated tenant
      setReloadToken((t) => t + 1);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to soft-delete tenant.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const openCreateHubModal = () => {
    setNewHubName("");
    setNewHubCode("");
    setNewHubAddress("");
    setNewHubPhone("");
    setNewHubTimezone("Asia/Kolkata");
    setNewHubCapacity("500");
    setNewHubExpress(true);
    setNewHubError(null);
    setCreateHubModalOpen(true);
  };

  const handleCreateHubSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newHubName.trim()) {
      setNewHubError("Hub name is required.");
      return;
    }
    if (!newHubCode.trim()) {
      setNewHubError("Hub code is required.");
      return;
    }

    setNewHubSubmitting(true);
    setNewHubError(null);

    try {
      await api.createHub({
        tenantId,
        name: newHubName.trim(),
        code: newHubCode.trim().toUpperCase(),
        timezone: newHubTimezone,
        address: newHubAddress.trim() || undefined,
        phone: newHubPhone.trim() || undefined,
        isActive: true,
        settings: {
          dailyCapacityKg: Number(newHubCapacity) || 500,
          expressDelivery: newHubExpress,
        },
        metadata: {},
      });

      setCreateHubModalOpen(false);
      setHubsReloadToken((t) => t + 1);
    } catch (err) {
      setNewHubError(
        err instanceof Error ? err.message : "Failed to provision hub.",
      );
    } finally {
      setNewHubSubmitting(false);
    }
  };

  const openEditHubModal = async (hubSummary: HubSummary) => {
    try {
      const fullHub = await api.getHub(hubSummary.id);
      if (!fullHub) return;
      setEditingHubId(fullHub.id);
      setEditHubName(fullHub.name);
      setEditHubCode(fullHub.code);
      setEditHubAddress(fullHub.address ?? "");
      setEditHubPhone(fullHub.phone ?? "");
      setEditHubTimezone(fullHub.timezone);
      setEditHubIsActive(fullHub.isActive);
      setEditHubCapacity(String(fullHub.settings?.dailyCapacityKg ?? 500));
      setEditHubBaseVersion(fullHub.version);
      setEditHubError(null);
      setEditHubModalOpen(true);
    } catch {
      setEditingHubId(hubSummary.id);
      setEditHubName(hubSummary.name);
      setEditHubCode(hubSummary.code);
      setEditHubAddress(hubSummary.address ?? "");
      setEditHubPhone(hubSummary.phone ?? "");
      setEditHubTimezone(hubSummary.timezone);
      setEditHubIsActive(hubSummary.isActive);
      setEditHubCapacity("500");
      setEditHubBaseVersion(undefined);
      setEditHubError(null);
      setEditHubModalOpen(true);
    }
  };

  const handleEditHubSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingHubId) return;

    setEditHubSubmitting(true);
    setEditHubError(null);

    try {
      await api.updateHub(editingHubId, {
        name: editHubName.trim(),
        code: editHubCode.trim().toUpperCase(),
        timezone: editHubTimezone,
        address: editHubAddress.trim() || null,
        phone: editHubPhone.trim() || null,
        isActive: editHubIsActive,
        settings: {
          dailyCapacityKg: Number(editHubCapacity) || 500,
        },
        baseVersion: editHubBaseVersion,
      });

      setEditHubModalOpen(false);
      setHubsReloadToken((t) => t + 1);
    } catch (err) {
      setEditHubError(
        err instanceof Error ? err.message : "Failed to update hub.",
      );
    } finally {
      setEditHubSubmitting(false);
    }
  };

  const handleDeleteHubConfirm = async () => {
    if (!deleteHubTarget) return;

    setDeletingHub(true);
    setDeleteHubError(null);

    try {
      await api.deleteHub(deleteHubTarget.id);
      setDeleteHubTarget(null);
      setHubsReloadToken((t) => t + 1);
    } catch (err) {
      setDeleteHubError(
        err instanceof Error ? err.message : "Failed to deactivate hub.",
      );
    } finally {
      setDeletingHub(false);
    }
  };

  if (state.status === "loading") {
    return (
      <PageContainer>
        <LoadingState label="Loading tenant details" rows={4} />
      </PageContainer>
    );
  }

  if (state.status === "not_found") {
    return (
      <PageContainer>
        <EmptyState
          icon={<BuildingIcon className="h-6 w-6" />}
          title="Tenant not found"
          description="The requested tenant organization does not exist or may have been permanently purged."
          action={
            <Button variant="secondary" onClick={() => navigate("/tenants")}>
              Back to Tenants
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (state.status === "error") {
    return (
      <PageContainer>
        <Alert
          tone="danger"
          title="Could not load tenant"
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
          {state.message ?? "An unexpected error occurred."}
        </Alert>
      </PageContainer>
    );
  }

  const { tenant } = state;
  const isDeleted = tenant.status === "deleted";

  return (
    <PageContainer className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Link
          to="/tenants"
          className="hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Tenants
        </Link>
        <span>/</span>
        <span className="font-medium text-text">{tenant.name}</span>
      </div>

      <PageHeader
        eyebrow="Tenant Details"
        title={
          <div className="flex flex-wrap items-center gap-3">
            <span>{tenant.name}</span>
            <Badge tone={statusTone(tenant.status)} dot>
              {tenant.status.toUpperCase()}
            </Badge>
            <Badge tone={planTierTone(tenant.planTier)}>
              {tenant.planTier.toUpperCase()}
            </Badge>
            <span className="rounded bg-canvas px-2 py-0.5 text-xs font-mono font-normal text-text-muted">
              v{tenant.version}
            </span>
          </div>
        }
        description={`Organization identifier: ${tenant.id} · Slug: ${tenant.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => openEditModal(tenant)}
            >
              Edit tenant
            </Button>
            {!isDeleted ? (
              <Button
                variant="danger"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete tenant
              </Button>
            ) : null}
          </div>
        }
      />

      {isDeleted ? (
        <Alert tone="warning" title="Tenant is marked as deleted">
          This tenant organization has been soft-deleted. Hub operations and order
          creations are suspended. Recovery is possible within the 30-day grace period.
        </Alert>
      ) : null}

      {deleteError ? (
        <Alert tone="danger" title="Deletion failed">
          {deleteError}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card
          title="Organization Overview"
          description="System metadata and identification."
        >
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Tenant ID
              </dt>
              <dd className="font-mono text-text mt-0.5">{tenant.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                URL Slug
              </dt>
              <dd className="font-mono text-text mt-0.5">{tenant.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Plan Tier
              </dt>
              <dd className="text-text mt-0.5 capitalize">{tenant.planTier}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Status
              </dt>
              <dd className="text-text mt-0.5 capitalize">{tenant.status}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Created
              </dt>
              <dd className="text-text mt-0.5">
                {formatDateTime(tenant.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Last Updated
              </dt>
              <dd className="text-text mt-0.5">
                {formatDateTime(tenant.updatedAt)}
              </dd>
            </div>
            {tenant.deletedAt ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wider text-danger">
                  Deleted At
                </dt>
                <dd className="text-danger mt-0.5 font-medium">
                  {formatDateTime(tenant.deletedAt)}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card
          title="Contact Information"
          description="Administrative communication channels."
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Contact Email
              </dt>
              <dd className="text-text mt-0.5">
                {tenant.contactEmail ? (
                  <a
                    href={`mailto:${tenant.contactEmail}`}
                    className="text-primary hover:underline"
                  >
                    {tenant.contactEmail}
                  </a>
                ) : (
                  <span className="text-text-muted">Not specified</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Contact Phone
              </dt>
              <dd className="text-text mt-0.5">
                {tenant.contactPhone ? (
                  <span className="font-mono">{tenant.contactPhone}</span>
                ) : (
                  <span className="text-text-muted">Not specified</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Hubs & Facilities Card */}
        <Card
          title="Processing Hubs & Facilities"
          description="Operational wash facilities, intake depots, and processing plants assigned to this organization."
          actions={
            !isDeleted ? (
              <Button
                variant="primary"
                size="sm"
                onClick={openCreateHubModal}
              >
                Add Hub
              </Button>
            ) : null
          }
          className="md:col-span-2"
        >
          {hubsLoading ? (
            <LoadingState label="Loading hubs..." rows={2} />
          ) : hubs.length === 0 ? (
            <EmptyState
              icon={<HubIcon className="h-8 w-8 text-text-muted" />}
              title="No hubs provisioned yet"
              description="This tenant organization does not have any processing hubs or intake depots configured yet."
              action={
                !isDeleted ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={openCreateHubModal}
                  >
                    Add first hub
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold uppercase text-text-muted">
                    <th className="pb-3 pr-4">Hub / Code</th>
                    <th className="pb-3 px-4">Location & Timezone</th>
                    <th className="pb-3 px-4">Phone</th>
                    <th className="pb-3 px-4">Status</th>
                    <th className="pb-3 pl-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hubs.map((hub) => (
                    <tr key={hub.id} className="hover:bg-canvas/50">
                      <td className="py-3 pr-4">
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
                        <div className="text-xs text-text-muted font-mono mt-0.5">
                          {hub.id}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-text">{hub.address || "No address"}</div>
                        <div className="text-xs text-text-muted mt-0.5">{hub.timezone}</div>
                      </td>
                      <td className="py-3 px-4 text-text font-mono text-xs">
                        {hub.phone || "—"}
                      </td>
                      <td className="py-3 px-4">
                        <Badge tone={hub.isActive ? "success" : "neutral"}>
                          {hub.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditHubModal(hub)}
                          >
                            Edit
                          </Button>
                          {hub.isActive && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setDeleteHubTarget(hub)}
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Operational Settings"
          description="Tenant configuration parameters."
        >
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Currency
                </dt>
                <dd className="text-text mt-0.5 font-medium">
                  {String(tenant.settings?.currency ?? "INR")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Timezone
                </dt>
                <dd className="text-text mt-0.5 font-medium">
                  {String(tenant.settings?.timezone ?? "Asia/Kolkata")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Tax Rate
                </dt>
                <dd className="text-text mt-0.5 font-medium">
                  {tenant.settings?.taxRatePercent !== undefined
                    ? `${tenant.settings.taxRatePercent}%`
                    : "Not set"}
                </dd>
              </div>
            </dl>

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-text-muted hover:text-text">
                View raw settings JSON
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-canvas p-3 font-mono text-text">
                {JSON.stringify(tenant.settings, null, 2)}
              </pre>
            </details>
          </div>
        </Card>

        <Card
          title="Metadata & Extensibility"
          description="Custom tenant tags and enterprise attributes."
        >
          <div className="space-y-4">
            <details className="text-xs" open>
              <summary className="cursor-pointer font-medium text-text-muted hover:text-text">
                Custom metadata
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-canvas p-3 font-mono text-text">
                {JSON.stringify(tenant.metadata ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        </Card>
      </div>

      {/* Edit Tenant Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit ${tenant.name}`}
        description="Update organization parameters. Optimistic concurrency checking is enforced."
        size="md"
      >
        <form
          onSubmit={handleEditSubmit}
          className="space-y-4 pt-2"
        >
          {editError ? (
            <Alert tone="danger" title="Update failed">
              {editError}
            </Alert>
          ) : null}

          <Input
            label="Organization name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <Input
            label="URL Slug"
            value={editSlug}
            onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            hint="Lowercase letters, numbers, and hyphens"
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Plan tier"
              options={planTierOptions}
              value={editPlanTier}
              onChange={(e) => setEditPlanTier(e.target.value as PlanTier)}
            />
            <Select
              label="Status"
              options={statusOptions}
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as TenantStatus)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact email"
              type="email"
              value={editContactEmail}
              onChange={(e) => setEditContactEmail(e.target.value)}
            />
            <Input
              label="Contact phone"
              type="tel"
              value={editContactPhone}
              onChange={(e) => setEditContactPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Currency"
              options={currencyOptions}
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value)}
            />
            <Input
              label="Timezone"
              value={editTimezone}
              onChange={(e) => setEditTimezone(e.target.value)}
            />
            <Input
              label="Tax Rate (%)"
              type="number"
              value={editTaxRate}
              onChange={(e) => setEditTaxRate(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setEditModalOpen(false)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={editSubmitting}
            >
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Tenant Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Tenant Organization"
        description={`Are you sure you want to delete ${tenant.name}? This will soft-delete the tenant and immediately restrict orders and inventory management across its hubs. A 30-day recovery period applies before permanent purging.`}
        confirmLabel="Delete tenant"
        cancelLabel="Keep tenant"
        tone="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      {/* Create Hub Modal */}
      <Modal
        open={createHubModalOpen}
        onClose={() => setCreateHubModalOpen(false)}
        title="Provision Hub Facility"
        description="Add a laundry processing facility, wash plant, or intake depot under this organization."
        size="md"
      >
        <form onSubmit={handleCreateHubSubmit} className="space-y-4 pt-2">
          {newHubError ? (
            <Alert tone="danger" title="Provisioning failed">
              {newHubError}
            </Alert>
          ) : null}

          <Input
            label="Facility Name"
            placeholder="e.g. Bandra Central Processing Facility"
            value={newHubName}
            onChange={(e) => {
              setNewHubName(e.target.value);
              if (!newHubCode) {
                setNewHubCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6),
                );
              }
            }}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Facility Code"
              placeholder="e.g. BNDR"
              value={newHubCode}
              onChange={(e) =>
                setNewHubCode(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                )
              }
              hint="Max 16 chars"
              required
            />
            <Select
              label="Timezone"
              value={newHubTimezone}
              onChange={(e) => setNewHubTimezone(e.target.value)}
              options={[
                { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
                { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
                { value: "UTC", label: "UTC" },
              ]}
            />
          </div>

          <Input
            label="Physical Address"
            placeholder="Facility street address"
            value={newHubAddress}
            onChange={(e) => setNewHubAddress(e.target.value)}
          />

          <Input
            label="Phone"
            placeholder="Facility dispatch phone"
            value={newHubPhone}
            onChange={(e) => setNewHubPhone(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Capacity (kg/day)"
              type="number"
              value={newHubCapacity}
              onChange={(e) => setNewHubCapacity(e.target.value)}
            />
            <Select
              label="Express Delivery"
              value={newHubExpress ? "true" : "false"}
              onChange={(e) => setNewHubExpress(e.target.value === "true")}
              options={[
                { value: "true", label: "Enabled" },
                { value: "false", label: "Disabled" },
              ]}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setCreateHubModalOpen(false)}
              disabled={newHubSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={newHubSubmitting}
            >
              Provision Hub
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Hub Modal */}
      <Modal
        open={editHubModalOpen}
        onClose={() => setEditHubModalOpen(false)}
        title={`Edit ${editHubName}`}
        description="Update facility parameters with optimistic concurrency checking."
        size="md"
      >
        <form onSubmit={handleEditHubSubmit} className="space-y-4 pt-2">
          {editHubError ? (
            <Alert tone="danger" title="Update failed">
              {editHubError}
            </Alert>
          ) : null}

          <Input
            label="Facility Name"
            value={editHubName}
            onChange={(e) => setEditHubName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Facility Code"
              value={editHubCode}
              onChange={(e) =>
                setEditHubCode(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                )
              }
              hint="Max 16 chars"
              required
            />
            <Select
              label="Timezone"
              value={editHubTimezone}
              onChange={(e) => setEditHubTimezone(e.target.value)}
              options={[
                { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
                { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
                { value: "UTC", label: "UTC" },
              ]}
            />
          </div>

          <Input
            label="Physical Address"
            value={editHubAddress}
            onChange={(e) => setEditHubAddress(e.target.value)}
          />

          <Input
            label="Phone"
            value={editHubPhone}
            onChange={(e) => setEditHubPhone(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Capacity (kg/day)"
              type="number"
              value={editHubCapacity}
              onChange={(e) => setEditHubCapacity(e.target.value)}
            />
            <Select
              label="Operating Status"
              value={editHubIsActive ? "true" : "false"}
              onChange={(e) => setEditHubIsActive(e.target.value === "true")}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setEditHubModalOpen(false)}
              disabled={editHubSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={editHubSubmitting}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Hub Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteHubTarget)}
        title="Deactivate Hub Facility"
        description={
          deleteHubTarget
            ? `Are you sure you want to deactivate ${deleteHubTarget.name} (${deleteHubTarget.code})? Active delivery schedules and order routing to this hub will be suspended.`
            : "Deactivate this hub facility?"
        }
        confirmLabel="Deactivate hub"
        cancelLabel="Keep hub"
        tone="danger"
        loading={deletingHub}
        onConfirm={handleDeleteHubConfirm}
        onCancel={() => setDeleteHubTarget(null)}
      />
    </PageContainer>
  );
}

