import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const fixture = `http://127.0.0.1:${process.env.E2E_FIXTURE_PORT ?? "3999"}/`;

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (item) => item.impact === "serious" || item.impact === "critical"
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("sign in, import, edit, preview, publish, and read the DNS checklist", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const siteName = `Parks ${stamp}`;
  const hostname = `www.parks-${stamp}.example`;
  const request = "Add a sentence that the park is open today.";

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.locator("body").press("Tab");
  expect(await page.evaluate(() => document.activeElement?.classList.contains("skip"))).toBe(true);
  const signIn = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await signIn.getByLabel("Email").fill("e2e@example.com");
  await signIn.getByLabel("Password").fill("e2e-password-e2e-password");
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/accounts/);
  await revealNav(page);
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Sites" })
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Accounts" })
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto("/sites");
  await page.getByRole("button", { name: "New site" }).click();
  await page.getByLabel("Site name").fill(siteName);
  await page.getByLabel("Site address").fill(fixture);
  await page.getByRole("button", { name: "Import a site" }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  const headingBox = await page.getByRole("heading", { name: siteName }).boundingBox();
  const tabBox = await page.getByRole("link", { name: "Overview", exact: true }).boundingBox();
  expect(headingBox && tabBox && headingBox.y < tabBox.y).toBe(true);
  await page.getByRole("link", { name: "Make changes", exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  }).toPass({ timeout: 60_000 });
  if (test.info().project.name === "mobile") {
    await expect(page.getByRole("link", { name: "Open preview" })).toBeVisible();
    await expect(page.locator(".builder-preview")).toBeHidden();
  } else {
    await expect(page.locator("iframe")).toBeVisible();
  }
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("status")).toHaveText("This snapshot is live.");

  await page.getByLabel("Describe the change").fill(request);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Publish now", exact: true })).toBeVisible();
  }).toPass({ timeout: 60_000 });

  await expect(page.getByText("Preview updated")).toBeVisible();
  const src = await page.locator("iframe").getAttribute("src");
  expect(src).toBeTruthy();
  const preview = await page.request.get(new URL(src ?? "/", page.url()).toString());
  expect(preview.ok()).toBe(true);
  expect(await preview.text()).toContain("the park is open today");

  await page.getByRole("button", { name: "Publish now", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish now", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("This snapshot is live.");

  await page.getByRole("link", { name: siteName }).click();
  await page.getByRole("link", { name: "Domain", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Domain" })).toBeVisible();
  await page.getByLabel("Hostname").fill(hostname);
  await page.getByRole("button", { name: "Add hostname" }).click();
  await expect(page.getByRole("heading", { name: hostname })).toBeVisible();
  await expect(page.getByText("CNAME")).toBeVisible();
  await expect(page.getByText("Not found yet")).toBeVisible();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Not found yet")).toBeVisible();

  await page.getByRole("link", { name: "Forms", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No form submissions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the site" })).toBeVisible();

  await page.goto("/accounts");
  await page.getByRole("link", { name: "Parks" }).click();
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  await page.goto("/admin");
  await revealNav(page);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Accounts" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Usage" })
  ).toBeVisible();
  await page.goto("/invitations/not-a-real-token");
  await expect(page.getByRole("heading", { name: "This invitation is not valid" })).toBeVisible();
  await expectAccessible(page);
});

async function revealNav(page: Page) {
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
}
