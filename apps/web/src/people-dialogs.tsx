"use client";

import { useActionState, useRef, type ReactNode } from "react";

import type { SiteRole } from "@flagstage/core";
import { Alert, Button, Field } from "@flagstage/ui";

import { ModalDialog } from "./modal-dialog";
import { RolePicker } from "./role-picker";

function DialogFrame({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <ModalDialog dialogRef={dialogRef} open>
      {children}
    </ModalDialog>
  );
}

function CloseButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
    >
      Cancel
    </a>
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

type AddState = { secret?: string; error?: string } | null;

export function AddPersonDialog({
  action,
  closeHref,
  includeRole = true,
  hidden
}: {
  action: (previous: AddState, formData: FormData) => Promise<AddState>;
  closeHref: string;
  includeRole?: boolean;
  hidden: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <DialogFrame>
      <form className="space-y-4" action={formAction}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <h2
          tabIndex={-1}
          data-initial-focus
          className="text-lg font-semibold tracking-tight outline-none"
        >
          Add person
        </h2>
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
        {state?.error ? <Alert variant="destructive">{state.error}</Alert> : null}
        {state?.secret ? (
          <Alert>
            Send this link. It is shown once.{" "}
            <code className="font-mono text-xs">{state.secret}</code>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <CloseButton href={closeHref} />
          <Button type="submit" disabled={pending}>
            Add person
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function ChangeRoleDialog({
  action,
  closeHref,
  person,
  hidden
}: {
  action: (formData: FormData) => Promise<void>;
  closeHref: string;
  person: { name: string; email: string; role: SiteRole };
  hidden: Record<string, string>;
}) {
  return (
    <DialogFrame>
      <form className="space-y-4" action={action}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
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
          <CloseButton href={closeHref} />
          <Button type="submit">Save</Button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function RemovePersonDialog({
  action,
  closeHref,
  title,
  body,
  hidden
}: {
  action: (formData: FormData) => Promise<void>;
  closeHref: string;
  title: string;
  body: string;
  hidden: Record<string, string>;
}) {
  return (
    <DialogFrame>
      <form className="space-y-4" action={action}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <h2
          tabIndex={-1}
          data-initial-focus
          className="text-lg font-semibold tracking-tight outline-none"
        >
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2">
          <CloseButton href={closeHref} />
          <Button type="submit" variant="destructive">
            Remove
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}
