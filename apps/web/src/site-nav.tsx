import { buttonVariants, cn } from "@flagstage/ui";

const ITEMS = [
  { id: "overview", label: "Overview", path: "" },
  { id: "domain", label: "Domain", path: "/domain" },
  { id: "forms", label: "Forms", path: "/forms" },
  { id: "analytics", label: "Analytics", path: "/analytics" },
  { id: "scheduled", label: "Scheduled", path: "/scheduled" },
  { id: "settings", label: "Settings", path: "/settings" }
];

export function SiteNav({
  siteId,
  current,
  editor = true
}: {
  siteId: string;
  current: string;
  editor?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
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
      {editor ? (
        <a href={`/sites/${siteId}/edit`} className={buttonVariants()}>
          Make changes
        </a>
      ) : null}
    </div>
  );
}
