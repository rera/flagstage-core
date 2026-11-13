import { redirect } from "next/navigation";

import { hasAnyAccess, loadGrants } from "@flagstage/core";
import { buttonVariants, t } from "@flagstage/ui";

import { currentSession } from "../../src/auth";
import { database, landingPath } from "../../src/guard";
import { Page } from "../../src/page";

export default async function HomePage() {
  try {
    const session = await currentSession();
    if (session?.user) {
      const grants = await loadGrants(database(), session.user.id);
      const principal = {
        id: session.user.id,
        orgRole: grants.orgRole,
        disabled: grants.disabled,
        memberships: grants.memberships
      };
      if (hasAnyAccess(principal)) redirect(await landingPath(principal));
    }
  } catch {
    // The public page still renders when sign-in is not configured.
  }
  return (
    <Page>
      <h1 className="max-w-xl text-2xl font-semibold tracking-tight">{t("app.name")}</h1>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{t("app.tagline")}</p>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        Paste the address, describe the change beside the preview, and publish when it looks right.
      </p>
      <a href="/sign-in" className={buttonVariants()}>
        {t("nav.signIn")}
      </a>
    </Page>
  );
}
