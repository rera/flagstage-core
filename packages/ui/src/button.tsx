import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

const variants = {
  default:
    "bg-primary text-primary-foreground hover:bg-primary/90 motion-safe:active:translate-y-px",
  outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-white hover:bg-destructive/90 motion-safe:active:translate-y-px"
} as const;

const sizes = {
  default: "h-9 px-4",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-4",
  icon: "size-9"
} as const;

export function buttonVariants({
  variant = "default",
  size = "default",
  className
}: {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,opacity,transform] duration-150 ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4",
    variants[variant],
    sizes[size],
    className
  );
}

export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
