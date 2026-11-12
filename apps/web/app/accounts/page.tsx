import { EmptyState, t } from "@flagstage/ui";

export default function AccountsPage() {
  return <EmptyState title={t("accounts.title")} description={t("accounts.empty")} />;
}
