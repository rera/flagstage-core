import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

const tones = {
  default: "border-border bg-card text-card-foreground",
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive"
} as const;

export function Alert({
  variant = "default",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof tones;
  children?: ReactNode;
}) {
  const role = variant === "default" ? "status" : "alert";
  return (
    <div
      role={role}
      className={cn("rounded-md border px-4 py-3 text-sm", tones[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}
