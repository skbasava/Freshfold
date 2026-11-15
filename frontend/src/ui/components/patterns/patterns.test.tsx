import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrnBadge } from "./CrnBadge";
import { MetricCard } from "./MetricCard";
import { PaginationBar } from "./PaginationBar";
import { SearchFilterBar } from "./SearchFilterBar";
import { StatusPills } from "./StatusPills";

describe("Pattern Components", () => {
  describe("MetricCard", () => {
    it("renders label, value and triggers click", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <MetricCard
          label="Total Orders"
          value={42}
          subtext="Active in queue"
          icon={<span data-testid="icon">ICON</span>}
          tone="primary"
          active={true}
          onClick={handleClick}
        />,
      );

      expect(screen.getByText("Total Orders")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("Active in queue")).toBeInTheDocument();
      expect(screen.getByTestId("icon")).toBeInTheDocument();

      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("SearchFilterBar", () => {
    it("renders search input and responds to input changes", () => {
      const handleChange = vi.fn();
      render(
        <SearchFilterBar
          search="test"
          onSearchChange={handleChange}
          searchLabel="Search items"
          searchPlaceholder="Type here"
          filters={<div data-testid="custom-filter">Filter</div>}
        />,
      );

      expect(screen.getByLabelText("Search items")).toBeInTheDocument();
      expect(screen.getByTestId("custom-filter")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search items"), {
        target: { value: "new value" },
      });
      expect(handleChange).toHaveBeenCalledWith("new value");
    });
  });

  describe("StatusPills", () => {
    it("renders pills with active selection and triggers change", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      const items = [
        { value: "all", label: "All", count: 10 },
        { value: "pending", label: "Pending", count: 3 },
      ];

      render(
        <StatusPills
          items={items}
          activeValue="all"
          onChange={handleChange}
          showClear
          onClear={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /Pending/ })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Pending/ }));
      expect(handleChange).toHaveBeenCalledWith("pending");
    });
  });

  describe("CrnBadge", () => {
    it("renders CRN text and copy button", async () => {
      const user = userEvent.setup();
      render(<CrnBadge crn="crn:1:1:123" label="CRN" />);

      expect(screen.getByText("crn:1:1:123")).toBeInTheDocument();
      expect(screen.getByText("CRN")).toBeInTheDocument();
      const copyBtn = screen.getByTitle("Copy CRN identifier");
      await user.click(copyBtn);
      expect(await screen.findByText("✓")).toBeInTheDocument();
    });
  });

  describe("PaginationBar", () => {
    it("renders page info and fires navigation events", async () => {
      const user = userEvent.setup();
      const handlePageChange = vi.fn();
      const handleSizeChange = vi.fn();

      render(
        <PaginationBar
          page={2}
          pageCount={5}
          total={50}
          itemLabel="order"
          pageSize={10}
          pageSizeOptions={[10, 20]}
          onPageChange={handlePageChange}
          onPageSizeChange={handleSizeChange}
        />,
      );

      expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
      expect(screen.getByText("(50 orders total)")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Previous page" }));
      expect(handlePageChange).toHaveBeenCalledWith(1);

      await user.click(screen.getByRole("button", { name: "Next page" }));
      expect(handlePageChange).toHaveBeenCalledWith(3);

      await user.click(screen.getByRole("button", { name: "20" }));
      expect(handleSizeChange).toHaveBeenCalledWith(20);
    });
  });
});

