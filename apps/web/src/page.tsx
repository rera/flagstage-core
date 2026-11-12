import type { ReactNode } from "react";

import { cn } from "@flagstage/ui";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl space-y-6 px-6 py-6 sm:px-8", className)}>
      {children}
    </div>
  );
}
