"use client";

import { useRef } from "react";

import { Button, Field } from "@flagstage/ui";

import { createAccountAction } from "./actions";

export function NewAccountDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        New account
      </Button>
      <dialog
        ref={dialog}
        className="w-[min(100%,24rem)] rounded-xl border border-border bg-background p-6 text-foreground shadow-lg backdrop:bg-[#111620]/40"
      >
        <form action={createAccountAction} className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">New account</h2>
          <Field label="Name" name="name" required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit">Create account</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
