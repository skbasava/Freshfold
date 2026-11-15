import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../../test/mocks/api";
import { renderWithApi } from "../../../test/render-with-api";
import { CreateHubPage } from "../CreateHubPage";
import { HubDetailPage } from "../HubDetailPage";
import { HubsPage } from "../HubsPage";
import { TenantDetailPage } from "../../tenants/TenantDetailPage";

function renderHubs(api = createMockApi({ latencyMs: 0, syncIssues: false })) {
  return renderWithApi(
    <Routes>
      <Route path="/hubs" element={<HubsPage />} />
      <Route path="/hubs/new" element={<CreateHubPage />} />
      <Route path="/hubs/:hubId" element={<HubDetailPage />} />
    </Routes>,
    api,
    { route: "/hubs" },
  );
}

function renderCreateHub(api = createMockApi({ latencyMs: 0, syncIssues: false })) {
  return renderWithApi(
    <Routes>
      <Route path="/hubs" element={<HubsPage />} />
      <Route path="/hubs/new" element={<CreateHubPage />} />
      <Route path="/hubs/:hubId" element={<HubDetailPage />} />
    </Routes>,
    api,
    { route: "/hubs/new" },
  );
}

function renderHubDetail(
  hubId: string,
  api = createMockApi({ latencyMs: 0, syncIssues: false }),
) {
  return renderWithApi(
    <Routes>
      <Route path="/hubs" element={<HubsPage />} />
      <Route path="/hubs/:hubId" element={<HubDetailPage />} />
    </Routes>,
    api,
    { route: `/hubs/${hubId}` },
  );
}

function renderTenantDetail(
  tenantId: string,
  api = createMockApi({ latencyMs: 0, syncIssues: false }),
) {
  return renderWithApi(
    <Routes>
      <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
      <Route path="/hubs/:hubId" element={<HubDetailPage />} />
    </Routes>,
    api,
    { route: `/tenants/${tenantId}` },
  );
}

describe("HubsPage", () => {
  it("renders hub directory with facilities and codes", async () => {
    renderHubs();

    expect(
      await screen.findByText("Bandra Central Processing Hub"),
    ).toBeInTheDocument();
    expect(screen.getByText("Andheri Intake & Drop Hub")).toBeInTheDocument();
    expect(screen.getByText("South Extension Processing Hub")).toBeInTheDocument();
    expect(screen.getByText("Indiranagar 100ft Hub")).toBeInTheDocument();

    expect(screen.getByText("BNDR")).toBeInTheDocument();
    expect(screen.getByText("ANDH")).toBeInTheDocument();
  });

  it("filters hubs by search query", async () => {
    const user = userEvent.setup();
    renderHubs();

    await screen.findByText("Bandra Central Processing Hub");

    const searchInput = screen.getByLabelText("Search hubs");
    await user.type(searchInput, "Andheri");

    expect(screen.getByText("Andheri Intake & Drop Hub")).toBeInTheDocument();
    expect(
      screen.queryByText("Bandra Central Processing Hub"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("South Extension Processing Hub"),
    ).not.toBeInTheDocument();
  });

  it("shows empty state when search matches nothing", async () => {
    const user = userEvent.setup();
    renderHubs();

    await screen.findByText("Bandra Central Processing Hub");

    const searchInput = screen.getByLabelText("Search hubs");
    await user.type(searchInput, "NonexistentFacilityQuery999");

    expect(
      await screen.findByText("No hubs match your filter"),
    ).toBeInTheDocument();
  });
});

describe("CreateHubPage", () => {
  it("provisions a new hub and auto-derives facility code", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    renderCreateHub(api);

    await user.type(
      screen.getByLabelText(/Hub Facility Name/i),
      "Koramangala Wash Depot",
    );

    // Code is automatically generated from facility name
    const codeInput = screen.getByLabelText(/Facility Code/i) as HTMLInputElement;
    expect(codeInput.value).toBe("KORAMA");

    await user.click(screen.getByRole("button", { name: "Provision Hub" }));

    // Redirects to hubs list with the newly created facility
    expect(
      await screen.findByText("Koramangala Wash Depot"),
    ).toBeInTheDocument();
  });
});

describe("HubDetailPage", () => {
  it("displays hub facility details, location, and operational parameters", async () => {
    renderHubDetail("hub-mumbai-main");

    expect(
      await screen.findByRole("heading", {
        name: /Bandra Central Processing Hub/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("BNDR")).toBeInTheDocument();
    expect(
      screen.getByText("102 Linking Road, Bandra West, Mumbai"),
    ).toBeInTheDocument();
    expect(screen.getByText("+919820011111")).toBeInTheDocument();
    expect(screen.getByText("800 kg / day")).toBeInTheDocument();
  });

  it("allows editing hub details via modal with optimistic locking", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    renderHubDetail("hub-mumbai-main", api);

    await screen.findByRole("heading", {
      name: /Bandra Central Processing Hub/i,
    });

    await user.click(screen.getByRole("button", { name: "Edit hub" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Edit Bandra Central Processing Hub",
      }),
    ).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText(/Facility name/i);
    fireEvent.change(nameInput, {
      target: { value: "Bandra Mega Processing Plant" },
    });

    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(
      await screen.findByRole("heading", {
        name: /Bandra Mega Processing Plant/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("deactivates hub via confirmation modal", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    renderHubDetail("hub-bangalore-indira", api);

    await screen.findByRole("heading", {
      name: /Indiranagar 100ft Hub/i,
    });

    await user.click(screen.getByRole("button", { name: "Deactivate hub" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Are you sure you want to deactivate/i),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Deactivate Hub" }),
    );

    // After deactivation, navigates back to /hubs
    expect(await screen.findByText("Processing Hubs")).toBeInTheDocument();
  });
});

describe("TenantDetailPage Hubs Management", () => {
  it("displays multiple hubs under the tenant and allows provisioning a new hub inline", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    renderTenantDetail("tenant-freshfold-mum", api);

    // Tenant info
    expect(
      await screen.findByRole("heading", { name: /FreshFold Mumbai Central/i }),
    ).toBeInTheDocument();

    // Multiple hubs for this tenant are listed
    expect(
      await screen.findByText("Bandra Central Processing Hub"),
    ).toBeInTheDocument();
    expect(screen.getByText("Andheri Intake & Drop Hub")).toBeInTheDocument();

    // Click "Add Hub" in the Processing Hubs card
    await user.click(screen.getByRole("button", { name: "Add Hub" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Provision Hub Facility" }),
    ).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText(/Facility Name/i);
    const codeInput = within(dialog).getByLabelText(/Facility Code/i);

    fireEvent.change(nameInput, { target: { value: "Colaba Intake Center" } });
    fireEvent.change(codeInput, { target: { value: "COLB" } });

    await user.click(
      within(dialog).getByRole("button", { name: "Provision Hub" }),
    );

    // The new hub appears in the tenant's hub table
    expect(await screen.findByText("Colaba Intake Center")).toBeInTheDocument();
    expect(screen.getByText("COLB")).toBeInTheDocument();
  });
});
