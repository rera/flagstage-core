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
    <form action={formAction} className="narrow">
      {children}
      <Button disabled={pending}>{submit}</Button>
      {state?.error ? <Alert tone="bad">{state.error}</Alert> : null}
      {state?.secret ? (
        <Alert tone="ok">
          {secretLabel} <code className="mono">{state.secret}</code>
        </Alert>
      ) : null}
    </form>
  );
}
