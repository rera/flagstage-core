import { Alert, Button, PageHeader, TextField, t } from "@flagstage/ui";

import { signInWithPassword } from "../../src/actions";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader title={t("nav.signIn")} description={t("signIn.description")} />
      {params.error ? <Alert tone="bad">{t("signIn.failed")}</Alert> : null}
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
    </>
  );
}
