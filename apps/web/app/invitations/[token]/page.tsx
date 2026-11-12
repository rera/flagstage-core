import { Button, PageHeader, t } from "@flagstage/ui";

import { acceptInviteAction } from "../../../src/actions";
import { currentSession } from "../../../src/auth";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await currentSession();
  return (
    <>
      <PageHeader title={t("invite.title")} description={t("invite.description")} />
      {session?.user ? (
        <form action={acceptInviteAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit">{t("invite.accept")}</Button>
        </form>
      ) : (
        <p>
          <a href="/sign-in">{t("invite.signIn")}</a>
        </p>
      )}
    </>
  );
}
