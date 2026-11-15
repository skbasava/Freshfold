import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../../test/mocks/api";
import { renderWithApi } from "../../../test/render-with-api";
import { CreateTenantPage } from "../CreateTenantPage";
import { TenantDetailPage } from "../TenantDetailPage";
import { TenantsPage } from "../TenantsPage";

function renderTenants(api = createMockApi({ latencyMs: 0, syncIssues: false })) {
  return renderWithApi(
    <Routes>
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/tenants/new" element={<CreateTenantPage />} />
      <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
    </Routes>,
    api,
    { route: "/tenants" },
  );
}

function renderCreateTenant(api = createMockApi({ latencyMs: 0, syncIssues: false })) {
  return renderWithApi(
    <Routes>
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/tenants/new" element={<CreateTenantPage />} />
      <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
    </Routes>,
    api,
    { route: "/tenants/new" },
  );
}

function renderTenantDetail(
  tenantId: string,
  api = createMockApi({ latencyMs: 0, syncIssues: false }),
) {
  return renderWithApi(
    <Routes>
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
    </Routes>,
    api,
    { route: `/tenants/${tenantId}` },
  );
}

describe("TenantsPage", () => {
  it("renders tenant list with badges and navigation links", async () => {
    renderTenants();

    expect(
      await screen.findByText("FreshFold Mumbai Central"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sparkle Clean Delhi")).toBeInTheDocument();
    expect(screen.getByText("Spin Cycle Indiranagar")).toBeInTheDocument();

    expect(screen.getAllByText("PRO").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Trial").length).toBeGreaterThan(0);

    const viewLinks = screen.getAllByRole("link", { name: "View details" });
    expect(viewLinks.length).toBeGreaterThanOrEqual(3);
    expect(
      viewLinks.some(
        (link) => link.getAttribute("href") === "/tenants/tenant-freshfold-mum",
      ),
    ).toBe(true);
  });

  it("filters tenants by search query", async () => {
    const user = userEvent.setup();
    renderTenants();

    await screen.findByText("FreshFold Mumbai Central");
    await user.type(screen.getByLabelText("Search tenants"), "sparkle");

    expect(await screen.findByText("Sparkle Clean Delhi")).toBeInTheDocument();
    expect(
      screen.queryByText("FreshFold Mumbai Central"),
    ).not.toBeInTheDocument();
  });

  it("filters tenants by status dropdown", async () => {
    const user = userEvent.setup();
    renderTenants();

    await screen.findByText("FreshFold Mumbai Central");
    await user.selectOptions(screen.getByLabelText("Status"), "trial");

    expect(
      await screen.findByText("Spin Cycle Indiranagar"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("FreshFold Mumbai Central"),
    ).not.toBeInTheDocument();
  });

  it("shows empty state when filter matches nothing", async () => {
    const user = userEvent.setup();
    renderTenants();

    await screen.findByText("FreshFold Mumbai Central");
    await user.type(screen.getByLabelText("Search tenants"), "nonexistent-xyz");

    expect(await screen.findByText("No tenants found")).toBeInTheDocument();
  });
});

describe("CreateTenantPage", () => {
  it("validates required fields", async () => {
    const user = userEvent.setup();
    renderCreateTenant();

    await user.click(screen.getByRole("button", { name: "Create tenant" }));

    expect(
      await screen.findByText("Tenant name is required."),
    ).toBeInTheDocument();
  });

  it("auto-generates slug and successfully submits new tenant", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0 });
    renderCreateTenant(api);

    await user.type(
      screen.getByLabelText(/Organization name/i),
      "Bandra Express Cleaners",
    );

    // Slug should be auto-derived
    const slugInput = screen.getByLabelText("URL Slug") as HTMLInputElement;
    expect(slugInput.value).toBe("bandra-express-cleaners");

    await user.click(screen.getByRole("button", { name: "Create tenant" }));

    // Should navigate to the tenant detail page
    expect(
      await screen.findByRole("heading", { name: /Bandra Express Cleaners/i }),
    ).toBeInTheDocument();
  });
});

describe("TenantDetailPage", () => {
  it("displays tenant details, configuration, and metadata", async () => {
    renderTenantDetail("tenant-freshfold-mum");

    expect(
      await screen.findByRole("heading", {
        name: /FreshFold Mumbai Central/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("tenant-freshfold-mum")).toBeInTheDocument();
    expect(screen.getByText("ops@freshfold.in")).toBeInTheDocument();
    expect(screen.getByText("+919820098200")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("allows editing tenant details via modal", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0 });
    renderTenantDetail("tenant-freshfold-mum", api);

    await screen.findByRole("heading", {
      name: /FreshFold Mumbai Central/i,
    });
    await user.click(screen.getByRole("button", { name: "Edit tenant" }));

    // Modal opens
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Edit FreshFold Mumbai Central",
      }),
    ).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText(/Organization name/i);
    fireEvent.change(nameInput, {
      target: { value: "FreshFold Mumbai Flagship" },
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    // Updated in UI and version incremented
    expect(
      await screen.findByRole("heading", {
        name: /FreshFold Mumbai Flagship/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("soft-deletes a tenant via ConfirmDialog", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0 });
    renderTenantDetail("tenant-spin-bangalore", api);

    await screen.findByRole("heading", {
      name: /Spin Cycle Indiranagar/i,
    });
    await user.click(screen.getByRole("button", { name: "Delete tenant" }));

    // Confirm dialog appears
    const alertDialog = await screen.findByRole("alertdialog");
    expect(
      within(alertDialog).getByText("Delete Tenant Organization"),
    ).toBeInTheDocument();
    expect(
      within(alertDialog).getByText(/A 30-day recovery period applies/i),
    ).toBeInTheDocument();

    await user.click(
      within(alertDialog).getByRole("button", { name: "Delete tenant" }),
    );

    // After soft-delete, banner shows tenant is deleted
    expect(
      await screen.findByText("Tenant is marked as deleted"),
    ).toBeInTheDocument();
    expect(screen.getByText("DELETED")).toBeInTheDocument();
  });

  it("shows not found state for nonexistent tenant", async () => {
    renderTenantDetail("tenant-does-not-exist");

    expect(await screen.findByText("Tenant not found")).toBeInTheDocument();
  });
});

