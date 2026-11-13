import {
  Card,
  EmptyState,
  PageContainer,
  PageHeader,
} from "@freshfold/ui";

export interface ComingSoonPageProps {
  title: string;
  description: string;
}

export function ComingSoonPage({
  title,
  description,
}: ComingSoonPageProps) {
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader eyebrow="Next stage" title={title} description={description} />
      <Card>
        <EmptyState
          title={`${title} is coming next`}
          description="The dashboard is ready. This screen will use the same FreshFold shell, spacing and components."
        />
      </Card>
    </PageContainer>
  );
}
