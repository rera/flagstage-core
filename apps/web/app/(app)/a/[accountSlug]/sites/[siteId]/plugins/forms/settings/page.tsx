import { Button, EmptyState, Field } from "@flagstage/ui";

import { updateFormSettingsAction } from "../../../../../../../../../src/forms-actions";
import { loadFormsPlugin } from "../../../../../../../../../src/forms-data";
import { FormsPluginFrame } from "../../../../../../../../../src/forms-plugin";

const ERRORS: Record<string, string> = {
  email: "Enter an email address.",
  webhook: "Enter a webhook URL that starts with https://.",
  save: "That form could not be saved."
};

export default async function FormsPluginSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ accountSlug: string; siteId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { accountSlug, siteId } = await params;
  const query = await searchParams;
  const { found, forms, canManage, base } = await loadFormsPlugin(accountSlug, siteId);
  const error = query.error ? ERRORS[query.error] : undefined;
  return (
    <FormsPluginFrame site={found} base={base} current="settings">
      {forms.length === 0 ? (
        <EmptyState
          className="max-w-xl"
          title="No forms yet"
          description="Notification settings show up after an import finds a form."
        />
      ) : (
        <div className="grid max-w-xl gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {forms.map((form) =>
            canManage ? (
              <form
                key={form.id}
                action={updateFormSettingsAction}
                className="space-y-4 rounded-xl border border-border bg-card px-4 py-4"
              >
                <h3 className="text-base font-semibold">{form.name}</h3>
                <input type="hidden" name="siteId" value={found.id} suppressHydrationWarning />
                <input type="hidden" name="formId" value={form.id} suppressHydrationWarning />
                <input
                  type="hidden"
                  name="accountSlug"
                  value={accountSlug}
                  suppressHydrationWarning
                />
                <Field
                  id={`${form.id}-notify`}
                  label="Notification email"
                  name="notifyEmail"
                  type="text"
                  autoComplete="off"
                  defaultValue={form.notifyEmails.join(", ")}
                  hint="Separate more than one address with a comma."
                />
                <Field
                  id={`${form.id}-webhook`}
                  label="Webhook URL"
                  name="webhookUrl"
                  type="url"
                  autoComplete="off"
                  defaultValue={form.webhookUrl ?? ""}
                  hint="Optional. Each submission is posted here."
                />
                <Button type="submit">Save</Button>
              </form>
            ) : (
              <section
                key={form.id}
                className="space-y-3 rounded-xl border border-border bg-card px-4 py-4 text-sm"
              >
                <h3 className="text-base font-semibold">{form.name}</h3>
                <p>
                  <span className="text-muted-foreground">Notification email</span>
                  <span className="mt-1 block">
                    {form.notifyEmails.length > 0 ? form.notifyEmails.join(", ") : "None"}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Webhook URL</span>
                  <span className="mt-1 block break-all">{form.webhookUrl || "None"}</span>
                </p>
              </section>
            )
          )}
        </div>
      )}
    </FormsPluginFrame>
  );
}
