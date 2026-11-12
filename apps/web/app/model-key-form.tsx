"use client";

import { useActionState } from "react";

import { Alert, Button } from "@flagstage/ui";

type ModelState = { ok: boolean; detail: string } | null;

export function ModelKeyForm({
  action,
  label
}: {
  action: (previous: ModelState, formData: FormData) => Promise<{ ok: boolean; detail: string }>;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="narrow">
      <Button type="submit" variant="quiet" disabled={pending}>
        {label}
      </Button>
      {state ? <Alert tone={state.ok ? "ok" : "bad"}>{state.detail}</Alert> : null}
    </form>
  );
}
