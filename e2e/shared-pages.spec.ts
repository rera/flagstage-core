import { existsSync, readdirSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const corpus = `http://127.0.0.1:${process.env.E2E_CORPUS_PORT ?? "4000"}/`;
const storage = process.env.FS_STORAGE_DIR ?? "/tmp/flagstage-e2e-storage";

function fetchLive(host: string, path: string): Promise<{ status: number; body: string }> {
  const port = Number(process.env.DEV_SITES_PORT ?? 8088);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, headers: { host } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function sourceDir(siteId: string): string {
  const root = join(storage, "snapshots", siteId);
  const found = readdirSync(root).find((id) =>
    existsSync(join(root, id, "src", "_inc", "header.html"))
  );
  if (!found) throw new Error(`No extracted source for ${siteId}`);
  return join(root, found, "src");
}

test("import extracts a shared header and preview and live highlight the current page", async ({
  page
}) => {
  const stamp = Date.now().toString(36);
  const siteName = `Grove ${stamp}`;
  const slug = `grove-${stamp}`;

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
  await page.getByLabel("Site address").fill(corpus);
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
  const src = sourceDir(siteId ?? "");
  const include = readFileSync(join(src, "_inc", "header.html"), "utf8");
  expect(include).toContain("Grove header");
  expect(include).toContain('<a href="/visit">');
  expect(include).not.toContain("aria-current");
  const homeSource = readFileSync(join(src, "index.html"), "utf8");
  expect(homeSource).toContain('<!--#include virtual="/_inc/header.html" active="/" -->');
  expect(homeSource).not.toContain("Grove header");
  const storySource = readFileSync(join(src, "stories", "01", "index.html"), "utf8");
  expect(storySource).toContain('<!--#include virtual="/_inc/header.html" active="/news" -->');
  expect(existsSync(join(src, "_templates", "article.html"))).toBe(true);
  expect(existsSync(join(src, "_templates", "listing.html"))).toBe(true);
  expect(existsSync(join(src, "_templates", "page.html"))).toBe(true);
  const skill = readFileSync(join(src, ".flagstage", "skills", "site", "SKILL.md"), "utf8");
  expect(skill).toContain("Grove header");
  expect(skill).toContain("Never hand-edit many files.");
  expect(existsSync(join(src, ".flagstage", "drift.json"))).toBe(true);

  const home = await page.request.get(`/sites/${siteId}/live`);
  expect(home.ok()).toBe(true);
  const homeHtml = await home.text();
  expect(homeHtml).toContain("Grove header");
  expect(homeHtml).toContain('<a href="/" class="active" aria-current="page">');
  expect(homeHtml).not.toContain('<a href="/visit" class="active"');
  expect(homeHtml).not.toContain("<!--#include");
  expect(homeHtml).not.toContain("{{title}}");
  expect(homeHtml).not.toContain("Never hand-edit");

  const visit = await page.request.get(`/sites/${siteId}/live/visit`);
  expect(visit.ok()).toBe(true);
  const visitHtml = await visit.text();
  expect(visitHtml).toContain('<a href="/visit" class="active" aria-current="page">');
  expect(visitHtml).not.toContain('<a href="/" class="active"');
  expect(visitHtml).not.toContain("<!--#include");

  const story = await page.request.get(`/sites/${siteId}/live/stories/01`);
  expect(story.ok()).toBe(true);
  const storyHtml = await story.text();
  expect(storyHtml).toContain('<a href="/news" class="active" aria-current="page">');
  expect(storyHtml).toContain("Story 01 tells one visit to the grove.");
  expect(storyHtml).not.toContain("<!--#include");

  for (const hidden of [
    "_inc/header.html",
    "_templates/article.html",
    ".flagstage/skills/site/SKILL.md"
  ]) {
    const hiddenResponse = await page.request.get(`/sites/${siteId}/live/${hidden}`);
    expect(hiddenResponse.status()).toBe(404);
  }

  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("status")).toHaveText("This snapshot is live.");

  await expect(async () => {
    const liveHome = await fetchLive(`${slug}.localhost`, "/");
    expect(liveHome.status).toBe(200);
    expect(liveHome.body).toContain("Grove header");
    expect(liveHome.body).toContain('<a href="/" class="active" aria-current="page">');
    expect(liveHome.body).not.toContain("<!--#include");
    const liveVisit = await fetchLive(`${slug}.localhost`, "/visit");
    expect(liveVisit.status).toBe(200);
    expect(liveVisit.body).toContain('<a href="/visit" class="active" aria-current="page">');
    expect(liveVisit.body).not.toContain('<a href="/" class="active"');
    expect(liveVisit.body).not.toContain("<!--#include");
  }).toPass();
});

async function revealNav(page: Page) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
}
