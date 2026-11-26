import { Badge, PageHeader, buttonVariants } from "@flagstage/ui";

import { Hostname } from "../../../../../src/hostname";
import { Page } from "../../../../../src/page";
import { championshipSites } from "../../../../../src/ui-mock/data";
import { ImportOwnerDialog } from "../../../../../src/ui-mock/dialogs";

export default function MockImportPage() {
  const existing = championshipSites.filter((site) => site.id !== "pga");
  return (
    <Page>
      <PageHeader
        title="Sites"
        description="Sites in this account."
        actions={
          <span className={buttonVariants()} aria-hidden>
            New site
          </span>
        }
      />
      <div className="grid gap-3">
        {existing.map((site) => (
          <a
            key={site.id}
            href={`/a/championships/sites/${site.id}/settings/people`}
            className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-[var(--wash)] sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-x-4"
          >
            <span className="min-w-0 truncate font-semibold">{site.name}</span>
            <Badge variant="success">Live</Badge>
            <Hostname value={site.host} truncate className="font-mono text-xs text-muted-foreground" />
          </a>
        ))}
      </div>
      <ImportOwnerDialog />
    </Page>
  );
}
