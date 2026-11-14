import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { TenantSummary } from "@laundry/contracts";
import {
  Alert,
  Button,
  Card,
  Input,
  PageContainer,
  PageHeader,
  Select,
} from "@freshfold/ui";
import { useApi } from "../../api/context";

export function CreateHubPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedTenantId = searchParams.get("tenantId") || "";

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState(preselectedTenantId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [dailyCapacityKg, setDailyCapacityKg] = useState("500");
  const [expressDelivery, setExpressDelivery] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTenants({ limit: 100 })
      .then((res: { items: TenantSummary[] }) => {
        setTenants(res.items);
        if (!selectedTenantId && res.items.length > 0) {
          setSelectedTenantId(res.items[0].id);
        }
      })
      .catch(() => {});
  }, [api, selectedTenantId]);

  // Auto-generate code from name if user hasn't explicitly customized code
  const [codeDirty, setCodeDirty] = useState(false);
  const handleNameChange = (val: string) => {
    setName(val);
    if (!codeDirty) {
      const generated = val
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      setCode(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a hub facility name.");
      return;
    }
    if (!code.trim()) {
      setError("Please enter a short alphanumeric code for this hub.");
      return;
    }
    if (!selectedTenantId) {
      setError("Please select a tenant organization.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const capacity = Number(dailyCapacityKg) || 500;
      await api.createHub({
        tenantId: selectedTenantId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        timezone,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        isActive: true,
        settings: {
          dailyCapacityKg: capacity,
          expressDelivery,
        },
        metadata: {
          createdVia: "admin-ui",
        },
      });

      if (preselectedTenantId) {
        navigate(`/tenants/${encodeURIComponent(preselectedTenantId)}`);
      } else {
        navigate("/hubs");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create hub facility");
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Provision New Hub"
        description="Add a laundry processing facility, wash plant, or intake depot under a tenant organization."
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert tone="danger" title="Validation error">
              {error}
            </Alert>
          )}

          <Card
            title="Hub Identification"
            description="Facility branding and routing identifiers."
            padding="md"
          >
            <div className="space-y-4">
              <div>
                <Select
                  label="Parent Tenant Organization"
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  options={
                    tenants.length > 0
                      ? tenants.map((t) => ({
                          value: t.id,
                          label: `${t.name} (${t.slug})`,
                        }))
                      : [{ value: selectedTenantId || "default", label: "Loading tenants..." }]
                  }
                  disabled={Boolean(preselectedTenantId)}
                />
              </div>

              <div>
                <Input
                  label="Hub Facility Name"
                  placeholder="e.g. Bandra Central Processing Facility"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Input
                    label="Facility Code"
                    placeholder="e.g. BNDR"
                    value={code}
                    onChange={(e) => {
                      setCodeDirty(true);
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));
                    }}
                    hint="Alphanumeric, max 16 chars (unique per tenant)"
                    required
                  />
                </div>

                <div>
                  <Select
                    label="Timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    options={[
                      { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
                      { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
                      { value: "UTC", label: "UTC" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Location & Contact"
            description="Physical facility address and dispatch phone."
            padding="md"
          >
            <div className="space-y-4">
              <div>
                <Input
                  label="Physical Address"
                  placeholder="e.g. Plot 42, Industrial Area, Andheri East, Mumbai"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div>
                <Input
                  label="Contact Phone"
                  placeholder="e.g. +91 98200 98200"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card
            title="Operations & Capacity"
            description="Processing limits and delivery options."
            padding="md"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Input
                  label="Daily Capacity (kg)"
                  type="number"
                  min="50"
                  max="10000"
                  value={dailyCapacityKg}
                  onChange={(e) => setDailyCapacityKg(e.target.value)}
                  hint="Wash throughput threshold"
                />
              </div>

              <div>
                <Select
                  label="Express Delivery"
                  value={expressDelivery ? "true" : "false"}
                  onChange={(e) => setExpressDelivery(e.target.value === "true")}
                  options={[
                    { value: "true", label: "Enabled (Same-day express)" },
                    { value: "false", label: "Standard only (24h+)" },
                  ]}
                />
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (preselectedTenantId) {
                  navigate(`/tenants/${encodeURIComponent(preselectedTenantId)}`);
                } else {
                  navigate("/hubs");
                }
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Provision Hub
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
