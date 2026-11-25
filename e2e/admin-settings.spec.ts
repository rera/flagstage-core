import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const password = "e2e-password-e2e-password";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function revealNav(page: Page) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
}

async function saveSettings(page: Page, field: string, value: string) {
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(field)).toHaveAttribute("value", value);
}

test("a non-admin cannot open admin", async ({ page }) => {
  await signIn(page, "mia@example.com");
  for (const path of [
    "/admin",
    "/admin/accounts",
    "/admin/settings",
    "/admin/settings/importer",
    "/admin/settings/editor"
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/a\/harbor\/sites/);
    await revealNav(page);
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  }
});

test("admin mode shows only the admin navigation", async ({ page }) => {
  await signIn(page, "e2e@example.com");
  await page.goto("/a/parks/sites");
  await expect(page).toHaveURL(/\/a\/parks\/sites/);
  await page.goto("/admin/settings/importer");
  await revealNav(page);
  await expect(page.locator("aside").getByText("Platform admin", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link")).toHaveText([
    "Accounts",
    "Sites",
    "People",
    "Usage",
    "Settings"
  ]);
  await expect(page.getByRole("navigation", { name: "Account" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Site" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Switch account/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Switch site/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to sites" }).click();
  await expect(page).toHaveURL(/\/a\/parks\/sites/);
  await revealNav(page);
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link")).toHaveText([
    "Platform admin"
  ]);
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "All sites" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
});

test("saving caps and the hand-edit limit persists", async ({ page }) => {
  await signIn(page, "e2e@example.com");
  try {
    await page.goto("/admin/settings/importer");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link")).toHaveText([
      "This install",
      "Importer",
      "Editor"
    ]);
    await expect(page.getByLabel("Decision model")).toHaveValue(/claude-haiku-4-5/);
    await expect(page.getByRole("cell", { name: "Public website" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "WordPress", exact: true })).toBeVisible();
    await page.getByLabel("Max pages").fill("4200");
    await page.getByLabel("Max assets").fill("18000");
    await saveSettings(page, "#maxPages", "4200");
    await expect(page.locator("#maxAssets")).toHaveAttribute("value", "18000");
    await page.reload();
    await expect(page.getByLabel("Max pages")).toHaveValue("4200");
    await expect(page.getByLabel("Max assets")).toHaveValue("18000");

    await page
      .getByRole("navigation", { name: "Settings" })
      .getByRole("link", { name: "Editor" })
      .click();
    await expect(page.getByLabel("Hand-edit page limit")).toHaveValue("8");
    await page.getByLabel("Hand-edit page limit").fill("11");
    await saveSettings(page, "#handEditPageLimit", "11");
    await page.reload();
    await expect(page.getByLabel("Hand-edit page limit")).toHaveValue("11");
  } finally {
    await page.goto("/admin/settings/importer");
    if (await page.getByLabel("Max pages").isVisible()) {
      await page.getByLabel("Max pages").fill("5000");
      await page.getByLabel("Max assets").fill("20000");
      await saveSettings(page, "#maxPages", "5000");
    }
    await page.goto("/admin/settings/editor");
    if (await page.getByLabel("Hand-edit page limit").isVisible()) {
      await page.getByLabel("Hand-edit page limit").fill("8");
      await saveSettings(page, "#handEditPageLimit", "8");
    }
  }
});

test("writes the admin settings screenshots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SHOTS, "screenshot pass");
  const dir = process.env.E2E_SHOTS_DIR ?? "docs/assets/ia";
  mkdirSync(dir, { recursive: true });
  await signIn(page, "e2e@example.com");
  await page.goto("/a/harbor/sites");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Platform admin" })).toBeVisible();
  await page.screenshot({ path: `${dir}/06-enter-admin.png`, fullPage: true });
  await page.goto("/admin/settings/importer");
  await expect(page.getByLabel("Max pages")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Public website" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "WordPress", exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/04-admin-importer.png`, fullPage: true });
  await page.getByRole("link", { name: "Editor", exact: true }).click();
  await expect(page.getByLabel("Hand-edit page limit")).toBeVisible();
  await page.screenshot({ path: `${dir}/05-admin-editor.png`, fullPage: true });
});
