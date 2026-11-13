import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
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
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const descriptionIds = cn(
    describedBy,
    hint ? hintId : undefined,
    error ? errorId : undefined,
  );

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-danger-strong">
            *
          </span>
        ) : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={descriptionIds || undefined}
        className={cn(
          "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text transition-colors placeholder:text-text-muted hover:border-text-muted/50",
          "focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-text-muted",
          error ? "border-danger focus:border-danger" : undefined,
          className,
        )}
        {...props}
      />
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
});
