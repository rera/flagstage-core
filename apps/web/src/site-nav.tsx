import { Badge } from "@flagstage/ui";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "importing") return "Importing";
  if (status === "preview") return "Ready to publish";
  if (status === "failed") return "Didn't finish";
  return status;
}

export function SiteIdentity({
  name,
  status,
  host,
  published
}: {
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
    </header>
  );
}
