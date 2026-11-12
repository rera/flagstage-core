import { buttonVariants, t } from "@flagstage/ui";

import { Page } from "../../src/page";

export default function HomePage() {
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
