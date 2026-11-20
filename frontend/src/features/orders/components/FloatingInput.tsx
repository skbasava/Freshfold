import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface FloatingInputProps extends React.ComponentProps<typeof Input> {
  label: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Keep label floated (use for datetime-local, which always shows a value) */
  alwaysFloat?: boolean;
}

export const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, icon, trailing, alwaysFloat, id, className, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;

    return (
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        ) : null}

        <Input
          ref={ref}
          id={inputId}
          placeholder=" "
          className={cn(
            "peer h-10 rounded-xl border-slate-200 bg-white text-xs focus-visible:border-blue-500",
            icon && "pl-9",
            className,
          )}
          {...props}
        />

        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 bg-white px-1 text-xs font-medium text-slate-400 transition-all duration-150 ease-out",
            icon ? "left-9" : "left-3",
            "peer-focus:left-2.5 peer-focus:top-0 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-blue-600",
            "peer-[:not(:placeholder-shown)]:left-2.5 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-bold peer-[:not(:placeholder-shown)]:text-blue-600",
            alwaysFloat && "left-2.5 top-0 text-[10px] font-bold text-blue-600",
          )}
        >
          {label}
        </label>

        {trailing ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>
    );
  },
);
FloatingInput.displayName = "FloatingInput";