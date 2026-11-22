import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const fixture = `http://127.0.0.1:${process.env.E2E_FIXTURE_PORT ?? "3999"}/`;
const storage = process.env.FS_STORAGE_DIR ?? "/tmp/flagstage-e2e-storage";

test("a clean import goes live", async ({ page }) => {
  const stamp = Date.now().toString(36);
  await signIn(page);
  await importSite(page, `Clean ${stamp}`);
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("status")).toHaveText("This snapshot is live.");
});

test("the first publish is blocked when a paragraph was removed from the import", async ({
  page
}) => {
  const stamp = Date.now().toString(36);
  await signIn(page);
  await importSite(page, `Loss ${stamp}`);
  const siteId = page.url().match(/\/sites\/([^/]+)\/edit/)?.[1];
  expect(siteId).toBeTruthy();
  const snaps = readdirSync(join(storage, "snapshots", siteId ?? ""));
  let edited = false;
  for (const snap of snaps) {
    const file = join(storage, "snapshots", siteId ?? "", snap, "src", "index.html");
    const html = readFileSync(file, "utf8");
    if (!html.includes("Welcome to the parks.")) continue;
    writeFileSync(file, html.replace("<p>Welcome to the parks.</p>", ""));
    edited = true;
  }
  expect(edited).toBe(true);

  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText('missing text "Welcome to the parks."')).toBeVisible();
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  const signInForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await signInForm.getByLabel("Email").fill("e2e@example.com");
  await signInForm.getByLabel("Password").fill("e2e-password-e2e-password");
  await signInForm.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts/);
}

async function importSite(page: Page, name: string) {
  await page.goto("/a/parks/sites");
  await page.getByRole("button", { name: "New site" }).click();
  await page.getByLabel("Site name").fill(name);
  await page.getByLabel("Site address").fill(fixture);
  await page.getByRole("button", { name: "Import a site" }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Make changes", exact: true }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  }).toPass({ timeout: 60_000 });
}
