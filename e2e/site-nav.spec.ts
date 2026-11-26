import { existsSync, mkdirSync } from "node:fs";

import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

const password = "e2e-password-e2e-password";
const shots = "/opt/cursor/artifacts";

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

async function sitePath(page: Page) {
  await expect(page).toHaveURL(/\/a\/championships\/sites\/([^/]+)/);
  const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
  expect(siteId).not.toBe("");
  return `/a/championships/sites/${siteId}`;
}

test("site nav keeps account pages in the picker", async ({ page }, testInfo) => {
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);
  await revealNav(page);
  const siteNav = page.getByRole("navigation", { name: "Site" });
  await expect(siteNav.getByRole("link")).toHaveText([
    "Overview",
    "Plugins",
    "Analytics",
    "Scheduled",
    "Settings"
  ]);
  await expect(page.getByRole("link", { name: "Make changes", exact: true })).toBeVisible();
  await expect(siteNav.getByRole("link", { name: "Forms" })).toHaveCount(0);
  await expect(siteNav.getByRole("link", { name: "People", exact: true })).toHaveCount(0);
  await expect(siteNav.getByRole("link", { name: "Domain", exact: true })).toHaveCount(0);
  await expect(page.getByText("ACCOUNT", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Account" })).toHaveCount(0);

  await page.goto(`${site}/settings/domain`);
  await revealNav(page);
  await expect(siteNav.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  await page.getByRole("button", { name: /Switch site/ }).click();
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(account.getByText("Championships", { exact: true })).toBeVisible();
  await expect(account.getByRole("link")).toHaveText(["All sites", "People", "Skills", "Usage"]);
  await account.getByRole("link", { name: "People", exact: true }).click();
  await expect(page).toHaveURL(/\/a\/championships\/people$/);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  await page.goto(site);
  await revealNav(page);
  await page.getByRole("button", { name: /Switch site/ }).click();
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name: "Skills", exact: true })
    .click();
  await expect(page).toHaveURL(/\/a\/championships\/skills$/);
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();

  await page.goto(site);
  await revealNav(page);
  await page.getByRole("button", { name: /Switch site/ }).click();
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name: "Usage", exact: true })
    .click();
  await expect(page).toHaveURL(/\/a\/championships\/usage$/);
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();

  await page.goto(site);
  await revealNav(page);
  await page.getByRole("button", { name: /Switch site/ }).click();
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name: "All sites", exact: true })
    .click();
  await expect(page).toHaveURL(/\/a\/championships\/sites$/);
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await revealNav(page);
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link")).toHaveText([
    "All sites",
    "People",
    "Skills",
    "Usage"
  ]);
  await expect(page.getByRole("navigation", { name: "Site" })).toHaveCount(0);
  await expect(page.getByText("ACCOUNT", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Switch site/ }).click();
  await expect(page.getByRole("link", { name: "People", exact: true })).toHaveCount(1);

  if (testInfo.project.name === "chromium") {
    await page.goto(site);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
    for (const label of ["Overview", "Plugins", "Analytics", "Scheduled", "Settings"]) {
      await expect(
        page
          .getByRole("navigation", { name: "Site" })
          .getByRole("link", { name: label, exact: true })
      ).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Make changes", exact: true })).toBeVisible();
    await expect(page.getByText("ACCOUNT", { exact: true })).toHaveCount(0);
  }
});

test("settings tabs have their own urls and old paths redirect", async ({ page }) => {
  await signIn(page, "jordan.lee@example.com");
  const site = await sitePath(page);

  const people = await page.request.get(`${site}/people?dialog=add`, { maxRedirects: 0 });
  expect(people.status()).toBeGreaterThanOrEqual(300);
  expect(people.status()).toBeLessThan(400);
  expect(people.headers().location ?? "").toContain("/settings/people?dialog=add");
  const skills = await page.request.get(`${site}/skills`, { maxRedirects: 0 });
  expect(skills.headers().location ?? "").toContain("/settings/skills");
  const domain = await page.request.get(`${site}/domain`, { maxRedirects: 0 });
  expect(domain.headers().location ?? "").toContain("/settings/domain");
  const editor = await page.request.get(`${site}/skills/event-facts`, { maxRedirects: 0 });
  expect(editor.status()).toBe(200);

  await page.goto(`${site}/people?dialog=add`);
  await expect(page).toHaveURL(/\/settings\/people\?dialog=add$/);
  await expect(page.getByRole("heading", { name: "Add person" })).toBeVisible();

  await page.goto(`${site}/skills`);
  await expect(page).toHaveURL(/\/settings\/skills$/);
  const tabs = page.getByRole("navigation", { name: "Settings" });
  await expect(tabs.getByRole("link")).toHaveText(["People", "Skills", "Domain", "Settings"]);
  await expect(tabs.getByRole("link", { name: "Skills" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Skills", level: 2 })).toBeVisible();

  await tabs.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/settings\/people$/);
  await expect(page.getByRole("heading", { name: "People", level: 2 })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Domain" })
    .click();
  await expect(page).toHaveURL(/\/settings\/domain$/);
  await expect(page.getByRole("heading", { name: "Domain", level: 2 })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Site settings" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Settings" })
  ).toHaveAttribute("aria-current", "page");

  await page.goto(`${site}/domain`);
  await expect(page).toHaveURL(/\/settings\/domain$/);
});

test("plugins opens the forms screen", async ({ page }) => {
  await signIn(page, "jordan.lee@example.com");
  await sitePath(page);
  await revealNav(page);
  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Plugins" })
    .click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.getByRole("heading", { name: "Plugins", level: 2 })).toBeVisible();
  await expect(page.getByText("Submissions from forms on this site.")).toBeVisible();
  await page.getByRole("link", { name: /Submissions from forms on this site/ }).click();
  await expect(page).toHaveURL(/\/forms$/);
  await expect(page.getByRole("heading", { name: "No form submissions" })).toBeVisible();
  await revealNav(page);
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Plugins" })
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Forms" })
  ).toHaveCount(0);
});

