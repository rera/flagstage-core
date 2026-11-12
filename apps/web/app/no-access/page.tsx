import { EmptyState, PageHeader, t } from "@flagstage/ui";

export default function NoAccessPage() {
  return (
    <>
      <PageHeader title={t("noAccess.title")} />
      <EmptyState title={t("noAccess.title")} description={t("noAccess.body")} />
    </>
  );
}
