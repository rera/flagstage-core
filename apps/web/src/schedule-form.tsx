"use client";

import { useEffect, useState } from "react";

import { Button, Label } from "@flagstage/ui";

import { schedulePublishAction } from "./actions";

export function SchedulePanel({
  siteId,
  accountId,
  snapshotId
}: {
  siteId: string;
  accountId: string;
  snapshotId: string;
}) {
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) setZone(resolved);
  }, []);
  return (
    <div className="relative">
      <Button type="button" variant="outline" onClick={() => setOpen((value) => !value)}>
        Schedule
      </Button>
      {open ? (
        <form
          action={schedulePublishAction}
          className="absolute right-0 z-overlay mt-2 w-72 space-y-3 rounded-xl border border-border bg-popover p-3 shadow-sm"
        >
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="snapshotId" value={snapshotId} />
          <input type="hidden" name="timeZone" value={zone} />
          <p className="text-xs text-muted-foreground">{zone}</p>
          <div className="space-y-1">
            <Label htmlFor="publishAt">Publish at</Label>
            <input
              id="publishAt"
              name="publishAt"
              type="datetime-local"
              required
              className="h-9 w-full rounded-md border border-input px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="revertAt">Revert at</Label>
            <input
              id="revertAt"
              name="revertAt"
              type="datetime-local"
              className="h-9 w-full rounded-md border border-input px-2 text-sm"
            />
          </div>
          <Button type="submit" className="w-full">
            Save schedule
          </Button>
        </form>
      ) : null}
    </div>
  );
}
