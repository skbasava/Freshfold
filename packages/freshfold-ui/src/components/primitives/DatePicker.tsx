import { forwardRef } from "react";
import { Input, type InputProps } from "./Input";

export type DatePickerProps = Omit<InputProps, "type">;

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  function DatePicker(props, ref) {
    return <Input ref={ref} type="date" {...props} />;
  },
);
