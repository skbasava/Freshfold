import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardBlockProps {
  title: string;
  value: string | number;
  badgeText?: string;
  footerTitle: string;
  footerSubtitle: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "success";
  loading?: boolean;
  className?: string;
}

const badgeToneClasses = {
  default: "text-foreground",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  success:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
} as const;

export function StatCardBlock({
  title,
  value,
  badgeText,
  footerTitle,
  footerSubtitle,
  icon: Icon,
  tone = "default",
  loading = false,
  className,
}: StatCardBlockProps) {
  return (
    <Card
      className={cn(
        "@container/card gap-3 bg-gradient-to-t from-primary/[0.03] to-card shadow-xs [--card-spacing:--spacing(5)]",
        className,
      )}
    >
      <CardHeader className="gap-1.5">
        <CardDescription>{title}</CardDescription>
        {loading ? (
          <Skeleton className="mt-1 h-8 w-20" />
        ) : (
          <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums @[220px]/card:text-3xl">
            {value}
          </CardTitle>
        )}
        {badgeText ? (
          <CardAction>
            <Badge
              variant="outline"
              className={cn("gap-1 font-medium", badgeToneClasses[tone])}
            >
              <Icon aria-hidden="true" className="size-3" />
              <span>{badgeText}</span>
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardFooter className="flex-col items-start gap-1 border-t-0 bg-transparent pt-0 pb-(--card-spacing) text-sm">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ) : (
          <>
            <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-foreground">
              <span>{footerTitle}</span>
              <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">{footerSubtitle}</p>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
