import { Alert, Button, PageHeader, TextField, t } from "@flagstage/ui";

import { signInWithPassword, requestPasswordReset } from "../../src/actions";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader title={t("nav.signIn")} description={t("signIn.description")} />
      {params.error ? <Alert tone="bad">{t("signIn.failed")}</Alert> : null}
      {params.reset ? <Alert tone="ok">{t("signIn.resetSent")}</Alert> : null}
      <form action={signInWithPassword} className="narrow">
        <TextField
          label={t("signIn.email")}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <TextField
          label={t("signIn.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit">{t("signIn.submit")}</Button>
      </form>
      <form action={requestPasswordReset} className="narrow">
        <TextField
          label={t("signIn.email")}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <Button type="submit" variant="quiet">
          {t("signIn.reset")}
        </Button>
      </form>
    </>
  );
}
