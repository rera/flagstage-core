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

async function signOut(page: Page) {
  const leaving = page.getByRole("button", { name: "Sign out" });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (!(await leaving.isVisible()) && (await menu.isVisible())) await menu.click();
  await leaving.click();
  await expect(page).toHaveURL(/\/sign-in/);
}

test("an owner adds an editor, who edits a skill and publishes, while a viewer is blocked", async ({
  page
}) => {
  await signIn(page, "jordan.lee@example.com");
  await expect(page).toHaveURL(/\/a\/championships\/sites\/([^/]+)/);
  const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
  expect(siteId).not.toBe("");
  const sitePath = `/a/championships/sites/${siteId}`;

  await page.goto(`${sitePath}/people`);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await page.getByRole("link", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Add person" })).toBeVisible();
  await page.getByLabel("First name").fill("Casey");
  await page.getByLabel("Last name").fill("Nguyen");
  await page.getByLabel("Email").fill("casey.nguyen@example.com");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText("casey.nguyen@example.com")).toBeVisible();
  await expect(page.getByText("Editor").first()).toBeVisible();
  await signOut(page);

  await signIn(page, "casey.nguyen@example.com");
  await page.goto(`${sitePath}/skills/event-facts`);
  await expect(page.getByRole("heading", { name: "Event facts" })).toBeVisible();
  const body = page.getByRole("textbox", { name: "Event facts" });
  await body.fill("Event: PGA Championship\nDates: May 14–17, 2026\n\nUse these facts.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Casey Nguyen · Saved/).first()).toBeVisible();
  await page.goto(`${sitePath}/edit`);
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("button", { name: "Publish now" })).toHaveCount(0);
  await page.goto(sitePath);
  await expect(page.getByText("A draft is waiting to go live.")).toHaveCount(0);
  await signOut(page);

  await signIn(page, "riley.chen@example.com");
  await page.goto(`${sitePath}/skills/event-facts`);
  await expect(page.getByText("View only. You can read this skill and its history.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Event facts" })).toHaveAttribute("readonly", "");
  const save = await page.request.post(`/api/sites/${siteId}/skills/event-facts`, {
    form: { body: "Viewer rewrite" }
  });
  expect(save.status()).toBe(403);
  const publish = await page.request.post(`/api/sites/${siteId}/publish`, {
    form: { snapshotId: "not-a-snapshot" }
  });
  expect(publish.status()).toBe(403);
  await page.goto(`${sitePath}/edit`);
  await expect(page.getByRole("heading", { name: "This page is not available" })).toBeVisible();
  await page.goto(`${sitePath}/analytics`);
  await expect(page.getByRole("heading", { name: "This page is not available" })).toBeVisible();
  await signOut(page);

  await signIn(page, "alex.morgan@example.com");
  await page.goto(`${sitePath}/people`);
  const main = page.locator("#content");
  await expect(main.getByText("Jordan Lee")).toBeVisible();
  await expect(main.getByText("Casey Nguyen")).toBeVisible();
  await expect(main.getByText("Inherited").first()).toBeVisible();
  await expect(main.getByText("Alex Morgan")).toBeVisible();
  await page.goto("/a/championships/skills");
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(page.getByText("Brand voice")).toBeVisible();
  await page.goto("/a/championships/skills/brand-voice");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await page.goto(`${sitePath}/analytics`);
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await revealNav(page);
  await expect(page.getByRole("link", { name: "People", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Skills", exact: true }).first()).toBeVisible();
});
