import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { PageHeader, t } from "@flagstage/ui";
import { createHash } from "node:crypto";

import { user, verification } from "@flagstage/db";

import { getAuth } from "../../src/auth";
import { applyAuthResponse } from "../../src/cookies";
import { database } from "../../src/guard";
import { loadConfig } from "@flagstage/config";

export default async function BootstrapPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const identifier = `bootstrap:${createHash("sha256").update(token).digest("hex")}`;
  const rows = await database()
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1);
  const row = rows[0];
  if (!row || !token || row.expiresAt.getTime() < Date.now()) {
    return (
      <>
        <PageHeader title={t("bootstrap.title")} />
        <p>{t("bootstrap.invalid")}</p>
      </>
    );
  }
  const [email, password] = row.value.split("\n");
  if (!email || !password) return <p>{t("bootstrap.invalid")}</p>;
  const appUrl = loadConfig().APP_URL;
  const response = await getAuth().handler(
    new Request(`${appUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(appUrl).origin },
      body: JSON.stringify({ email, password })
    })
  );
  await applyAuthResponse(response);
  if (!response.ok) return <p>{t("bootstrap.invalid")}</p>;
  await database().delete(verification).where(eq(verification.id, row.id));
  await database().update(user).set({ emailVerified: true }).where(eq(user.email, email));
  redirect("/setup");
}
