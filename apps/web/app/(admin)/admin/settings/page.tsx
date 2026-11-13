import { loadConfig } from "@flagstage/config";

import { AdminPage } from "../../../../src/admin-page";

export default async function AdminSettingsPage() {
  let model = "Not configured";
  let region = "Not configured";
  let domain = "Not configured";
  try {
    const product = loadConfig().product;
    if (product) {
      model = product.bedrockModelId;
      region = product.region;
      domain = product.domain;
    }
  } catch {
    // Settings still render when the config file is missing.
  }
  const values = [
    { label: "Model", value: model },
    { label: "Region", value: region },
    { label: "Domain", value: domain }
  ];
  return (
    <AdminPage title="Settings" description="How this install calls the model and serves sites.">
      <dl className="grid gap-3 sm:grid-cols-3">
        {values.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 font-mono text-sm break-all">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-2xl text-sm text-muted-foreground">
        These values come from flagstage.config.json. Change them there and redeploy. Budgets belong
        on each account. Time zones belong on each site.
      </p>
    </AdminPage>
  );
}
