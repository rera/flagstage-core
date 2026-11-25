import { getEditSettings } from "@flagstage/core";
import { Button, Field } from "@flagstage/ui";

import { saveEditSettingsAction } from "../../../../../src/actions";
import { database } from "../../../../../src/guard";
import { SettingsPage } from "../../../../../src/settings-nav";

export default async function EditorSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const settings = await getEditSettings(database());
  return (
    <SettingsPage current="editor" description="Limits for hand edits on a site.">
      {query.error ? (
        <p className="text-sm text-destructive">
          Enter a whole number for the hand-edit page limit.
        </p>
      ) : null}
      <form action={saveEditSettingsAction} className="max-w-md space-y-4">
        <Field
          id="handEditPageLimit"
          name="handEditPageLimit"
          label="Hand-edit page limit"
          type="number"
          inputMode="numeric"
          min={0}
          required
          defaultValue={settings.handEditPageLimit}
          hint="A change that hand-edits more pages than this is sent back to be done with the editing tools instead. Default is 8."
        />
        <Button type="submit">Save</Button>
      </form>
    </SettingsPage>
  );
}
