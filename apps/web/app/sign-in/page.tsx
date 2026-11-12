import { PageHeader, t } from "@flagstage/ui";

export default function SignInPage() {
  return (
    <>
      <PageHeader
        title={t("nav.signIn")}
        description="Email and password, or your identity provider."
      />
      <p>{t("signIn.pending")}</p>
    </>
  );
}
