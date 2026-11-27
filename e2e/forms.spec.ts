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
  const plugins = page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Plugins" });
  if (await plugins.isVisible()) return;
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
}

async function hideNav(page: Page) {
  const close = page.getByRole("button", { name: "Close menu" });
  if (await close.isVisible()) await close.click({ position: { x: 320, y: 80 } });
}

async function sitePath(page: Page) {
  await expect(page).toHaveURL(/\/a\/championships\/sites\/([^/]+)/);
  const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
  expect(siteId).not.toBe("");
  return `/a/championships/sites/${siteId}`;
}

function peopleCard(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "People", level: 2 }) });
}

test("old forms url redirects into the plugin", async ({ page }) => {
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);
  const response = await page.request.get(`${site}/forms`, { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers().location ?? "").toContain("/plugins/forms");

  await page.goto(`${site}/forms`);
  await expect(page).toHaveURL(/\/plugins\/forms$/);
  await expect(page.getByRole("heading", { name: "Forms", level: 2 })).toBeVisible();
  await expect(page.getByText("Where forms come from")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No form submissions" })).toHaveCount(0);
  await revealNav(page);
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Plugins" })
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Forms" })
  ).toHaveCount(0);
});

test("filters submissions, exports that view, and returns from a submission", async ({ page }) => {
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);
  await page.goto(`${site}/plugins/forms`);
  const bodyRows = page.locator("tbody").getByRole("row");
  await expect(bodyRows).toHaveCount(3);
  await expect(bodyRows.nth(0)).toContainText("Ticket window");
  await expect(bodyRows.nth(1)).toContainText("Front desk");
  await expect(bodyRows.nth(2)).toContainText("press@example.com");

  await page.getByRole("combobox", { name: "Form" }).selectOption("tickets");
  await expect(page).toHaveURL(/[?&]form=tickets$/);
  await expect(page.getByRole("link", { name: /Ticket window/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Front desk/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /press@example.com/ })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Tickets" })).toBeVisible();

  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  expect(href).toContain("form=tickets");
  const csv = await page.request.get(href ?? "");
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"] ?? "").toContain("text/csv");
  expect(csv.headers()["content-disposition"] ?? "").toContain("tickets.csv");
  const body = await csv.text();
  expect(body.split("\n")[0]).toBe("From,Form,Received,name,email,day,message");
  expect(body).toContain("Ticket window,Tickets,");
  expect(body).toContain('"Two passes, Saturday morning."');
  expect(body).not.toContain("Front desk");
  expect(body).not.toContain("press@example.com");

  await page.getByRole("link", { name: /Ticket window/ }).click();
  await expect(page).toHaveURL(/\/plugins\/forms\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Tickets", level: 3 })).toBeVisible();
  await expect(page.getByText("Received")).toBeVisible();
  await expect(page.getByText("Two passes, Saturday morning.")).toBeVisible();
  await revealNav(page);
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Plugins" })
  ).toHaveAttribute("aria-current", "page");
  await hideNav(page);
  await page.getByRole("link", { name: "All submissions" }).click();
  await expect(page).toHaveURL(/\/plugins\/forms$/);
  await expect(page.getByRole("combobox", { name: "Form" })).toHaveValue("");
  await expect(page.getByRole("link", { name: /Front desk/ })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Forms" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/plugins\/forms\/settings$/);
  await expect(page.getByLabel("Notification email").first()).toHaveValue("desk@example.com");
  await expect(page.getByLabel("Webhook URL").first()).toHaveValue(
    "https://example.com/hooks/contact"
  );
  await expect(
    page.getByRole("navigation", { name: "Forms" }).getByRole("link", { name: "Settings" })
  ).toHaveAttribute("aria-current", "page");
  await revealNav(page);
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Plugins" })
  ).toHaveAttribute("aria-current", "page");
});

test("overview leaves forms off the page and widens people when analytics is shown", async ({
  page
}) => {
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);
  await page.goto(site);
  await expect(page.getByRole("heading", { name: "Forms", level: 2 })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View submissions" })).toHaveCount(0);
  await expect(peopleCard(page)).toHaveClass(/lg:col-span-2/);
  await expect(page.getByRole("heading", { name: "Analytics", level: 2 })).toBeVisible();

  await page.goto("/sign-in");
  await page.context().clearCookies();
  await signIn(page, "riley.chen@example.com");
  await page.goto(site);
  await expect(page.getByRole("heading", { name: "PGA Championship" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analytics", level: 2 })).toHaveCount(0);
  await expect(peopleCard(page)).not.toHaveClass(/lg:col-span-2/);
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
  const clock = page.locator("time");
  if ((await clock.count()) > 0) await expect(clock.first()).not.toHaveText("");
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

test("writes plugin screenshots", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !existsSync(shots), "local stills");
  const desktop = await shotContext(browser, testInfo, { width: 1280, height: 1100 });
  const page = await desktop.newPage();
  await signIn(page, "alex.morgan@example.com");
  const site = await sitePath(page);

  await expect(page.getByRole("heading", { name: "People", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forms", level: 2 })).toHaveCount(0);
  await still(page, "overview");

  await page.goto(`${site}/plugins`);
  await expect(page.getByRole("heading", { name: "Plugins", level: 2 })).toBeVisible();
  await still(page, "plugins-list");

  await page.goto(`${site}/plugins/forms`);
  await expect(page.getByRole("link", { name: /Ticket window/ })).toBeVisible();
  await expect(page.locator("time").first()).not.toHaveText("");
  await still(page, "forms-all-submissions");

  await page.getByRole("combobox", { name: "Form" }).selectOption("tickets");
  await expect(page.getByRole("link", { name: /Front desk/ })).toHaveCount(0);
  await expect(page.locator("time").first()).not.toHaveText("");
  await still(page, "forms-filtered");

  await page.getByRole("link", { name: /Ticket window/ }).click();
  await expect(page.getByRole("link", { name: "All submissions" })).toBeVisible();
  await expect(page.locator("time").first()).not.toHaveText("");
  await still(page, "submission-detail");

  await page.goto(`${site}/plugins/forms/settings`);
  await expect(page.getByRole("heading", { name: "Contact", level: 3 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" }).first()).toBeVisible();
  await still(page, "forms-settings");
  await desktop.close();

  const empty = await shotContext(browser, testInfo, { width: 1280, height: 900 });
  const blank = await empty.newPage();
  await signIn(blank, "ada@example.com");
  await blank.goto("/a/harbor/sites");
  await blank.getByRole("link", { name: /^Waterfront/ }).click();
  await expect(blank.getByRole("heading", { name: "Waterfront" })).toBeVisible();
  const harbor = blank.url().replace(/\/$/, "");
  await blank.goto(`${harbor}/plugins/forms`);
  await expect(blank.getByRole("heading", { name: "No forms yet" })).toBeVisible();
  await still(blank, "forms-empty");
  await empty.close();

  const mobile = await shotContext(browser, testInfo, { width: 390, height: 844 });
  const phone = await mobile.newPage();
  await signIn(phone, "alex.morgan@example.com");
  await phone.goto(`${site}/plugins/forms`);
  await expect(phone.getByRole("link", { name: /Ticket window/ })).toBeVisible();
  await expect(phone.getByRole("columnheader", { name: "Open" })).toHaveCount(0);
  await expect(phone.locator("time").first()).not.toHaveText("");
  await still(phone, "forms-mobile-submissions");
  await mobile.close();
});
