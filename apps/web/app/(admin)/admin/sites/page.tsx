import { Badge, EmptyState, PageHeader } from "@flagstage/ui";
import { account, site } from "@flagstage/db";

import { database } from "../../../../src/guard";
import { Page } from "../../../../src/page";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Draft";
  if (status === "failed") return "Didn't finish";
  return status;
}

export default async function AdminSitesPage() {
  const db = database();
  const sites = await db.select().from(site);
  const accounts = await db.select().from(account);
  const byId = new Map(accounts.map((row) => [row.id, row]));
  const ordered = [...sites].sort((left, right) => left.name.localeCompare(right.name));
  return (
    <Page>
      <PageHeader title="Sites" description="Every site, across accounts." />
      {ordered.length === 0 ? (
        <EmptyState title="No sites yet" description="Imported sites show up here." />
      ) : (
        <div className="grid gap-3">
          {ordered.map((row) => {
            const owner = byId.get(row.accountId);
            if (!owner) return null;
            return (
              <a
                key={row.id}
                href={`/a/${owner.slug}/sites/${row.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)]"
              >
                <span>
                  <span className="block font-semibold">{row.name}</span>
                  <span className="text-sm text-muted-foreground">{owner.name}</span>
                </span>
                <Badge variant={row.status === "live" ? "success" : "default"}>
                  {statusLabel(row.status)}
                </Badge>
              </a>
            );
          })}
        </div>
      )}
    </Page>
  );
}
