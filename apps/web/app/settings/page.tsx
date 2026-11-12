import { PageHeader, t } from "@flagstage/ui";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title={t("nav.settings")}
        description="Organization name, sign-in, and directory sync."
      />
      <p>{t("settings.pending")}</p>
    </>
  );
}
