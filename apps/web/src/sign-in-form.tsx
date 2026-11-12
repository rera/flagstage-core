"use client";

import { useRef } from "react";

import { Alert, Button, Input, Label, t } from "@flagstage/ui";

import { requestPasswordReset, signInWithPassword } from "./actions";

export function SignInForm({ failed, sent }: { failed: boolean; sent: boolean }) {
  const signInRef = useRef<HTMLFormElement>(null);
  const resetRef = useRef<HTMLFormElement>(null);
  return (
    <div className="flex flex-col gap-4">
      {failed ? <Alert variant="destructive">{t("signIn.failed")}</Alert> : null}
      {sent ? <Alert>{t("signIn.resetSent")}</Alert> : null}
      <form
        id="sign-in"
        ref={signInRef}
        action={signInWithPassword}
        className="flex flex-col gap-4"
      >
        <div className="space-y-2 text-left">
          <Label htmlFor="email">{t("signIn.email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="you@company.com"
          />
        </div>
        <div className="space-y-2 text-left">
          <Label htmlFor="password">{t("signIn.password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <button
          type="submit"
          form="reset-password"
          className="w-fit text-left text-sm font-medium text-primary"
          onClick={() => {
            const typed = signInRef.current?.querySelector<HTMLInputElement>('input[name="email"]');
            const hidden = resetRef.current?.querySelector<HTMLInputElement>('input[name="email"]');
            if (typed && hidden) hidden.value = typed.value;
          }}
        >
          {t("signIn.forgot")}
        </button>
        <Button type="submit" size="lg" className="w-full">
          {t("signIn.submit")}
        </Button>
      </form>
      <form id="reset-password" ref={resetRef} action={requestPasswordReset}>
        <input type="hidden" name="email" defaultValue="" />
      </form>
    </div>
  );
}
