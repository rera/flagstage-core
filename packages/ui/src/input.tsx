import type { InputHTMLAttributes } from "react";

import { cn } from "./cn";

export const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-[color,box-shadow,border-color] duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}
