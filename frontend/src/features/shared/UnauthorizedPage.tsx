import {
  Badge,
  Button,
  Card,
  EmptyState,
  LockIcon,
  PageContainer,
  PageHeader,
} from "@freshfold/ui";
import { useNavigate } from "react-router-dom";
import { roleLabel } from "../shell/navigation";
import type { Role } from "@laundry/contracts";

export interface UnauthorizedPageProps {
  role?: Role;
  resourceName?: string;
}

export function UnauthorizedPage({
  role,
  resourceName = "this page",
}: UnauthorizedPageProps) {
  const navigate = useNavigate();

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="403 Forbidden"
        title="Access Denied"
        description="You do not have permission to view or manage this area."
      />
      <Card className="p-8">
        <EmptyState
          icon={
            <div className="grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
              <LockIcon className="h-6 w-6" />
            </div>
          }
          title="Super Admin access required"
          description={`Only Super Administrators can access and manage ${resourceName}. Your account does not have sufficient administrative privileges.`}
          action={
            <div className="flex flex-col items-center gap-4">
              {role ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span>Current role:</span>
                  <Badge tone="warning">{roleLabel(role)}</Badge>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="primary" onClick={() => navigate("/")}>
                  Go to Dashboard
                </Button>
                <Button variant="secondary" onClick={() => navigate("/orders")}>
                  View Orders
                </Button>
              </div>
            </div>
          }
        />
      </Card>
    </PageContainer>
  );
}
