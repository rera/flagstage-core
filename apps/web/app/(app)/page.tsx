import { t } from "@flagstage/ui";

import { Page } from "../../src/page";

export default function HomePage() {
  return (
    <Page className="py-16">
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight">{t("app.name")}</h1>
      <p className="max-w-xl text-base leading-relaxed text-muted-foreground">{t("app.tagline")}</p>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        Paste the address, describe the change beside the preview, and publish when it looks right.
      </p>
      <a
        href="/sign-in"
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {t("nav.signIn")}
      </a>
    </Page>
  );
}
