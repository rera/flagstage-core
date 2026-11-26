import type { ReactNode } from "react";

import { MockShell } from "../../src/ui-mock/shell";

/** Throwaway review routes. They are not the feature. */
export default function MockLayout({ children }: { children: ReactNode }) {
  return <MockShell>{children}</MockShell>;
}
