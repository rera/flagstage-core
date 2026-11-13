"use client";

import { useActionState, type ReactNode } from "react";

import { Alert, Button } from "@flagstage/ui";

type SecretState = { secret?: string; error?: string } | null;

export function SecretForm({
  action,
  submit,
  secretLabel,
  inline = false,
  children
}: {
  action: (previous: SecretState, formData: FormData) => Promise<SecretState>;
  submit: string;
  secretLabel: string;
  inline?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <div className={inline ? "flex flex-wrap items-end gap-2" : "space-y-4"}>
        {children}
        <Button type="submit" disabled={pending}>
          {submit}
        </Button>
      </div>
      {state?.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state?.secret ? (
        <Alert>
          {secretLabel} <code className="font-mono text-xs">{state.secret}</code>
        </Alert>
      ) : null}
    </form>
  );
}
