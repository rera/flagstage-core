import { EmptyState, PageHeader, t } from "@flagstage/ui";

import { Page } from "../../../src/page";

export default function NoAccessPage() {
  return (
    <Page>
      <PageHeader title={t("noAccess.title")} />
      <EmptyState title={t("noAccess.title")} description={t("noAccess.body")} />
    </Page>
  );
}
