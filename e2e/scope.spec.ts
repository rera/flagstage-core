import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

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

async function signOut(page: Page) {
  const leaving = page.getByRole("button", { name: "Sign out" });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (!(await leaving.isVisible()) && (await menu.isVisible())) await menu.click();
  await leaving.click();
  await expect(page).toHaveURL(/\/sign-in/);
}

test("scopes navigation to the signed-in role", async ({ page }) => {
  await signIn(page, "mia@example.com");
  await expect(page).toHaveURL(/\/a\/harbor\/sites$/);
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New site" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Switch account/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByText("Studio hall")).toHaveCount(0);
  await page.goto("/a/north/sites");
  await expect(page.getByRole("heading", { name: "This page is not available" })).toBeVisible();
  await page.goto("/a/harbor/sites/not-a-harbor-site");
  await expect(page.getByRole("heading", { name: "This page is not available" })).toBeVisible();
  await page.goto("/admin/accounts");
  await expect(page).toHaveURL(/\/a\/harbor\/sites$/);
  await signOut(page);

  await signIn(page, "ada@example.com");
  await expect(page).toHaveURL(/\/a\/harbor\/sites$/);
  await expect(page.getByRole("button", { name: /Switch account/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New site" })).toBeVisible();
  await revealNav(page);
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name: "People" })
    .click();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  await signOut(page);

  await signIn(page, "sam@example.com");
  await expect(page).toHaveURL(/\/a\/harbor\/sites$/);
  await revealNav(page);
  await page.getByRole("button", { name: /Switch account/ }).click();
  await expect(page.getByRole("listbox", { name: "Accounts" }).getByRole("option")).toHaveText([
    "Harbor Labs",
    "North Studio"
  ]);
  await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  await signOut(page);

  await signIn(page, "e2e@example.com");
  await page.goto("/admin/accounts");
  await revealNav(page);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Accounts" })
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Sites" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Harbor Labs/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /North Studio/ })).toBeVisible();
});

test("remembers the collapsed sidebar and scopes the account switcher", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop sidebar");
  await signIn(page, "ada@example.com");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
  await page.reload();
  await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
  await page.keyboard.press("Control+b");
  await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
  await signOut(page);

  await signIn(page, "sam@example.com");
  await page.getByRole("button", { name: /Switch account/ }).click();
  await expect(page.getByRole("listbox", { name: "Accounts" }).getByRole("option")).toHaveText([
    "Harbor Labs",
    "North Studio"
  ]);
  await signOut(page);

  await signIn(page, "lee@example.com");
  await expect(page).toHaveURL(/\/a\/north\/sites\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Studio hall" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch account/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Make changes", exact: true })).toBeVisible();
});

async function shot(browser: Browser, info: TestInfo, viewport: { width: number; height: number }) {
  return browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport
  });
}

test("writes role screenshots", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SHOTS, "screenshot pass");
  const dir = "docs/assets/ia";
  const desktop = await shot(browser, testInfo, { width: 1280, height: 800 });
  const page = await desktop.newPage();

  await signIn(page, "ada@example.com");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await page.screenshot({ path: `${dir}/account-admin-sites.png` });
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await page.screenshot({ path: `${dir}/account-admin-people.png` });
  await page.getByRole("link", { name: "Usage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await page.screenshot({ path: `${dir}/account-admin-usage.png` });
  await page.getByRole("link", { name: "All sites", exact: true }).click();
  await page.getByRole("link", { name: /^Waterfront/ }).click();
  await expect(page.getByRole("link", { name: "Make changes", exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/account-admin-site.png` });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.screenshot({ path: `${dir}/sidebar-collapsed.png` });
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("button", { name: /Switch site/ }).click();
  await expect(page.getByRole("option", { name: /Pier/ })).toBeVisible();
  await page.screenshot({ path: `${dir}/site-switcher.png` });
  await signOut(page);

  await signIn(page, "mia@example.com");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await page.screenshot({ path: `${dir}/member-sites.png` });
  await signOut(page);

  await signIn(page, "sam@example.com");
  await page.getByRole("button", { name: /Switch account/ }).click();
  await expect(page.getByRole("option", { name: "North Studio" })).toBeVisible();
  await page.screenshot({ path: `${dir}/account-switcher.png` });
  await page.screenshot({ path: `${dir}/switcher.png` });
  await signOut(page);

  await signIn(page, "lee@example.com");
  await expect(page.getByRole("heading", { name: "Studio hall" })).toBeVisible();
  await page.screenshot({ path: `${dir}/single-site-overview.png` });
  await signOut(page);

  await signIn(page, "e2e@example.com");
  await page.context().clearCookies();
  await signIn(page, "e2e@example.com");
  await expect(page).toHaveURL(/\/admin\/accounts/);
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
  await page.screenshot({ path: `${dir}/admin-accounts.png` });
  await desktop.close();

  const mobile = await shot(browser, testInfo, { width: 390, height: 844 });
  const phone = await mobile.newPage();
  await signIn(phone, "ada@example.com");
  await phone.getByRole("button", { name: "Menu" }).click();
  await expect(phone.getByRole("link", { name: "People", exact: true })).toBeVisible();
  await phone.screenshot({ path: `${dir}/mobile-menu.png` });
  await mobile.close();
});
