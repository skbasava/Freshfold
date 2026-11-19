import { cn } from "@/lib/utils";
import { Waves } from "lucide-react";

export interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  tone?: "default" | "inverted";
  subtitle?: string;
  className?: string;
}

const iconBoxSizes = {
  sm: "size-8 rounded-lg",
  md: "size-9 rounded-lg",
  lg: "size-11 rounded-xl",
} as const;

const iconSizes = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

const titleSizes = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

export function BrandMark({
  size = "md",
  tone = "default",
  subtitle,
  className,
}: BrandMarkProps) {
  const isInverted = tone === "inverted";

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center shadow-xs",
          iconBoxSizes[size],
          isInverted
            ? "bg-primary-foreground text-primary"
            : "bg-primary text-primary-foreground",
        )}
      >
        <Waves className={iconSizes[size]} />
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-heading font-semibold tracking-tight",
            titleSizes[size],
            isInverted ? "text-primary-foreground" : "text-foreground",
          )}
        >
          FreshFold
        </span>
        {subtitle ? (
          <span
            className={cn(
              "mt-0.5 text-xs",
              isInverted
                ? "text-primary-foreground/75"
                : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
