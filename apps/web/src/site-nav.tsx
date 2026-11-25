import { Badge } from "@flagstage/ui";

import { Hostname } from "./hostname";
import { LocalTime } from "./local-time";

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
        <p className="mt-1 min-w-0 text-sm text-muted-foreground">
          <Hostname value={host} className="font-mono" />
          {published ? (
            <>
              {" · Published "}
              <LocalTime value={published} />
            </>
          ) : status === "live" ? (
            ""
          ) : (
            " · Nothing published yet"
          )}
        </p>
      </div>
    </header>
  );
}
