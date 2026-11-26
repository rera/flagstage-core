"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "../app-shell";
import { accounts, championshipSites, digitalSites } from "./data";
import { mockSignOut } from "./sign-out";

/** Renders the real app shell with sample accounts. Throwaway UI mock. */
export function MockShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const viewer = pathname.endsWith("/view");
  const onDigital = pathname.startsWith("/a/digital");
  const importing = pathname.startsWith("/a/championships/import");
  const sites = onDigital
    ? digitalSites
    : importing
      ? championshipSites.filter((site) => site.id !== "pga")
      : championshipSites;
  const visibleAccounts = viewer
    ? accounts.filter((account) => account.slug === "championships")
    : accounts;
  return (
    <AppShell
      name="Flagstage"
      person={viewer ? "Riley Chen" : "Alex Morgan"}
      admin={!viewer}
      accounts={visibleAccounts}
      sites={sites}
      canCreate={!viewer}
      canEdit={!viewer}
      lastSlug={onDigital ? "digital" : "championships"}
      signOut={mockSignOut}
    >
      {children}
    </AppShell>
  );
}
