import { expect, test } from "@playwright/test";

const fixture = `http://127.0.0.1:${process.env.E2E_FIXTURE_PORT ?? "3999"}/`;

function localInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("schedules a publish a minute out and sees it go live", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "one browser is enough");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  await page.goto("/sign-in");
  const signIn = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await signIn.getByLabel("Email").fill("e2e@example.com");
  await signIn.getByLabel("Password").fill("e2e-password-e2e-password");
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/accounts/);

  await page.goto("/sites");
  await page.getByLabel("Site name").fill(`Schedule ${stamp}`);
  await page.getByLabel("Site address").fill(fixture);
  await page.getByRole("button", { name: "Import a site" }).click();
  await expect(page).toHaveURL(/\/sites\/.+/);
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
  await page.getByLabel("Publish at").fill(localInput(when));
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("heading", { name: "Scheduled" })).toBeVisible();
  await expect(page.getByText(/Goes live/)).toBeVisible();

  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
  }).toPass({ timeout: 120_000 });
});
