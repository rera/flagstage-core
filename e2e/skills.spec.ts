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

function sourceField(page: Page) {
  return page.locator('textarea[name="body"]');
}

test("editing a site skill saves the description and leaves the rest of the file", async ({
  page
}, testInfo) => {
  await signIn(page, "jordan.lee@example.com");
  await expect(page).toHaveURL(/\/a\/championships\/sites\/([^/]+)/);
  const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
  const mobile = testInfo.project.name === "mobile";
  const slug = mobile ? "page-structure" : "sponsor-lines";
  const title = mobile ? "Page structure" : "Sponsor lines";
  const kept = mobile
    ? "Do not add a page that is not listed here."
    : "Do not drop a sponsor from the footer.";
  const skill = `/a/championships/sites/${siteId}/skills/${slug}`;

  await page.goto(skill);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("The agent follows this skill on PGA Championship.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0);
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  await expect(paragraphs.filter({ hasText: kept })).toHaveText(kept);

  const before = await sourceField(page).inputValue();
  expect(before).toContain(`name: ${title}`);
  expect(before).toContain(kept);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  expect(await sourceField(page).inputValue()).toBe(before);

  const description = `Kept with this skill (${testInfo.project.name}).`;
  const lead = `The first note for ${testInfo.project.name}.`;
  await page.getByLabel("Description").fill(description);
  await paragraphs.first().fill(lead);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Jordan Lee · Saved/).first()).toBeVisible();
  await expect(page.getByLabel("Description")).toHaveValue(description);
  await expect(paragraphs.first()).toHaveText(lead);
  await expect(paragraphs.filter({ hasText: kept })).toHaveText(kept);
  const saved = await sourceField(page).inputValue();
  expect(saved).toContain(`name: ${title}`);
  expect(saved).toContain(`description: "${description}"`);
  expect(saved).toContain(kept);
});

test("editing an account skill saves the description and the document", async ({
  page
}, testInfo) => {
  await signIn(page, "alex.morgan@example.com");
  const mobile = testInfo.project.name === "mobile";
  const slug = mobile ? "naming-rules" : "legal-lines";
  const title = mobile ? "Naming rules" : "Legal lines";
  const kept = mobile
    ? "Do not shorten PGA Championship to PGA in a headline."
    : "The ticket line stays under the event dates. Do not shorten it.";
  await page.goto(`/a/championships/skills/${slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(
    page.getByText("The agent follows this skill on every site in this account.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0);
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  await expect(paragraphs.filter({ hasText: kept })).toHaveText(kept);

  const before = await sourceField(page).inputValue();
  expect(before).toContain(`name: ${title}`);
  expect(before).toContain(kept);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  expect(await sourceField(page).inputValue()).toBe(before);

  const description = `Required lines the agent must keep (${testInfo.project.name}).`;
  const lead = `Keep the footer legal line on every published page (${testInfo.project.name}).`;
  await page.getByLabel("Description").fill(description);
  await paragraphs.first().fill(lead);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByLabel("Description")).toHaveValue(description);
  await expect(paragraphs.first()).toHaveText(lead);
  await expect(paragraphs.filter({ hasText: kept })).toHaveText(kept);
  const saved = await sourceField(page).inputValue();
  expect(saved).toContain(`name: ${title}`);
  expect(saved).toContain(`description: "${description}"`);
  expect(saved).toContain(kept);
});
