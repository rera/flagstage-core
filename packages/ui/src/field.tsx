import type { InputHTMLAttributes, ReactNode } from "react";

import { Input } from "./input";
import { Label } from "./label";

export function Field({
  label,
  hint,
  id,
  children,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  children?: ReactNode;
}) {
  const fieldId = id ?? (typeof props.name === "string" ? props.name : undefined);
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      {children ?? <Input id={fieldId} {...props} />}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
