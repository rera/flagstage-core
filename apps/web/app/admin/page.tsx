import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import { Alert, Badge, Button, PageHeader, t } from "@flagstage/ui";
import { can } from "@flagstage/core";
import { user } from "@flagstage/db";

import { setOrgRoleAction } from "../../src/actions";
import { database, requirePrincipal } from "../../src/guard";

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await requirePrincipal();
  if (!can(principal, "org.manage")) redirect("/accounts");
  const params = await searchParams;
  let product: ReturnType<typeof loadConfig>["product"];
  try {
    product = loadConfig().product;
  } catch {
    product = undefined;
  }
  const people = await database().select().from(user).orderBy(user.email);
  return (
    <>
      <PageHeader title={t("admin.title")} description={t("admin.lead")} />
      <p>
        {product
          ? `Bedrock ${product.bedrockModelId} in ${product.region}. The task role calls it.`
          : "Bedrock is not configured."}
      </p>
      {params.error === "self" ? <Alert tone="bad">{t("admin.last")}</Alert> : null}
      <table className="data">
        <thead>
          <tr>
            <th>{t("members.person")}</th>
            <th>{t("members.role")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const admin = person.org_role === "admin";
            return (
              <tr key={person.id}>
                <td>{person.email}</td>
                <td>{admin ? <Badge>{t("roles.admin")}</Badge> : null}</td>
                <td>
                  <form action={setOrgRoleAction}>
                    <input type="hidden" name="userId" value={person.id} />
                    <input type="hidden" name="role" value={admin ? "none" : "admin"} />
                    <Button type="submit" variant="quiet">
                      {admin ? t("admin.demote") : t("admin.promote")}
                    </Button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
