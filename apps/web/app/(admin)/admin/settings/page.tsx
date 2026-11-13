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
  return (
    <AdminPage
      title="Settings"
      description="How this install calls the model and serves sites."
      stats={[
        { label: "Model", value: model },
        { label: "Region", value: region },
        { label: "Domain", value: domain }
      ]}
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        These values come from flagstage.config.json. Change them there and redeploy. Budgets belong
        on each account. Time zones belong on each site.
      </p>
    </AdminPage>
  );
}
