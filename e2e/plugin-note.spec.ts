import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "../apps/web/package.json")
);
const { Client } = require("pg") as {
  Client: new (config: { connectionString: string }) => {
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  };
};

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://flagstage:flagstage@127.0.0.1:54329/flagstage";
const storageDir = process.env.FS_STORAGE_DIR ?? "/tmp/flagstage-e2e-storage";

const ROWS = [
  "Search box on /blog",
  "Sign-in form on /account",
  "Comment form on /news",
  "Checkout on /shop",
  "File upload form on /apply",
  "Form on /contact"
];

const PAGES = [
  "index.html",
  "blog/index.html",
  "account/index.html",
  "news/index.html",
  "shop/index.html",
  "apply/index.html",
  "contact/index.html"
];

test("the import result lists removed forms, and go live is not blocked", async ({
  page
}, testInfo) => {
  const stamp = Date.now().toString(36);
  const seeded = await seedSites(stamp);
  await signIn(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await openOverview(page, seeded.withForms);
  const note = page.getByRole("status").filter({ hasText: "Some features need a plugin" });
  await expect(note).toBeVisible();
  await expect(note).toContainText(
    "We took these off your new site for now. They'll come back once the matching plugin is ready."
  );
  await expect(note.locator("li")).toHaveText(ROWS);
  await expect(note).not.toContainText("still points");
  await expect(note).not.toContainText("was removed");
  await expect(page.getByText("Go live is blocked.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared sections" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Flagstage" })).toBeVisible();
  const history = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "History" }) });
  await expect(history.locator("time")).toHaveText(/ET/, { timeout: 15_000 });

  if (testInfo.project.name === "chromium") {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.screenshot({
      path: "/opt/cursor/artifacts/overview-plugin-note-desktop.png",
      fullPage: true
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(note).toBeVisible();
    await page.screenshot({
      path: "/opt/cursor/artifacts/overview-plugin-note-mobile.png",
      fullPage: true
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("button", { name: "Go live" })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("main").getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText("Some features need a plugin")).toHaveCount(0);

  await openOverview(page, seeded.plain);
  await expect(page.getByText("Your pages are ready to review.")).toBeVisible();
  await expect(page.getByText("Some features need a plugin")).toHaveCount(0);
  await expect(page.getByText("Search box on /blog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in" }) });
  await form.getByLabel("Email").fill("e2e@example.com");
  await form.getByLabel("Password").fill("e2e-password-e2e-password");
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts/);
}

async function openOverview(page: Page, siteId: string) {
  await page.goto(`/a/parks/sites/${siteId}`);
  await expect(page.getByText("Your pages are ready to review.")).toBeVisible();
}

async function seedSites(stamp: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const account = await client.query<{ id: string }>("select id from account where slug = $1", [
      "parks"
    ]);
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error("Parks account is missing.");
    const withForms = await insertSite(client, {
      accountId,
      name: "Harbor outfitters",
      slug: `harbor-${stamp.slice(-3)}`,
      sourceUrl: "https://harbor.example",
      forms: true
    });
    const plain = await insertSite(client, {
      accountId,
      name: "Harbor meadow",
      slug: `meadow-${stamp.slice(-3)}`,
      sourceUrl: "https://meadow.example",
      forms: false
    });
    return { withForms, plain };
  } finally {
    await client.end();
  }
}

async function insertSite(
  client: InstanceType<typeof Client>,
  input: { accountId: string; name: string; slug: string; sourceUrl: string; forms: boolean }
) {
  const siteId = randomUUID();
  const snapId = randomUUID();
  const runId = randomUUID();
  const prefix = `snapshots/${siteId}/${snapId}/`;
  writeSnapshot(prefix, input.forms);
  await client.query(
    `insert into site (id, account_id, name, slug, source_url, status, time_zone)
     values ($1, $2, $3, $4, $5, 'preview', 'America/New_York')`,
    [siteId, input.accountId, input.name, input.slug, input.sourceUrl]
  );
  await client.query(
    `insert into snapshot (id, site_id, kind, storage_prefix, file_count, bytes)
     values ($1, $2, 'import', $3, $4, 4000)`,
    [snapId, siteId, prefix, PAGES.length]
  );
  await client.query(
    `insert into import_run (id, site_id, source_url, status, stats, fidelity_report)
     values ($1, $2, $3, 'preview', $4::jsonb, $5::jsonb)`,
    [
      runId,
      siteId,
      input.sourceUrl,
      JSON.stringify({ pages: PAGES.length, assets: 0 }),
      JSON.stringify(input.forms ? formReport() : emptyReport())
    ]
  );
  return siteId;
}

function writeSnapshot(prefix: string, forms: boolean) {
  const src = join(storageDir, prefix, "src");
  for (const path of PAGES) {
    const file = join(src, path);
    mkdirSync(dirname(file), { recursive: true });
    const title = path === "index.html" ? "Home" : (path.split("/")[0] ?? "Page");
    const extra =
      forms && path === "contact/index.html"
        ? `<form action="https://harbor.example/join" method="post"><input type="email" name="email"></form>`
        : "";
    writeFileSync(
      file,
      `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${title} page.</p>${extra}</body></html>`
    );
  }
  const flagstage = join(src, ".flagstage");
  mkdirSync(join(flagstage, "skills", "site"), { recursive: true });
  writeFileSync(
    join(flagstage, "baseline.json"),
    JSON.stringify({
      version: 1,
      pages: PAGES.map((path) => ({
        path,
        text: [],
        links: [],
        images: [],
        sha256: "0"
      })),
      covered: []
    })
  );
  writeFileSync(
    join(flagstage, "drift.json"),
    JSON.stringify({
      version: 1,
      includes: [
        { virtual: "/_inc/header.html", placements: PAGES.map((page) => ({ page })) },
        {
          virtual: "/_inc/nav.html",
          placements: ["index.html", "blog/index.html", "news/index.html"].map((page) => ({
            page
          }))
        },
        { virtual: "/_inc/footer.html", placements: PAGES.map((page) => ({ page })) }
      ]
    })
  );
  writeFileSync(
    join(flagstage, "skills", "site", "SKILL.md"),
    `# Site

## Page types

- \`article\` — template \`_templates/article.html\`. 4 pages, including \`blog/index.html\`. A new article starts from that template.
- \`listing\` — template \`_templates/listing.html\`. 1 pages, including \`news/index.html\`. A new listing starts from that template.
- \`page\` — template \`_templates/page.html\`. 2 pages, including \`visit/index.html\`. A new page starts from that template.
`
  );
}

function emptyReport() {
  return { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [], uncertain: [] };
}

function formReport() {
  return {
    ...emptyReport(),
    forms: [
      { page: "/apply", kind: "file-upload", detail: "A form with a file field was removed." },
      { page: "/shop", kind: "checkout", detail: "A checkout form was removed." },
      { page: "/news", kind: "comments", detail: "A comment form was removed." },
      { page: "/account", kind: "login", detail: "A login form was removed." },
      { page: "/blog", kind: "search", detail: "A search form was removed." },
      { page: "/blog", kind: "search", detail: "A search form was removed." },
      {
        page: "/contact",
        kind: "form",
        detail: 'Form "Form on /contact" was pointed at the site form endpoint.'
      }
    ],
    legacyForms: [
      {
        page: "contact/index.html",
        kind: "form-action",
        detail: 'Form action "https://harbor.example/join" still points at the imported site.'
      }
    ]
  };
}
