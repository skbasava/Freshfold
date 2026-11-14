import {
  Alert,
  BuildingIcon,
  Button,
  Card,
  Input,
  PageContainer,
  PageHeader,
  Select,
} from "@freshfold/ui";
import type { PlanTier } from "@laundry/contracts";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../api/context";

const planTierOptions = [
  { value: "trial", label: "Trial (Free test period)" },
  { value: "standard", label: "Standard (Single hub / basic)" },
  { value: "pro", label: "Pro (Multi-hub / advanced)" },
  { value: "enterprise", label: "Enterprise (Dedicated SLA)" },
];

const currencyOptions = [
  { value: "INR", label: "INR (₹) - Indian Rupee" },
  { value: "USD", label: "USD ($) - US Dollar" },
  { value: "EUR", label: "EUR (€) - Euro" },
  { value: "GBP", label: "GBP (£) - British Pound" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateTenantPage() {
  const api = useApi();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugModified, setSlugModified] = useState(false);
  const [planTier, setPlanTier] = useState<PlanTier>("standard");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [hubName, setHubName] = useState("Main Hub");
  const [hubCode, setHubCode] = useState("MUM-01");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  const [currency, setCurrency] = useState("INR");
  const [taxRate, setTaxRate] = useState("18");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugModified) {
      setSlug(slugify(val));
    }
    if (fieldErrors.name) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.name;
        return next;
      });
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugModified(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    if (fieldErrors.slug) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.slug;
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) {
      errors.name = "Tenant name is required.";
    }
    if (slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      errors.slug = "Slug may only contain lowercase letters, numbers, and hyphens.";
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      errors.contactEmail = "Please enter a valid email address.";
    }
    if (!hubName.trim()) {
      errors.hubName = "Default hub name is required.";
    }
    if (!hubCode.trim() || !/^[A-Za-z0-9_-]+$/.test(hubCode.trim())) {
      errors.hubCode = "Hub code must be alphanumeric (e.g. MUM-01).";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setGeneralError(null);

    try {
      const created = await api.createTenant({
        name: name.trim(),
        slug: slug.trim() || undefined,
        planTier,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        defaultHub: {
          name: hubName.trim(),
          code: hubCode.trim().toUpperCase(),
          timezone: timezone.trim() || "Asia/Kolkata",
        },
        settings: {
          currency,
          timezone: timezone.trim() || "Asia/Kolkata",
          taxRatePercent: taxRate ? Number(taxRate) : undefined,
        },
        metadata: {},
      });

      navigate(`/tenants/${created.id}`);
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "Failed to create tenant organization.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Tenants"
        title="Create Tenant"
        description="Set up a new organization, allocate plan resources, and provision the initial operating hub."
      />

      {generalError ? (
        <Alert tone="danger" title="Could not create tenant">
          {generalError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card
          title="Organization Details"
          description="Basic information and tenant identification."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Organization name"
              placeholder="e.g. FreshFold Mumbai Central"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              error={fieldErrors.name}
            />
            <Input
              label="URL Slug"
              placeholder="e.g. freshfold-mumbai"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              error={fieldErrors.slug}
              hint="Unique identifier used in domain routing and API paths"
            />
            <Select
              label="Plan tier"
              options={planTierOptions}
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value as PlanTier)}
            />
          </div>
        </Card>

        <Card
          title="Contact Information"
          description="Administrative point of contact for this tenant."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Contact email"
              type="email"
              placeholder="e.g. admin@freshfold.in"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value);
                if (fieldErrors.contactEmail) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.contactEmail;
                    return next;
                  });
                }
              }}
              error={fieldErrors.contactEmail}
            />
            <Input
              label="Contact phone"
              type="tel"
              placeholder="e.g. +91 98200 98200"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </Card>

        <Card
          title="Initial Operating Hub"
          description="Every tenant requires at least one primary hub for inventory and orders."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Hub name"
              placeholder="e.g. Mumbai Main Hub"
              value={hubName}
              onChange={(e) => setHubName(e.target.value)}
              error={fieldErrors.hubName}
            />
            <Input
              label="Hub code"
              placeholder="e.g. MUM-01"
              value={hubCode}
              onChange={(e) => setHubCode(e.target.value)}
              error={fieldErrors.hubCode}
              hint="Short alphanumeric code"
            />
            <Input
              label="Timezone"
              placeholder="Asia/Kolkata"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>
        </Card>

        <Card
          title="Initial Configuration & Settings"
          description="Default operational settings (stored in extensible JSON)."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Currency"
              options={currencyOptions}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
            <Input
              label="Tax Rate (%)"
              type="number"
              placeholder="18"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/tenants")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            leadingIcon={<BuildingIcon className="h-4 w-4" />}
          >
            Create tenant
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}

