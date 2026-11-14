import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Hub } from "@laundry/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  HubIcon,
  Input,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  Select,
} from "@freshfold/ui";
import { useApi } from "../../api/context";
import { formatDateTime } from "../../lib/format";

interface LoadState {
  status: "loading" | "not_found" | "error" | "success";
  hub?: Hub;
  error?: string;
}

export function HubDetailPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { hubId = "" } = useParams();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editTimezone, setEditTimezone] = useState("Asia/Kolkata");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editCapacity, setEditCapacity] = useState("500");
  const [editExpress, setEditExpress] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    api
      .getHub(hubId)
      .then((hub: Hub | null) => {
        if (!cancelled) {
          if (!hub) {
            setState({ status: "not_found" });
          } else {
            setState({ status: "success", hub });
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            error: err instanceof Error ? err.message : "Failed to load hub facility",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, hubId, reloadToken]);

  const openEditModal = (hub: Hub) => {
    setEditName(hub.name);
    setEditCode(hub.code);
    setEditTimezone(hub.timezone);
    setEditAddress(hub.address ?? "");
    setEditPhone(hub.phone ?? "");
    setEditIsActive(hub.isActive);
    setEditCapacity(String(hub.settings?.dailyCapacityKg ?? 500));
    setEditExpress(Boolean(hub.settings?.expressDelivery ?? true));
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.hub) return;

    setEditSubmitting(true);
    setEditError(null);

    try {
      await api.updateHub(state.hub.id, {
        name: editName.trim(),
        code: editCode.trim().toUpperCase(),
        timezone: editTimezone,
        address: editAddress.trim() || null,
        phone: editPhone.trim() || null,
        isActive: editIsActive,
        settings: {
          dailyCapacityKg: Number(editCapacity) || 500,
          expressDelivery: editExpress,
        },
        baseVersion: state.hub.version,
      });

      setEditModalOpen(false);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update hub parameters",
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!state.hub) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteHub(state.hub.id);
      setDeleteModalOpen(false);
      navigate("/hubs");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to deactivate hub",
      );
      setDeleting(false);
    }
  };

  if (state.status === "loading") {
    return (
      <PageContainer>
        <LoadingState label="Loading processing hub details..." />
      </PageContainer>
    );
  }

  if (state.status === "not_found") {
    return (
      <PageContainer>
        <EmptyState
          icon={<HubIcon className="h-10 w-10 text-text-muted" />}
          title="Hub not found"
          description={`The hub facility "${hubId}" does not exist, belongs to another organization, or was removed.`}
          action={
            <Button variant="primary" onClick={() => navigate("/hubs")}>
              Back to Hubs
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (state.status === "error") {
    return (
      <PageContainer>
        <Alert tone="danger" title="Failed to load hub">
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
      </PageContainer>
    );
  }

  const hub = state.hub!;
  const isDeleted = Boolean(hub.deletedAt);

  return (
    <PageContainer>
      <PageHeader
        title={hub.name}
        description={`Facility Code: ${hub.code} • Timezone: ${hub.timezone}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={hub.isActive ? "success" : "neutral"}>
              {hub.isActive ? "Active" : "Inactive"}
            </Badge>
            <Button variant="secondary" onClick={() => openEditModal(hub)}>
              Edit hub
            </Button>
            {!isDeleted && (
              <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
                Deactivate hub
              </Button>
            )}
          </div>
        }
      />

      {isDeleted && (
        <Alert tone="warning" title="Hub is deactivated">
          This processing facility has been soft-deleted and cannot accept new
          delivery schedules or order intakes.
        </Alert>
      )}

      {deleteError && (
        <Alert tone="danger" title="Deactivation failed">
          {deleteError}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card
          title="Facility Identification"
          description="Operational details and organizational routing."
        >
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Hub ID
              </dt>
              <dd className="font-mono text-text mt-0.5">{hub.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Code
              </dt>
              <dd className="font-mono font-semibold text-text mt-0.5">{hub.code}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Parent Tenant
              </dt>
              <dd className="mt-0.5">
                <Link
                  to={`/tenants/${encodeURIComponent(hub.tenantId)}`}
                  className="font-mono text-primary hover:underline"
                >
                  {hub.tenantId}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Concurrency Version
              </dt>
              <dd className="text-text mt-0.5">v{hub.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Provisioned At
              </dt>
              <dd className="text-text mt-0.5">{formatDateTime(hub.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Last Updated
              </dt>
              <dd className="text-text mt-0.5">{formatDateTime(hub.updatedAt)}</dd>
            </div>
            {hub.deletedAt && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wider text-danger">
                  Deactivated At
                </dt>
                <dd className="text-danger mt-0.5">{formatDateTime(hub.deletedAt)}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card
          title="Location & Contact"
          description="Physical dispatch and operations coordination."
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Physical Address
              </dt>
              <dd className="text-text mt-0.5">
                {hub.address || <span className="text-text-muted">Not specified</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Contact Phone
              </dt>
              <dd className="text-text mt-0.5">
                {hub.phone || <span className="text-text-muted">Not specified</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Operating Timezone
              </dt>
              <dd className="text-text mt-0.5">{hub.timezone}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Capacity & Settings"
          description="Operational throughput and delivery options."
        >
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Daily Capacity
                </dt>
                <dd className="text-text mt-0.5 font-medium">
                  {String(hub.settings?.dailyCapacityKg ?? 500)} kg / day
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Express Delivery
                </dt>
                <dd className="text-text mt-0.5 font-medium">
                  {hub.settings?.expressDelivery ? "Available" : "Disabled"}
                </dd>
              </div>
            </dl>

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-text-muted hover:text-text">
                View raw settings JSON
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-canvas p-3 font-mono text-text">
                {JSON.stringify(hub.settings, null, 2)}
              </pre>
            </details>
          </div>
        </Card>

        <Card
          title="Facility Metadata"
          description="Integration tags and custom ERP references."
        >
          <div className="space-y-4">
            <details className="text-xs" open>
              <summary className="cursor-pointer font-medium text-text-muted hover:text-text">
                Custom metadata
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-canvas p-3 font-mono text-text">
                {JSON.stringify(hub.metadata ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        </Card>
      </div>

      {/* Edit Hub Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit ${hub.name}`}
        description="Update facility parameters with optimistic concurrency checking."
        size="md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
          {editError && (
            <Alert tone="danger" title="Update failed">
              {editError}
            </Alert>
          )}

          <Input
            label="Facility name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Facility Code"
              value={editCode}
              onChange={(e) =>
                setEditCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
              }
              hint="Max 16 chars"
              required
            />
            <Select
              label="Timezone"
              value={editTimezone}
              onChange={(e) => setEditTimezone(e.target.value)}
              options={[
                { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
                { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
                { value: "UTC", label: "UTC" },
              ]}
            />
          </div>

          <Input
            label="Physical Address"
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
          />

          <Input
            label="Phone"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Capacity (kg)"
              type="number"
              value={editCapacity}
              onChange={(e) => setEditCapacity(e.target.value)}
            />
            <Select
              label="Operating Status"
              value={editIsActive ? "true" : "false"}
              onChange={(e) => setEditIsActive(e.target.value === "true")}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditModalOpen(false)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={editSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Deactivate Hub Facility"
        description="Are you sure you want to deactivate this facility? Active delivery schedules and order routing to this hub will be suspended."
        size="sm"
      >
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDeleteModalOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDeleteConfirm}
            loading={deleting}
          >
            Deactivate Hub
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
