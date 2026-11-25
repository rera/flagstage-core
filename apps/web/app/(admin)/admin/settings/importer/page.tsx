import { DEFAULT_DECISION_MODEL_ID } from "@flagstage/config";
import { getImporterSettings } from "@flagstage/core";
import {
  Badge,
  Button,
  Field,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  fieldClass
} from "@flagstage/ui";

import { saveImporterSettingsAction, toggleImporterAction } from "../../../../../src/actions";
import { database } from "../../../../../src/guard";
import { installedImporters } from "../../../../../src/installed-importers";
import { SettingsPage } from "../../../../../src/settings-nav";

function decisionModels(current: string) {
  const models = [{ modelId: DEFAULT_DECISION_MODEL_ID, label: "Claude Haiku 4.5" }];
  if (!models.some((model) => model.modelId === current)) {
    models.push({ modelId: current, label: current });
  }
  return models;
}

export default async function ImporterSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const settings = await getImporterSettings(database());
  const importers = installedImporters().map((item) => ({
    ...item,
    enabled: !settings.disabledImporters.includes(item.id)
  }));
  return (
    <SettingsPage
      current="importer"
      description="How this install imports sites, and the caps that apply."
    >
      {query.error ? (
        <p className="text-sm text-destructive">Enter whole numbers for the page and asset caps.</p>
      ) : null}
      <form
        id="importer-settings"
        action={saveImporterSettingsAction}
        className="max-w-md space-y-4"
      >
        <Field
          label="Decision model"
          id="decisionModel"
          hint="Used when the importer has to decide how to split a page. Runs on Bedrock. Default is Claude Haiku 4.5."
        >
          <select
            id="decisionModel"
            name="decisionModel"
            defaultValue={settings.decisionModel.modelId}
            className={fieldClass}
          >
            {decisionModels(settings.decisionModel.modelId).map((model) => (
              <option key={model.modelId} value={model.modelId}>
                {model.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="maxPages"
          name="maxPages"
          label="Max pages"
          type="number"
          inputMode="numeric"
          min={1}
          required
          defaultValue={settings.maxPages}
        />
        <Field
          id="maxAssets"
          name="maxAssets"
          label="Max assets"
          type="number"
          inputMode="numeric"
          min={1}
          required
          defaultValue={settings.maxAssets}
          hint="Images, files, and other media copied with the site."
        />
      </form>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Status</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Importer</TableHead>
              <TableHead>Detects</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {importers.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.detects}</TableCell>
                <TableCell>
                  {item.enabled ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <form action={toggleImporterAction}>
                    <input type="hidden" name="importer" value={item.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {item.enabled ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Controls</h2>
        <Button type="submit" form="importer-settings">
          Save
        </Button>
      </section>
    </SettingsPage>
  );
}
