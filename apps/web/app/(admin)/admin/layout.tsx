import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Button } from "@flagstage/ui";
import { can } from "@flagstage/core";

import { signOut } from "../../../src/actions";
import { AdminShell } from "../../../src/admin-shell";
import { requirePrincipal } from "../../../src/guard";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const label = principal.name?.split(" ")[0] || principal.email;
  return (
    <AdminShell
      footer={
        <div className="space-y-2">
          <p className="truncate px-1 text-sm font-medium">{label}</p>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </div>
      }
    >
      {children}
    </AdminShell>
  );
}
