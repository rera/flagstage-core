import type { ReactNode } from "react";

import { ShellFrame } from "../../src/shell-frame";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ShellFrame>{children}</ShellFrame>;
}
