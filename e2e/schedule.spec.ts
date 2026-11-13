import { expect, test } from "@playwright/test";

const fixture = `http://127.0.0.1:${process.env.E2E_FIXTURE_PORT ?? "3999"}/`;

test("schedules a publish a minute out and sees it go live", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "one browser is enough");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  await page.goto("/sign-in");
  const signIn = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await signIn.getByLabel("Email").fill("e2e@example.com");
  await signIn.getByLabel("Password").fill("e2e-password-e2e-password");
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts/);

  await page.goto("/a/parks/sites");
  await page.getByRole("button", { name: "New site" }).click();
  await page.getByLabel("Site name").fill(`Schedule ${stamp}`);
  await page.getByLabel("Site address").fill(fixture);
  await page.getByRole("button", { name: "Import a site" }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Make changes", exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  }).toPass({ timeout: 60_000 });
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("status")).toHaveText("This snapshot is live.");

  await page.getByLabel("Describe the change").fill("Add a sentence that the park is open today.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Schedule" })).toBeVisible();
  }).toPass({ timeout: 60_000 });

  await page.getByRole("button", { name: "Schedule" }).click();
  const when = new Date(Date.now() + 70_000);
  when.setSeconds(0, 0);
  if (when.getTime() < Date.now() + 25_000) when.setMinutes(when.getMinutes() + 1);
  const monthTitle = when.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (!(await page.getByText(monthTitle, { exact: true }).isVisible())) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await page
    .getByRole("button", {
      name: when.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      exact: true
    })
    .click();
  const hour24 = when.getHours();
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  await page.getByLabel("Hour").selectOption(String(hour12));
  await page.getByLabel("Minute").selectOption(String(when.getMinutes()).padStart(2, "0"));
  await page.getByLabel("AM or PM").selectOption(meridiem);
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("heading", { name: "Scheduled" })).toBeVisible();
  await expect(page.getByText(/Goes live/)).toBeVisible();

  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
  }).toPass({ timeout: 120_000 });
});
