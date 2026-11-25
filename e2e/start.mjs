import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(join(dirname(fileURLToPath(import.meta.url)), ".."));

const port = process.env.E2E_PORT ?? "3100";
const fixturePort = process.env.E2E_FIXTURE_PORT ?? "3999";
const ownDatabase = !process.env.DATABASE_URL;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://flagstage:flagstage@127.0.0.1:54329/flagstage";
const storageDir = process.env.FS_STORAGE_DIR ?? "/tmp/flagstage-e2e-storage";

const header = "<header>Park header</header>\n";
// The preload exists so the crawler stores the include fragment next to the page.
const html = `<!doctype html><html><head><title>Parks</title></head><body>
<!--#include virtual="/_inc/header.html" -->
<h1>Parks</h1>
<p>Welcome to the parks.</p>
<link rel="preload" href="/_inc/header.html" as="fetch">
</body></html>`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dockerArgs() {
  const probe = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (probe.status === 0) return ["docker"];
  return ["sudo", "docker"];
}

const docker = dockerArgs();

function run(args) {
  const result = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

async function ensurePostgres() {
  if (!ownDatabase) return;
  const inspect = spawnSync(
    docker[0],
    [...docker.slice(1), "inspect", "-f", "{{.State.Running}}", "flagstage-e2e-pg"],
    {
      encoding: "utf8"
    }
  );
  if (inspect.status !== 0) {
    run([
      ...docker,
      "run",
      "-d",
      "--name",
      "flagstage-e2e-pg",
      "-e",
      "POSTGRES_USER=flagstage",
      "-e",
      "POSTGRES_PASSWORD=flagstage",
      "-e",
      "POSTGRES_DB=flagstage",
      "-p",
      "127.0.0.1:54329:5432",
      "postgres:17-alpine"
    ]);
  } else if (inspect.stdout.trim() !== "true") {
    run([...docker, "start", "flagstage-e2e-pg"]);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = spawnSync(
      docker[0],
      [
        ...docker.slice(1),
        "exec",
        "flagstage-e2e-pg",
        "pg_isready",
        "-U",
        "flagstage",
        "-d",
        "flagstage"
      ],
      { stdio: "ignore" }
    );
    if (ready.status === 0) break;
    if (attempt === 29) {
      console.error("Postgres did not become ready.");
      process.exit(1);
    }
    await sleep(1000);
  }
  run([
    ...docker,
    "exec",
    "flagstage-e2e-pg",
    "psql",
    "-U",
    "flagstage",
    "-d",
    "postgres",
    "-c",
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'flagstage' AND pid <> pg_backend_pid();"
  ]);
  spawnSync(
    docker[0],
    [
      ...docker.slice(1),
      "exec",
      "flagstage-e2e-pg",
      "dropdb",
      "-U",
      "flagstage",
      "--if-exists",
      "flagstage"
    ],
    {
      stdio: "inherit"
    }
  );
  run([...docker, "exec", "flagstage-e2e-pg", "createdb", "-U", "flagstage", "flagstage"]);
}

await ensurePostgres();
mkdirSync(storageDir, { recursive: true });

const fixture = createServer((_req, res) => {
  const path = new URL(_req.url ?? "/", "http://127.0.0.1").pathname;
  if (path === "/_inc/header.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(header);
    return;
  }
  if (path !== "/") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((resolve) => fixture.listen(Number(fixturePort), "127.0.0.1", resolve));

const corpusPort = process.env.E2E_CORPUS_PORT ?? "4000";
const corpusNav = [
  ["/", "Home"],
  ["/news", "News"],
  ["/visit", "Visit"],
  ["/about", "About"],
  ["/hours", "Hours"],
  ["/membership", "Membership"],
  ["/contact", "Contact"],
  ["/events", "Events"]
];
const corpusStories = Array.from({ length: 30 }, (_item, index) =>
  String(index + 1).padStart(2, "0")
);

function storyDate(day) {
  return new Date(Date.UTC(2020, 0, day)).toISOString().slice(0, 10);
}

function corpusHeader(active) {
  const links = corpusNav
    .map(([href, label]) =>
      href === active
        ? `<a href="${href}" class="active" aria-current="page">${label}</a>`
        : `<a href="${href}">${label}</a>`
    )
    .join("");
  return `<header class="site-header">Grove header<nav class="site-nav">${links}</nav></header>`;
}

const corpusFooter = `<footer class="site-footer">Grove footer for every page.</footer>`;

function corpusPage(title, active, main, head = "") {
  return `<!doctype html><html lang="en"><head><title>${title}</title>${head}</head><body>${corpusHeader(active)}${main}${corpusFooter}</body></html>`;
}

function corpusCards() {
  return corpusStories
    .map(
      (id) =>
        `<article><h2>Card ${id}</h2><a href="/stories/${id}">Read story ${id}</a></article>`
    )
    .join("");
}

const corpusPages = new Map();
corpusPages.set(
  "/",
  corpusPage("Home", "/", `<main><h1>Home</h1>${corpusCards()}</main>`)
);
corpusPages.set(
  "/news",
  corpusPage("News", "/news", `<main><h1>News</h1>${corpusCards()}</main>`)
);
for (const id of corpusStories) {
  const data = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: `Story ${id}`,
    datePublished: storyDate(Number(id)),
    articleSection: "Stories",
    keywords: ["grove"],
    description: `Story ${id} tells one visit to the grove.`
  });
  corpusPages.set(
    `/stories/${id}`,
    corpusPage(
      `Story ${id}`,
      "/news",
      `<main><article><h1>Story ${id}</h1><p>Story ${id} tells one visit to the grove.</p></article></main>`,
      `<script type="application/ld+json">${data}</script>`
    )
  );
}
for (const name of ["visit", "about", "hours", "membership", "contact"]) {
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  corpusPages.set(
    `/${name}`,
    corpusPage(
      title,
      `/${name}`,
      `<main><h1>${title}</h1><p>${title} intro for this grove page.</p><p>Second paragraph for ${title}.</p></main>`
    )
  );
}
corpusPages.set(
  "/events",
  corpusPage(
    "Events",
    "/events",
    `<main><table><tr><th>Event</th><th>Day</th></tr><tr><td>Concert on Friday</td><td>Friday</td></tr></table></main>`
  )
);

const corpus = createServer((_req, res) => {
  const path = new URL(_req.url ?? "/", "http://127.0.0.1").pathname.replace(/\/+$/, "") || "/";
  const body = corpusPages.get(path);
  if (!body) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((resolve) => corpus.listen(Number(corpusPort), "127.0.0.1", resolve));

const wpPort = process.env.E2E_WP_PORT ?? "4001";
const wpHeader = `<header class="site-header"><p>Pine and Harbor outfitters</p><nav class="site-nav"><a href="/">Home</a><a href="/jackets">Jackets</a><a href="/boots">Boots</a><a href="/coats">Coats</a><a href="/visit">Visit</a></nav></header>`;

function wpFooter(year) {
  return `<footer class="site-footer"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a><p>Copyright ${year}</p></footer>`;
}

function wpPage(title, main, year = "2026") {
  return `<!doctype html><html><head><title>${title}</title></head><body>${wpHeader}<main>${main}</main>${wpFooter(year)}</body></html>`;
}

const wpPages = new Map([
  ["/", wpPage("Home", "<h1>Home</h1><p>Welcome to the outfitters.</p>")],
  [
    "/jackets",
    wpPage("Women's jackets", "<h1>Women's jackets</h1><p>A size chart for this jacket.</p>", "2025")
  ],
  ["/boots", wpPage("Boots", "<article><h1>Boots</h1><p>A boot for the trail.</p></article>")],
  ["/coats", wpPage("Coats", "<article><h1>Coats</h1><p>A coat for the harbor.</p></article>")],
  [
    "/visit",
    wpPage(
      "Visit us",
      "<h1>Visit us</h1><p>The shop is on the harbor.</p><p>Hours are posted at the door.</p>"
    )
  ]
]);

const wordpress = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname.replace(/\/+$/, "") || "/";
  if (path === "/wp-json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ name: "Pine and Harbor", namespaces: ["wp/v2"] }));
    return;
  }
  const body = wpPages.get(path);
  if (!body) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  await sleep(3000);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((resolve) => wordpress.listen(Number(wpPort), "127.0.0.1", resolve));

const env = {
  ...process.env,
  PATH: `${join(process.cwd(), "e2e/bin")}${delimiter}${process.env.PATH ?? ""}`,
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "local-dev-secret-that-is-long-enough",
  APP_URL: `http://127.0.0.1:${port}`,
  STORAGE_DRIVER: "fs",
  FS_STORAGE_DIR: storageDir,
  HOSTMAP_DRIVER: "fs",
  DEV_SITES_PORT: "8088",
  DOMAINS_DRIVER: "none",
  EMAIL_PASSWORD_ENABLED: "1",
  E2E_EMAIL: "e2e@example.com",
  E2E_PASSWORD: "e2e-password-e2e-password",
  NODE_ENV: "development",
  LOG_LEVEL: "info",
  NEXT_TELEMETRY_DISABLED: "1"
};

const children = [];
function start(command, args) {
  const child = spawn(command, args, { env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || code === 0) return;
    console.error(`${command} exited ${code ?? signal}`);
    shutdown(code ?? 1);
  });
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  fixture.close();
  corpus.close();
  wordpress.close();
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

const prepared = spawnSync(
  "pnpm",
  ["--filter", "@flagstage/auth", "exec", "tsx", "scripts/e2e-prepare.ts"],
  { env, stdio: "inherit" }
);
if (prepared.status !== 0) process.exit(prepared.status ?? 1);

start("node", ["script/dev-sites.mjs"]);
start("pnpm", [
  "--filter",
  "@flagstage/web",
  "exec",
  "next",
  "dev",
  "--port",
  port,
  "--hostname",
  "127.0.0.1"
]);
