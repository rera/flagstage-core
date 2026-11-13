import { eq } from "drizzle-orm";

import { hashToken } from "@flagstage/core";
import { invitation } from "@flagstage/db";
import { Button, EmptyState, PageHeader, t } from "@flagstage/ui";

import { acceptInviteAction } from "../../../../src/actions";
import { currentSession } from "../../../../src/auth";
import { database } from "../../../../src/guard";
import { Page } from "../../../../src/page";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await currentSession();
  const rows = await database()
    .select()
    .from(invitation)
    .where(eq(invitation.tokenHash, hashToken(token)))
    .limit(1);
  const invite = rows[0];
  const invalid = !invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now();
  if (invalid) {
    return (
      <Page>
        <EmptyState
          title="This invitation is not valid"
          description="It may have expired, already been used, or the link is wrong."
          action={
            <a href="/accounts" className="text-sm font-medium text-primary">
              Back to accounts
            </a>
          }
        />
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader title={t("invite.title")} description={t("invite.description")} />
      {session?.user ? (
        <form action={acceptInviteAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit">{t("invite.accept")}</Button>
        </form>
      ) : (
        <p>
          <a href="/sign-in" className="text-sm font-medium text-primary">
            {t("invite.signIn")}
          </a>
        </p>
      )}
    </Page>
  );
}
