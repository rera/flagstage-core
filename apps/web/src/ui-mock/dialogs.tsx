"use client";

import { useRef, type ReactNode } from "react";

import { Button, Field, Label, fieldClass } from "@flagstage/ui";

import { ModalDialog } from "../modal-dialog";
import type { Person } from "./data";
import { RolePicker } from "./role-picker";

function DialogFrame({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <ModalDialog dialogRef={dialogRef} open>
      {children}
    </ModalDialog>
  );
}

function NameFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="First name" name="firstName" required autoComplete="off" />
      <Field label="Last name" name="lastName" required autoComplete="off" />
    </div>
  );
}

export function AddPersonDialog({ includeRole = true }: { includeRole?: boolean }) {
  return (
    <DialogFrame>
      <form className="space-y-4" action="#">
        <h2 className="text-lg font-semibold tracking-tight">Add person</h2>
        {includeRole ? null : (
          <p className="text-sm text-muted-foreground">They will be an account admin.</p>
        )}
        <NameFields />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          placeholder="name@example.com"
          autoComplete="off"
        />
        {includeRole ? <RolePicker selected="editor" /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="button">Add person</Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function ChangeRoleDialog({ person }: { person: Person }) {
  return (
    <DialogFrame>
      <form className="space-y-4" action="#">
        <h2
          tabIndex={-1}
          data-initial-focus
          className="text-lg font-semibold tracking-tight outline-none"
        >
          Change role
        </h2>
        <p className="text-sm">
          <span className="font-medium">{person.name}</span>
          <span className="text-muted-foreground"> · {person.email}</span>
        </p>
        <RolePicker selected={person.role} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="button">Save</Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function RemovePersonDialog({ person, siteName }: { person: Person; siteName: string }) {
  return (
    <DialogFrame>
      <form className="space-y-4" action="#">
        <h2
          tabIndex={-1}
          data-initial-focus
          className="text-lg font-semibold tracking-tight outline-none"
        >
          Remove {person.name}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {person.name} will lose access to {siteName}. Account admins are unchanged.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="button" variant="destructive">
            Remove
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function RemoveAccountPersonDialog({ person }: { person: Person }) {
  return (
    <DialogFrame>
      <form className="space-y-4" action="#">
        <h2
          tabIndex={-1}
          data-initial-focus
          className="text-lg font-semibold tracking-tight outline-none"
        >
          Remove {person.name}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {person.name} will no longer be an account admin. They will lose access to every site in
          Championships.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="button" variant="destructive">
            Remove
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function ImportOwnerDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <ModalDialog dialogRef={dialogRef} open>
      <form className="space-y-4" action="#">
        <h2 className="text-lg font-semibold tracking-tight">New site</h2>
        <Field label="Site name" name="name" required defaultValue="PGA Championship" />
        <Field
          label="Site address"
          name="sourceUrl"
          type="url"
          required
          defaultValue="https://pgachampionship.com"
        />
        <div className="space-y-2">
          <Label htmlFor="importer">Importer</Label>
          <select id="importer" name="source" className={fieldClass} defaultValue="public">
            <option value="public">Public website</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Public website was detected from this address. Change this if that&apos;s wrong.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accountId">Account</Label>
          <select
            id="accountId"
            name="accountId"
            className={fieldClass}
            defaultValue="championships"
          >
            <option value="championships">Championships</option>
            <option value="digital">Digital</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="owner">Owner</Label>
          <select id="owner" name="owner" className={fieldClass} defaultValue="jordan">
            <option value="jordan">Jordan Lee</option>
            <option value="taylor">Taylor Kim</option>
            <option value="sam">Sam Patel</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Jordan Lee · jordan.lee@example.com. Manages people, the domain, and go-live for this
            site.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="button">Import a site</Button>
        </div>
      </form>
    </ModalDialog>
  );
}
