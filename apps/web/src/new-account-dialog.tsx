"use client";

import { useRef } from "react";

import { Button, Field } from "@flagstage/ui";

import { createAccountAction } from "./actions";
import { ModalDialog } from "./modal-dialog";

export function NewAccountDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        New account
      </Button>
      <ModalDialog dialogRef={dialog} cardClassName="max-w-sm">
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
      </ModalDialog>
    </>
  );
}
