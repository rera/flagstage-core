import { account, site } from "@flagstage/db";
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@flagstage/ui";

import { AdminPage } from "../../../../src/admin-page";
import { database } from "../../../../src/guard";

export default async function AdminAccountsPage() {
  const db = database();
  const accounts = await db.select().from(account);
  const sites = await db.select().from(site);
  return (
    <AdminPage
      title="Accounts"
      description="Accounts that own sites on this install."
      stats={[
        { label: "Accounts", value: String(accounts.length) },
        { label: "Sites", value: String(sites.length) }
      ]}
    >
      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Create an account from the product, then import a site into it."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Sites</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="font-mono text-xs">{item.slug}</TableCell>
                <TableCell>{sites.filter((entry) => entry.accountId === item.id).length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminPage>
  );
}
