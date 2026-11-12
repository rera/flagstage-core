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

export default async function AdminSitesPage() {
  const db = database();
  const sites = await db.select().from(site);
  const accounts = await db.select().from(account);
  const names = new Map(accounts.map((item) => [item.id, item.name]));
  const live = sites.filter((item) => item.status === "live").length;
  return (
    <AdminPage
      title="Sites"
      description="Every site on this install, with the account that owns it."
      stats={[
        { label: "Sites", value: String(sites.length) },
        { label: "Live", value: String(live) }
      ]}
    >
      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Import a site from the product. It shows up here when the crawl starts."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <a href={`/sites/${item.id}`} className="hover:underline">
                    {item.name}
                  </a>
                </TableCell>
                <TableCell>{names.get(item.accountId) ?? item.accountId}</TableCell>
                <TableCell className="font-mono text-xs">{item.slug}.localhost</TableCell>
                <TableCell className="capitalize">{item.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminPage>
  );
}