test("overview people card shows site roles", async ({ page }) => {
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);
  await page.goto(site);
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "People", level: 2 }) });
  const row = (email: string) => card.locator("li").filter({ hasText: email });
  await expect(row("jordan.lee@example.com")).toContainText("Owner");
  await expect(row("sam.patel@example.com")).toContainText("Editor");
  await expect(row("riley.chen@example.com")).toContainText("Viewer");
  await expect(row("morgan.blake@example.com")).toContainText("Analyst");
  await expect(row("alex.morgan@example.com")).toContainText("Account admin");
  await expect(row("avery.nguyen@example.com")).toContainText("Account admin");
  await expect(card.getByText("Member", { exact: true })).toHaveCount(0);
  await expect(card.getByText("taylor.kim@example.com")).toHaveCount(0);
  await card.getByRole("link", { name: "Manage access" }).click();
  await expect(page).toHaveURL(/\/settings\/people$/);
});

async function shotContext(
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

async function still(page: Page, name: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const aside = document.querySelector("aside");
    return {
      page: root.scrollWidth - root.clientWidth,
      aside: aside ? aside.scrollWidth - aside.clientWidth : 0
    };
  });
  expect(overflow.page, name).toBeLessThanOrEqual(1);
  expect(overflow.aside, name).toBeLessThanOrEqual(1);
}

test("writes sidebar stills", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !existsSync(shots), "local stills");
  const desktop = await shotContext(browser, testInfo, { width: 1280, height: 1000 });
  const page = await desktop.newPage();
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);
  await expect(page.getByRole("heading", { name: "PGA Championship" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();

  await still(page, "site-view-desktop");
  await page.getByRole("button", { name: /Switch site/ }).click();
  await expect(page.getByRole("navigation", { name: "Account" })).toBeVisible();
  await still(page, "site-picker-open");

  await page.goto("/a/championships/sites");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await still(page, "account-view");

  await page.goto(`${site}/settings/people`);
  await expect(page.getByRole("heading", { name: "People", level: 2 })).toBeVisible();
  await still(page, "settings-tab-people");
  await page.goto(`${site}/settings/skills`);
  await expect(page.getByRole("heading", { name: "Skills", level: 2 })).toBeVisible();
  await still(page, "settings-tab-skills");
  await page.goto(`${site}/settings/domain`);
  await expect(page.getByRole("heading", { name: "Domain", level: 2 })).toBeVisible();
  await still(page, "settings-tab-domain");
  await page.goto(`${site}/settings`);
  await expect(page.getByRole("heading", { name: "Site settings" })).toBeVisible();
  await still(page, "settings-tab-settings");
  await page.goto(`${site}/plugins`);
  await expect(page.getByText("Submissions from forms on this site.")).toBeVisible();
  await still(page, "site-plugins");
  await desktop.close();

  const mobile = await shotContext(browser, testInfo, { width: 390, height: 844 });
  const phone = await mobile.newPage();
  await signIn(phone, "alex.morgan@example.com");
  await phone.goto(site);
  await phone.getByRole("button", { name: "Menu" }).click();
  await expect(phone.getByRole("link", { name: "Plugins" })).toBeVisible();
  await still(phone, "mobile-menu-site");
  await phone.goto("/a/championships/sites");
  await phone.getByRole("button", { name: "Menu" }).click();
  await expect(phone.getByRole("link", { name: "All sites", exact: true })).toBeVisible();
  await still(phone, "mobile-menu-account");
  await mobile.close();
});
