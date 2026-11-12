import type { LabelHTMLAttributes } from "react";

import { cn } from "./cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // Callers pass htmlFor or nest the control. This wrapper only forwards those props.
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label className={cn("text-sm font-medium text-foreground", className)} {...props} />
  );
}
