import type { ReactNode } from "react";

import { loadConfig } from "@flagstage/config";
import { Button, ProductShell, t } from "@flagstage/ui";

import { signOut } from "../../src/actions";
import { currentSession } from "../../src/auth";
import { viewerIsAdmin } from "../../src/guard";

export default async function AppLayout({ children }: { children: ReactNode }) {
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
  const links = [
    { href: "/accounts", label: t("nav.accounts") },
    { href: "/sites", label: t("nav.sites") },
    ...(admin ? [{ href: "/admin", label: t("nav.admin") }] : [])
  ];
  return (
    <ProductShell
      name={name}
      logoSrc={logoSrc}
      links={links}
      trailing={
        session?.user ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-[10px] px-2 py-1.5 text-sm font-medium marker:content-none">
              {person.split(" ")[0] || person}
            </summary>
            <div className="absolute right-0 z-overlay mt-1 min-w-40 rounded-xl border border-border bg-popover p-1.5 shadow-sm">
              <form action={signOut}>
                <Button type="submit" variant="ghost" className="w-full justify-start">
                  {t("nav.signOut")}
                </Button>
              </form>
            </div>
          </details>
        ) : (
          <a href="/sign-in" className="text-sm font-medium text-foreground">
            {t("nav.signIn")}
          </a>
        )
      }
    >
      {children}
    </ProductShell>
  );
}
