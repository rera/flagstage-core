import type { ReactNode } from "react";

import { cn } from "@flagstage/ui";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1120px] space-y-6 px-4 py-8 sm:px-6", className)}>
      {children}
    </div>
  );
}
