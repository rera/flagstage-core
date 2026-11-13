"use client";

import { useRef } from "react";

import { Button, Field, Label, fieldClass } from "@flagstage/ui";

import { importSiteAction } from "./actions";
import { TimeZoneInput } from "./time-zone-input";

export function NewSiteDialog({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        New site
      </Button>
      <dialog
        ref={dialog}
        className="w-[min(100%,28rem)] rounded-xl border border-border bg-background p-6 text-foreground shadow-lg backdrop:bg-[#111620]/40"
      >
        <form action={importSiteAction} className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">New site</h2>
          <TimeZoneInput />
          <Field label="Site name" name="name" required />
          <Field label="Site address" name="sourceUrl" type="url" required />
          {accounts.length === 1 ? (
            <input type="hidden" name="accountId" value={accounts[0]?.id ?? ""} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="accountId">Account</Label>
              <select id="accountId" name="accountId" required className={fieldClass}>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit">Import a site</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
