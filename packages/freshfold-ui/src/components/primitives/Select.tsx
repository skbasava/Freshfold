import {
  forwardRef,
  useId,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon } from "../icons";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      label,
      options,
      placeholder,
      hint,
      error,
      containerClassName,
      className,
      id,
      required,
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const hintId = `${selectId}-hint`;
    const errorId = `${selectId}-error`;
    const descriptionIds = cn(
      describedBy,
      hint ? hintId : undefined,
      error ? errorId : undefined,
    );

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        <label htmlFor={selectId} className="text-sm font-medium text-text">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-1 text-danger-strong">
              *
            </span>
          ) : null}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={descriptionIds || undefined}
            className={cn(
              "min-h-11 w-full appearance-none rounded-md border border-border bg-surface px-3 py-2 pr-10 text-sm text-text transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-text-muted",
              error ? "border-danger" : undefined,
              className,
            )}
            {...props}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        </div>
        {hint ? (
          <p id={hintId} className="text-xs leading-5 text-text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="text-xs font-medium leading-5 text-danger-strong"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
