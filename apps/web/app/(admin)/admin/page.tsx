import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  t
} from "@flagstage/ui";
import { user } from "@flagstage/db";

import { setOrgRoleAction } from "../../../src/actions";
import { AdminPage } from "../../../src/admin-page";
import { database } from "../../../src/guard";

export default async function PeoplePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const people = await database().select().from(user).orderBy(user.email);
  const admins = people.filter((person) => person.org_role === "admin").length;
  return (
    <AdminPage
      title="People"
      description="Install admins. People on an account are managed from that account."
      stats={[
        { label: "People", value: String(people.length) },
        { label: "Admins", value: String(admins) }
      ]}
    >
      {params.error === "self" ? <Alert variant="destructive">{t("admin.last")}</Alert> : null}
      {people.length === 0 ? (
        <EmptyState
          title="No people yet"
          description="The first admin is created from the install config."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => {
              const admin = person.org_role === "admin";
              return (
                <TableRow key={person.id}>
                  <TableCell>{person.email}</TableCell>
                  <TableCell>{admin ? <Badge>{t("roles.admin")}</Badge> : "Member"}</TableCell>
                  <TableCell className="text-right">
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
      )}
    </AdminPage>
  );
}
