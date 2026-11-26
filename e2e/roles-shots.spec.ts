import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

const password = "e2e-password-e2e-password";
const out = "/opt/cursor/artifacts";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}

test("writes the people and skills screens", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SHOTS, "screenshot pass");
  const desktop = await contextFor(browser, testInfo, { width: 1280, height: 900 });
  const page = await desktop.newPage();
  await signIn(page, "jordan.lee@example.com");
  await expect(page).toHaveURL(/\/a\/championships\/sites\/([^/]+)/);
  const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
  const site = `/a/championships/sites/${siteId}`;

  await page.goto(`${site}/people`);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await shot(page, "site-people");

  await page.goto(`${site}/people?dialog=add`);
  await expect(page.getByRole("heading", { name: "Add person" })).toBeVisible();
  await shot(page, "site-add-person", false);

  await page.goto(
    `${site}/people?dialog=role&person=${encodeURIComponent("sam.patel@example.com")}`
  );
  await expect(page.getByRole("heading", { name: "Change role" })).toBeVisible();
  await shot(page, "site-change-role", false);

  await page.goto(
    `${site}/people?dialog=remove&person=${encodeURIComponent("sam.patel@example.com")}`
  );
  await expect(page.getByRole("heading", { name: "Remove Sam Patel" })).toBeVisible();
  await shot(page, "site-remove", false);

  await page.goto(`${site}/skills`);
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await shot(page, "site-skills");

  await page.goto(`${site}/skills/event-facts`);
  await expect(page.getByRole("heading", { name: "Event facts" })).toBeVisible();
  await expect(page.getByText(/ET/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await shot(page, "site-skill-edit");
  await desktop.close();

  const viewer = await contextFor(browser, testInfo, { width: 1280, height: 900 });
  const riley = await viewer.newPage();
  await signIn(riley, "riley.chen@example.com");
  await riley.goto(`${site}/skills/event-facts`);
  await expect(
    riley.getByText("View only. You can read this skill and its history.")
  ).toBeVisible();
  await expect(riley.getByText(/ET/).first()).toBeVisible();
  await shot(riley, "site-skill-view");
  await viewer.close();

  const admin = await contextFor(browser, testInfo, { width: 1280, height: 900 });
  const alex = await admin.newPage();
  await signIn(alex, "alex.morgan@example.com");
  await alex.goto("/a/championships/people");
  await expect(alex.getByRole("heading", { name: "People" })).toBeVisible();
  await shot(alex, "account-people");
  await alex.goto("/a/championships/people?dialog=add");
  await expect(alex.getByText("They will be an account admin.")).toBeVisible();
  await shot(alex, "account-add-person", false);
  await alex.goto("/a/championships/sites");
  await alex.getByRole("button", { name: "New site" }).click();
  await expect(alex.getByRole("heading", { name: "New site" })).toBeVisible();
  await alex.getByLabel("Site name").fill("PGA Championship");
  const wordpress = `http://127.0.0.1:${process.env.E2E_WP_PORT ?? "4001"}/`;
  await alex.getByLabel("Site address").fill(wordpress);
  await expect(
    alex.getByText("WordPress was detected from this address. Change this if that's wrong.")
  ).toBeVisible();
  await expect(alex.getByLabel("Importer")).toBeVisible();
  await alex.getByLabel("Owner").selectOption({ label: "Jordan Lee" });
  await expect(alex.getByText(/jordan.lee@example.com/)).toBeVisible();
  await alex.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shot(alex, "new-site-owner", false);
  await admin.close();

  const mobile = await contextFor(browser, testInfo, { width: 390, height: 844 });
  const phone = await mobile.newPage();
  await signIn(phone, "jordan.lee@example.com");
  await phone.goto(`${site}/people`);
  await expect(phone.getByRole("heading", { name: "People" })).toBeVisible();
  await shot(phone, "site-people-390");
  await phone.goto(`${site}/skills/event-facts`);
  await expect(phone.getByRole("heading", { name: "Event facts" })).toBeVisible();
  await expect(phone.getByText(/ET/).first()).toBeVisible();
  await shot(phone, "site-skill-edit-390");
  await mobile.close();
});

async function contextFor(
  browser: Browser,
  info: TestInfo,
  viewport: { width: number; height: number }
) {
  return browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport,
    timezoneId: "America/New_York"
  });
}
