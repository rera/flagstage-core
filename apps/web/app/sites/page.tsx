import { EmptyState, t } from "@flagstage/ui";

export default function SitesPage() {
  return <EmptyState title={t("sites.title")} description={t("sites.pending")} />;
}
