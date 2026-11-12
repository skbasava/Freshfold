import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  PageContainer,
  PageHeader,
  SearchIcon,
  UsersIcon,
  type DataTableColumn,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateKey, localDateKey } from "../../lib/format";
import { useMockApi } from "../../mocks/context";
import type { CustomerListResult, MockCustomerSummary } from "../../mocks/types";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: CustomerListResult }
  | { status: "error" };

const columns: DataTableColumn<MockCustomerSummary>[] = [
  {
    key: "customer",
    header: "Customer",
    render: (customer) => (
      <div>
        <p className="font-semibold text-text">{customer.name}</p>
        <p className="text-xs text-text-muted">{customer.id}</p>
      </div>
    ),
  },
  {
    key: "orders",
    header: "Orders",
    render: (customer) =>
      `${customer.orderCount} order${customer.orderCount === 1 ? "" : "s"}`,
  },
  {
    key: "last",
    header: "Last order",
    render: (customer) =>
      customer.lastOrderAt
        ? formatDateKey(localDateKey(customer.lastOrderAt))
        : "No orders yet",
  },
  {
    key: "open",
    header: "",
    align: "right",
    render: (customer) => (
      <Link
        to={`/customers/${customer.id}`}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        View {customer.name}
      </Link>
    ),
  },
];

export function CustomersPage() {
  const api = useMockApi();
  const [search, setSearch] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    api
      .listCustomers({ search, pageSize: 20 })
      .then((data) => {
        if (!cancelled) {
          setState({ status: "success", data });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, search, reloadToken]);

  const data = state.status === "success" ? state.data : null;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description="Find a customer and review their orders. Phone numbers stay hidden in the list."
      />

      <Card title="Find a customer" description="Search by name or phone.">
        <Input
          label="Search customers"
          placeholder="Name or phone number"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Card>

      {state.status === "loading" ? (
        <LoadingState label="Loading customers" variant="table" rows={3} />
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load customers"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </Alert>
      ) : null}

      {data ? (
        <DataTable
          caption="Customers"
          columns={columns}
          rows={data.items}
          getRowKey={(customer) => customer.id}
          emptyState={
            search.trim() ? (
              <EmptyState
                icon={<SearchIcon className="h-6 w-6" />}
                title="No customers found"
                description="Try a different name or phone number."
                action={
                  <Button variant="secondary" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<UsersIcon className="h-6 w-6" />}
                title="No customers found"
                description="Customers appear here automatically when orders are created."
              />
            )
          }
        />
      ) : null}
    </PageContainer>
  );
}
