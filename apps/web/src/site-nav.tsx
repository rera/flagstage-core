import { Badge, buttonVariants, cn } from "@flagstage/ui";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Ready to publish";
  if (status === "failed") return "Didn't finish";
  return status;
}

export function SiteIdentity({
  siteId,
  name,
  status,
  host,
  published
}: {
  siteId: string;
  name: string;
  status: string;
  host: string;
  published?: string | null;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <Badge
            variant={
              status === "live" ? "success" : status === "failed" ? "destructive" : "default"
            }
          >
            {statusLabel(status)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{host}</span>
          {published
            ? ` · Published ${published}`
            : status === "live"
              ? ""
              : " · Nothing published yet"}
        </p>
      </div>
      <a href={`/sites/${siteId}/edit`} className={buttonVariants()}>
        Make changes
      </a>
    </header>
  );
}

const ITEMS = [
  { id: "overview", label: "Overview", path: "" },
  { id: "domain", label: "Domain", path: "/domain" },
  { id: "forms", label: "Forms", path: "/forms" },
  { id: "analytics", label: "Analytics", path: "/analytics" },
  { id: "scheduled", label: "Scheduled", path: "/scheduled" },
  { id: "settings", label: "Settings", path: "/settings" }
];

export function SiteNav({ siteId, current }: { siteId: string; current: string }) {
  return (
    <div className="border-b border-border pb-3">
      <nav className="flex flex-wrap gap-1" aria-label="Site">
        {ITEMS.map((item) => {
          const active = item.id === current;
          return (
            <a
              key={item.id}
              href={`/sites/${siteId}${item.path}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-[var(--wash)] hover:text-foreground",
                active && "bg-[var(--wash)] font-semibold text-foreground"
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
