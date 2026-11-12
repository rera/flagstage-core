import { redirect } from "next/navigation";

import { loadConfig } from "@flagstage/config";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";
import { can } from "@flagstage/core";
import { user } from "@flagstage/db";

import { setOrgRoleAction } from "../../../src/actions";
import { database, requirePrincipal } from "../../../src/guard";
import { Page } from "../../../src/page";

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
  const db = database();
  const people = await db.select().from(user).orderBy(user.email);
  return (
    <Page>
      <PageHeader
        title={t("admin.title")}
        description={t("admin.lead")}
        actions={
          <a href="/admin/usage" className="text-sm font-medium text-primary">
            {t("admin.usageLink")}
          </a>
        }
      />
      <p className="text-sm text-muted-foreground">
        {product
          ? `Bedrock ${product.bedrockModelId} in ${product.region}. The task role calls it.`
          : "Bedrock is not configured."}
      </p>
      {params.error === "self" ? <Alert variant="destructive">{t("admin.last")}</Alert> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("members.person")}</TableHead>
            <TableHead>{t("members.role")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => {
            const admin = person.org_role === "admin";
            return (
              <TableRow key={person.id}>
                <TableCell>{person.email}</TableCell>
                <TableCell>{admin ? <Badge>{t("roles.admin")}</Badge> : null}</TableCell>
                <TableCell>
                  <form action={setOrgRoleAction}>
                    <input type="hidden" name="userId" value={person.id} />
                    <input type="hidden" name="role" value={admin ? "none" : "admin"} />
                    <Button type="submit" variant="outline" size="sm">
                      {admin ? t("admin.demote") : t("admin.promote")}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Page>
  );
}
