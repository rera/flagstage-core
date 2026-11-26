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
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-next-badge], [data-nextjs-dev-overlay] { display: none !important; }"
  });
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

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

test("writes the skill editor screenshots", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SHOTS, "screenshot pass");
  const desktop = await contextFor(browser, testInfo, { width: 1280, height: 900 });
  const page = await desktop.newPage();
  await signIn(page, "jordan.lee@example.com");
  await expect(page).toHaveURL(/\/a\/championships\/sites\/([^/]+)/);
  const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
  const siteSkill = `/a/championships/sites/${siteId}/skills/event-facts`;

  await page.goto(siteSkill);
  await expect(page.getByRole("heading", { name: "Event facts" })).toBeVisible();
  await expect(page.getByLabel("Description")).toBeVisible();
  await expect(page.getByText(/ET/).first()).toBeVisible();
  await shot(page, "site-skill-desktop");
  await page
    .getByLabel("Description")
    .fill("Dates, the course, and the facts for this championship.");
  await page
    .getByRole("textbox", { name: "Paragraph" })
    .first()
    .fill(
      "Event: The PGA Championship\nSite: pgachampionship.com\nDates: May 14–17, 2026\nCourse: Aronimink Golf Club"
    );
  await shot(page, "site-skill-desktop-unsaved");
  await desktop.close();

  const mobile = await contextFor(browser, testInfo, { width: 390, height: 844 });
  const phone = await mobile.newPage();
  await signIn(phone, "jordan.lee@example.com");
  await phone.goto(siteSkill);
  await expect(phone.getByRole("heading", { name: "Event facts" })).toBeVisible();
  await expect(phone.getByLabel("Description")).toBeVisible();
  await expect(phone.getByText(/ET/).first()).toBeVisible();
  await shot(phone, "site-skill-390");
  await phone
    .getByLabel("Description")
    .fill("Dates, the course, and the facts for this championship.");
  await phone
    .getByRole("textbox", { name: "Paragraph" })
    .first()
    .fill(
      "Event: The PGA Championship\nSite: pgachampionship.com\nDates: May 14–17, 2026\nCourse: Aronimink Golf Club"
    );
  await shot(phone, "site-skill-390-unsaved");
  await mobile.close();

  const account = await contextFor(browser, testInfo, { width: 1280, height: 900 });
  const alex = await account.newPage();
  await signIn(alex, "alex.morgan@example.com");
  await alex.goto("/a/championships/skills/brand-voice");
  await expect(alex.getByRole("heading", { name: "Brand voice" })).toBeVisible();
  await expect(alex.getByLabel("Description")).toBeVisible();
  await expect(alex.getByText(/ET/).first()).toBeVisible();
  await shot(alex, "account-skill-desktop");
  await alex
    .getByLabel("Description")
    .fill("How the account sounds in headlines, names, and body text.");
  await alex
    .getByRole("textbox", { name: "Paragraph" })
    .first()
    .fill("Short sentences. The account sounds calm and specific.");
  await shot(alex, "account-skill-desktop-unsaved");
  await account.close();
});
