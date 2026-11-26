import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });
const password = "e2e-password-e2e-password";
const base = "http://127.0.0.1:3100";

async function signIn(page, email) {
  await page.goto(`${base}/sign-in`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
}

async function shot(page, name, fullPage = false) {
  await settle(page);
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, fullPage });
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    inner: window.innerHeight,
    width: window.innerWidth,
    save: document.querySelector('button[type="submit"]')?.getBoundingClientRect().bottom ?? null,
    active: document.activeElement?.className?.toString?.() ?? document.activeElement?.tagName,
    rings: [...document.querySelectorAll("a,button,input,textarea,select")].filter((el) => {
      const style = getComputedStyle(el);
      return style.outlineStyle !== "none" && style.outlineWidth !== "0px" && el.matches(":focus");
    }).map((el) => el.tagName + " " + (el.getAttribute("aria-label") || el.textContent || "").slice(0, 40))
  }));
  console.log(name, JSON.stringify(box));
  return path;
}

const browser = await chromium.launch();

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
  timezoneId: "America/New_York"
});
const page = await desktop.newPage();
await signIn(page, "jordan.lee@example.com");
const siteId = page.url().match(/\/sites\/([^/?]+)/)?.[1] ?? "";
const site = `${base}/a/championships/sites/${siteId}`;

await page.goto(`${site}/skills/event-facts?editor=code`);
await page.getByRole("heading", { name: "Event facts" }).waitFor();
await page.locator(".cm-content").waitFor();
await page.getByText(/ET/).first().waitFor();
await page.waitForTimeout(250);
await shot(page, "site-skills-code");

await page.goto(`${site}/skills/event-facts?editor=document`);
await page.getByRole("heading", { name: "Event facts" }).waitFor();
await page.getByText("This championship", { exact: true }).waitFor();
await page.getByText(/ET/).first().waitFor();
await page.evaluate(() => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
});
await page.waitForTimeout(200);
await shot(page, "site-skills-document");

await desktop.close();

const admin = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
  timezoneId: "America/New_York"
});
const alex = await admin.newPage();
await signIn(alex, "alex.morgan@example.com");
await alex.goto(`${base}/a/championships/skills/brand-voice?editor=code`);
await alex.getByRole("heading", { name: "Brand voice" }).waitFor();
await alex.locator(".cm-content").waitFor();
await alex.getByText(/ET/).first().waitFor();
await alex.waitForTimeout(250);
await shot(alex, "account-skills-code");

await alex.goto(`${base}/a/championships/skills/brand-voice?editor=document`);
await alex.getByRole("heading", { name: "Brand voice" }).waitFor();
await alex.getByText("Headlines", { exact: true }).waitFor();
await alex.getByText(/ET/).first().waitFor();
await alex.evaluate(() => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
});
await alex.waitForTimeout(200);
await shot(alex, "account-skills-document");
await admin.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  timezoneId: "America/New_York"
});
const phone = await mobile.newPage();
await signIn(phone, "jordan.lee@example.com");
await phone.goto(`${site}/skills/event-facts?editor=code`);
await phone.getByRole("heading", { name: "Event facts" }).waitFor();
await phone.locator(".cm-content").waitFor();
await phone.getByText(/ET/).first().waitFor();
await phone.evaluate(() => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
});
await phone.waitForTimeout(200);
await shot(phone, "site-skills-code-390", true);

await phone.goto(`${site}/skills/event-facts?editor=document`);
await phone.getByRole("heading", { name: "Event facts" }).waitFor();
await phone.getByText("This championship", { exact: true }).waitFor();
await phone.getByText(/ET/).first().waitFor();
await phone.evaluate(() => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
});
await phone.waitForTimeout(200);
await shot(phone, "site-skills-document-390", true);
await mobile.close();

const code = readFileSync(`${out}/site-skills-code.png`).toString("base64");
const doc = readFileSync(`${out}/site-skills-document.png`).toString("base64");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: "Plex";
    src: url("file:///agent/repos/flagstage-core/packages/ui/fonts/ibm-plex-sans-latin-600-normal.woff2") format("woff2");
    font-weight: 600;
  }
  html, body { margin: 0; background: #f3f1f8; }
  body { font-family: "Plex", "IBM Plex Sans", sans-serif; color: #2c2940; }
  .board {
    display: flex;
    gap: 28px;
    align-items: flex-start;
    padding: 28px 32px 36px;
    width: max-content;
  }
  figure { margin: 0; }
  figcaption {
    margin: 0 0 10px 2px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  img {
    display: block;
    width: 1440px;
    height: auto;
    background: white;
    border: 1px solid #e6e4ee;
  }
</style>
</head>
<body>
  <div class="board">
    <figure>
      <figcaption>A: Code style</figcaption>
      <img alt="Code style skill editor" src="data:image/png;base64,${code}" />
    </figure>
    <figure>
      <figcaption>B: Document style</figcaption>
      <img alt="Document style skill editor" src="data:image/png;base64,${doc}" />
    </figure>
  </div>
</body>
</html>`;
writeFileSync("/tmp/editor-compare.html", html);
const board = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const compare = await board.newPage();
await compare.goto("file:///tmp/editor-compare.html");
await compare.evaluate(() => document.fonts.ready);
await compare.screenshot({ path: `${out}/skills-editor-comparison.png`, fullPage: true });
await board.close();
await browser.close();
console.log("comparison ready");
