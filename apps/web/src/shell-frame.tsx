import type { ReactNode } from "react";

import { loadConfig } from "@flagstage/config";

import { AppShell } from "./app-shell";
import { signOut } from "./actions";
import { currentSession } from "./auth";
import { viewerIsAdmin } from "./guard";

export async function ShellFrame({ children }: { children: ReactNode }) {
  const admin = await viewerIsAdmin();
  const session = await currentSession();
  let name = "Flagstage";
  let logoSrc: string | null = null;
  try {
    const product = loadConfig().product;
    if (product) {
      name = product.brand.name || name;
      if (product.brand.logo) logoSrc = "/brand/logo";
    }
  } catch {
    // The shell still renders when configuration is incomplete.
  }
  const person = session?.user?.name || session?.user?.email || "";
  return (
    <AppShell name={name} logoSrc={logoSrc} person={person} admin={admin} signOut={signOut}>
      {children}
    </AppShell>
  );
}
