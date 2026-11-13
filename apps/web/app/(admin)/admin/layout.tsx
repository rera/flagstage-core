import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { can } from "@flagstage/core";

import { landingPath, requirePrincipal } from "../../../src/guard";
import { ShellFrame } from "../../../src/shell-frame";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect(await landingPath(principal));
  return <ShellFrame>{children}</ShellFrame>;
}
