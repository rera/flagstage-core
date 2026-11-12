"use client";

import { useActionState, type ReactNode } from "react";

import { Alert, Button } from "@flagstage/ui";

type SecretState = { secret?: string; error?: string } | null;

export function SecretForm({
  action,
  submit,
  secretLabel,
  children
}: {
  action: (previous: SecretState, formData: FormData) => Promise<SecretState>;
  submit: string;
  secretLabel: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      <Button type="submit" disabled={pending}>
        {submit}
      </Button>
      {state?.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state?.secret ? (
        <Alert>
          {secretLabel} <code className="font-mono text-xs">{state.secret}</code>
        </Alert>
      ) : null}
    </form>
  );
}
