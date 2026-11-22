import { request as httpRequest } from "node:http";

import { expect, test, type Page } from "@playwright/test";

const fixture = `http://127.0.0.1:${process.env.E2E_FIXTURE_PORT ?? "3999"}/`;

function fetchLive(host: string): Promise<{ status: number; body: string }> {
  const port = Number(process.env.DEV_SITES_PORT ?? 8088);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/", headers: { host } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function expectStitched(body: string) {
  expect(body).toContain("Park header");
  expect(body).not.toContain("<!--#include");
}

test("preview and the live host show an included header", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const siteName = `Includes ${stamp}`;
  const slug = `includes-${stamp}`;

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
  await page.getByLabel("Site name").fill(siteName);
  await page.getByLabel("Site address").fill(fixture);
  await page.getByRole("button", { name: "Import a site" }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  await expect(page.getByRole("heading", { name: siteName })).toBeVisible();
  await revealNav(page);
  await page.getByRole("link", { name: "Make changes", exact: true }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  }).toPass({ timeout: 60_000 });

  const siteId = page.url().match(/\/sites\/([^/]+)\/edit/)?.[1];
  expect(siteId).toBeTruthy();
  const preview = await page.request.get(`/sites/${siteId}/live`);
  expect(preview.ok()).toBe(true);
  expectStitched(await preview.text());

  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("status")).toHaveText("This snapshot is live.");

  await expect(async () => {
    const live = await fetchLive(`${slug}.localhost`);
    expect(live.status).toBe(200);
    expectStitched(live.body);
  }).toPass();
});

async function revealNav(page: Page) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
}
