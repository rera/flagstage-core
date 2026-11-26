import { expect, test, type Page } from "@playwright/test";

const wordpress = `http://127.0.0.1:${process.env.E2E_WP_PORT ?? "4001"}/`;

async function signIn(page: Page) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await form.getByLabel("Email").fill("e2e@example.com");
  await form.getByLabel("Password").fill("e2e-password-e2e-password");
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts/);
}

test("a WordPress address shows the detected importer, then progress, the result, and go live", async ({
  page
}, testInfo) => {
  const stamp = Date.now().toString(36);
  await signIn(page);
  await page.goto("/a/parks/sites");
  await page.getByRole("button", { name: "New site" }).click();
  await page.getByLabel("Site name").fill(`Harbor ${stamp}`);
  await page.getByLabel("Site address").fill(wordpress);
  await expect(
    page.getByText("WordPress was detected from this address. Change this if that's wrong.")
  ).toBeVisible();
  const importer = page.getByLabel("Importer");
  await expect(importer).toHaveValue("wordpress");
  await importer.selectOption({ label: "Public website" });
  await expect(importer).toHaveValue("public");
  await importer.selectOption({ label: "WordPress" });
  await expect(importer).toHaveValue("wordpress");
  if (testInfo.project.name === "chromium") {
    await page.screenshot({
      path: testInfo.outputPath("01-start-import.png"),
      fullPage: true
    });
  }
  await page.getByRole("button", { name: "Import a site" }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  await expect(page.getByText("Importing. This page updates as pages are found.")).toBeVisible({
    timeout: 45_000
  });
  await expect(page.getByText(/Pages found/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Pages done/)).toBeVisible();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({
      path: testInfo.outputPath("02-import-progress.png"),
      fullPage: true
    });
  }
  await expect(page.getByText("Your pages are ready to review.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Shared sections" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Page types" })).toBeVisible();
  await expect(page.getByText("Header")).toBeVisible();
  await expect(page.getByText("same on 5 pages")).toBeVisible();
  await expect(page.getByText("same on 4 pages")).toBeVisible();
  await expect(page.getByText("Article")).toBeVisible();
  const callout = page.getByRole("status").filter({
    hasText: "A few blocks need a look. They stayed on their pages."
  });
  await expect(callout).toBeVisible();
  const sentence = (await callout.locator("li span").first().innerText()).trim();
  expect(sentence).not.toMatch(/site-footer|_inc|current-page|block inline|normaliz|\.html/);
  expect(sentence).not.toMatch(/[<>{}`/#\\]/);
  expect(sentence.endsWith(".")).toBe(true);
  expect(sentence.slice(0, -1)).not.toMatch(/[.!?]/);
  expect(sentence.length).toBeLessThanOrEqual(140);
  expect(sentence.toLowerCase()).toContain("page");
  await expect(callout).not.toContainText("site-footer");
  await expect(callout).not.toContainText("Left the");
  await expect(page.getByRole("link", { name: "Women's jackets" })).toBeVisible();
  const flagHref = await page.getByRole("link", { name: "Women's jackets" }).getAttribute("href");
  expect(flagHref).toBeTruthy();
  const flagged = await page.request.get(new URL(flagHref ?? "/", page.url()).toString());
  expect(flagged.ok()).toBe(true);
  expect(await flagged.text()).toContain("Women's jackets");
  await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  const history = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "History" }) });
  await expect(history.getByText("Import", { exact: true })).toBeVisible();
  await expect(history.getByText("From your old site", { exact: true })).toBeVisible();
  await expect(history.getByText("Someone on the account")).toHaveCount(0);
  await expect(history.locator("time")).toHaveText(/ET/, { timeout: 15_000 });
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  await callout.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath(`overview-${project}.png`),
    fullPage: true
  });
  await history.scrollIntoViewIfNeeded();
  await history.screenshot({
    path: testInfo.outputPath(`history-${project}.png`)
  });
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("button", { name: "Go live" })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("main").getByText("Live", { exact: true })).toBeVisible();
});
