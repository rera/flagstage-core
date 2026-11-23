import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SITE_EDIT_PLUGIN_SOURCE } from "./site-tools/plugin";
import { readToolLog, runSiteTool } from "./site-tools/run";
import { startSiteToolServer } from "./site-tools/server";

const COUNT = 2000;
const NAV =
  '<nav><a href="/">Home</a> <a href="/news/">News</a> Harbor hours: the marina opens at dawn.</nav>';
const FOOTER = "<footer>© 2014 Flagstage Marina. All rights reserved.</footer>";

type Kind = "normal" | "decoy" | "curly" | "blockquote" | "attribute" | "quoteHarbor";

type Plan = {
  path: string;
  kind: Kind;
  section: "Kitchen" | "Waterfront";
  inlined: boolean;
  capital: boolean;
  oldLink: boolean;
};

function planPage(index: number): Plan {
  const path = index === 0 ? "index.html" : `news/${String(index).padStart(4, "0")}.html`;
  let kind: Kind = "normal";
  if (index === 1) kind = "decoy";
  else if (index === 2) kind = "curly";
  else if (index === 4) kind = "blockquote";
  else if (index === 6) kind = "attribute";
  else if (index !== 0 && index % 17 === 0) kind = "quoteHarbor";
  return {
    path,
    kind,
    section: index === 1 || index % 5 === 0 ? "Kitchen" : "Waterfront",
    inlined: index !== 0 && index % 11 === 0 && kind === "normal",
    capital: index !== 0 && index % 13 === 0 && kind === "normal",
    oldLink: index % 23 === 0
  };
}

function pageHtml(plan: Plan, index: number): string {
  const tag = plan.kind === "decoy" ? "pasta" : plan.kind === "quoteHarbor" ? "notes" : "harbor";
  const json = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: `Story ${index}`,
      datePublished: "2024-03-01",
      articleSection: plan.section,
      keywords: [tag],
      description: "A page."
    },
    null,
    2
  );
  const heading = plan.capital ? "The Marina story" : `Story ${index}`;
  const body =
    plan.kind === "decoy"
      ? "<p>The marinara sauce simmers all afternoon.</p>"
      : plan.kind === "curly"
        ? `<p>He said \u201cmarina\u201d and then left.</p><p>The marinara was unrelated.</p>`
        : plan.kind === "blockquote"
          ? "<p>The dock is quiet.</p><blockquote>The marina was full.</blockquote>"
          : plan.kind === "attribute"
            ? '<p>A plain dock.</p><a class="marina-link" href="/marina">Map</a>'
            : plan.kind === "quoteHarbor"
              ? '<p>The dock is quiet.</p><blockquote>Call it a harbor.</blockquote><p>She wrote "harbor light" and left.</p>'
              : "<p>The marina opens beside the harbor. Try the marinara.</p><blockquote>Someone said marina in passing.</blockquote>";
  const link = plan.oldLink
    ? `<p><a href="https://example.com/old/slip-${index}">Slip</a></p>`
    : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Story ${index}</title>
<script type="application/ld+json">
${json}
</script>
<meta property="article:tag" content="${tag}">
</head>
<body>
${plan.inlined ? NAV : '<!--#include virtual="/_inc/nav.html" -->'}
<article>
<h1>${heading}</h1>
${body}
<ul class="tags"><li><a rel="tag" href="/tags/${tag}/">${tag}</a></li></ul>
${link}
</article>
<!--#include virtual="/_inc/footer.html" -->
</body>
</html>
`;
}

function writeCorpus(dir: string): Plan[] {
  const plans = Array.from({ length: COUNT }, (_, index) => planPage(index));
  mkdirSync(join(dir, "_inc"), { recursive: true });
  mkdirSync(join(dir, "_templates"), { recursive: true });
  writeFileSync(join(dir, "_inc", "nav.html"), NAV);
  writeFileSync(join(dir, "_inc", "footer.html"), FOOTER);
  writeFileSync(
    join(dir, "_templates", "article.html"),
    "<article><p>the marina template</p></article>"
  );
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    if (!plan) continue;
    const abs = join(dir, ...plan.path.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, pageHtml(plan, index));
  }
  return plans;
}

function articleOf(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return JSON.parse(match?.[1] ?? "{}") as Record<string, unknown>;
}

function copyCorpus(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "flagstage-edit-"));
  cpSync(source, dir, { recursive: true });
  rmSync(join(dir, ".flagstage"), { recursive: true, force: true });
  return dir;
}

describe("site-edit tools", () => {
  const root = mkdtempSync(join(tmpdir(), "flagstage-corpus-"));
  let plans: Plan[] = [];

  beforeAll(() => {
    plans = writeCorpus(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds pages by glob, text, selector, and JSON-LD without matching marinara", () => {
    const started = performance.now();
    const byText = runSiteTool(root, "find_pages", { text: "marina" });
    const textBody = byText.body as { count: number; pages: string[] };
    expect(textBody.count).toBeGreaterThan(1000);
    expect(textBody.pages).not.toContain("news/0001.html");
    expect(textBody.pages).not.toContain("news/0006.html");
    expect(byText.record.files).not.toContain("news/0001.html");

    const quotes = runSiteTool(root, "find_pages", { text: "marina", skipQuotes: true });
    const quoteFiles = (quotes.body as { count: number }).count;
    expect(quoteFiles).toBeLessThan(textBody.count);
    expect(quotes.record.files).not.toContain("news/0002.html");
    expect(quotes.record.files).not.toContain("news/0004.html");
    expect(quotes.record.files).toContain("news/0008.html");

    const attributes = runSiteTool(root, "find_pages", {
      text: "marina",
      skipAttributes: false,
      glob: "news/0006.html"
    });
    expect((attributes.body as { count: number }).count).toBe(1);

    const quoted = runSiteTool(root, "find_pages", { selector: "blockquote" });
    expect(quoted.record.files).toContain("news/0004.html");
    expect(quoted.record.files).not.toContain("news/0001.html");
    expect(quoted.record.files).not.toContain("news/0006.html");

    const kitchen = runSiteTool(root, "find_pages", {
      jsonLdField: "articleSection",
      jsonLdValue: "Kitchen"
    });
    expect(kitchen.record.files).toContain("index.html");
    expect(kitchen.record.files).toContain("news/0001.html");
    expect(kitchen.record.files).not.toContain("news/0003.html");

    const one = runSiteTool(root, "find_pages", { glob: "news/0001.html" });
    expect((one.body as { count: number; pages: string[] }).pages).toEqual(["news/0001.html"]);
    const nested = runSiteTool(root, "find_pages", { glob: "news/**/*.html" });
    expect((nested.body as { count: number }).count).toBe(COUNT - 1);
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(plans).toHaveLength(COUNT);
  });

  it("reads one page and rejects a path outside the site", () => {
    const page = runSiteTool(root, "read_page", { path: "news/0008.html" });
    expect(String((page.body as { text: string }).text)).toContain("The marina opens");
    expect(page.record.files).toEqual(["news/0008.html"]);
    const escaped = runSiteTool(root, "read_page", { path: "../secret.html" });
    expect(escaped.body).toEqual({ error: "path must stay inside the site." });
  });

  it("previews replace_text across the corpus, then applies it without touching marinara", () => {
    const dir = copyCorpus(root);
    try {
      const started = performance.now();
      const preview = runSiteTool(dir, "replace_text", { find: "marina", replace: "harbor" });
      const elapsed = performance.now() - started;
      const body = preview.body as {
        dryRun: boolean;
        dryRunId?: string;
        changed: number;
        sample: { path: string; diff: string }[];
      };
      expect(body.dryRun).toBe(true);
      expect(body.dryRunId).toMatch(/^[0-9a-f]{16}$/);
      expect(body.changed).toBeGreaterThan(1000);
      expect(body.sample[0]?.diff).toContain("-");
      expect(body.sample[0]?.diff).toContain("+");
      expect(readFileSync(join(dir, "news/0008.html"), "utf8")).toContain("The marina opens");
      expect(elapsed).toBeLessThan(10_000);

      const stale = runSiteTool(dir, "replace_text", {
        find: "marina",
        replace: "harbor",
        apply: "not-the-id"
      });
      expect(stale.body).toMatchObject({ error: expect.stringContaining("does not match") });
      expect(readFileSync(join(dir, "news/0008.html"), "utf8")).toContain("The marina opens");

      const applied = runSiteTool(dir, "replace_text", {
        find: "marina",
        replace: "harbor",
        apply: body.dryRunId
      });
      expect(applied.body).toMatchObject({ applied: true, dryRunId: body.dryRunId });
      expect(applied.record.mode).toBe("apply");
      expect(applied.record.files).not.toContain("news/0001.html");
      expect(applied.record.files).not.toContain("news/0006.html");
      const normal = readFileSync(join(dir, "news/0008.html"), "utf8");
      expect(normal).toContain("The harbor opens beside the harbor");
      expect(normal).toContain("Try the marinara");
      expect(normal).not.toContain("The marina opens");
      const decoy = readFileSync(join(dir, "news/0001.html"), "utf8");
      expect(decoy).toContain("marinara");
      expect(decoy).not.toContain("harbor");
      expect(readFileSync(join(dir, "news/0006.html"), "utf8")).toContain('class="marina-link"');
      expect(readFileSync(join(dir, "news/0013.html"), "utf8")).toContain("The Marina story");
      expect(readFileSync(join(dir, "_inc/nav.html"), "utf8")).toContain("the harbor opens");
      expect(readFileSync(join(dir, "_templates/article.html"), "utf8")).toContain(
        "the harbor template"
      );
      const log = readToolLog(dir);
      expect(log.map((entry) => `${entry.tool}:${entry.mode}`)).toEqual([
        "replace_text:dry-run",
        "replace_text:dry-run",
        "replace_text:apply"
      ]);
      expect(log[2]?.files).toEqual(applied.record.files);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips quotes and can include attributes when the flags say so", () => {
    const dir = copyCorpus(root);
    try {
      const preview = runSiteTool(dir, "replace_text", {
        find: "marina",
        replace: "harbor",
        skipQuotes: true
      });
      const id = (preview.body as { dryRunId: string }).dryRunId;
      runSiteTool(dir, "replace_text", {
        find: "marina",
        replace: "harbor",
        skipQuotes: true,
        apply: id
      });
      expect(readFileSync(join(dir, "news/0004.html"), "utf8")).toContain(
        "<blockquote>The marina was full.</blockquote>"
      );
      expect(readFileSync(join(dir, "news/0002.html"), "utf8")).toContain("\u201cmarina\u201d");
      expect(readFileSync(join(dir, "news/0008.html"), "utf8")).toContain("The harbor opens");
      expect(readFileSync(join(dir, "news/0008.html"), "utf8")).toContain(
        "<blockquote>Someone said marina in passing.</blockquote>"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const attrs = copyCorpus(root);
    try {
      const preview = runSiteTool(attrs, "replace_text", {
        find: "marina",
        replace: "harbor",
        skipAttributes: false,
        glob: "news/0006.html"
      });
      runSiteTool(attrs, "replace_text", {
        find: "marina",
        replace: "harbor",
        skipAttributes: false,
        glob: "news/0006.html",
        apply: (preview.body as { dryRunId: string }).dryRunId
      });
      const html = readFileSync(join(attrs, "news/0006.html"), "utf8");
      expect(html).toContain('class="harbor-link"');
      expect(html).toContain('href="/harbor"');
    } finally {
      rmSync(attrs, { recursive: true, force: true });
    }
  });

  it("copies the match's capitalization when preserveCase is set", () => {
    const dir = copyCorpus(root);
    try {
      const preview = runSiteTool(dir, "replace_text", {
        find: "marina",
        replace: "harbor",
        caseSensitive: false,
        preserveCase: true,
        glob: "news/0013.html"
      });
      runSiteTool(dir, "replace_text", {
        find: "marina",
        replace: "harbor",
        caseSensitive: false,
        preserveCase: true,
        glob: "news/0013.html",
        apply: (preview.body as { dryRunId: string }).dryRunId
      });
      const html = readFileSync(join(dir, "news/0013.html"), "utf8");
      expect(html).toContain("The Harbor story");
      expect(html).toContain("The harbor opens");
      expect(html).toContain("marinara");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("edits one include and does not follow a path out of _inc", () => {
    const dir = copyCorpus(root);
    try {
      const preview = runSiteTool(dir, "edit_include", {
        path: "_inc/footer.html",
        find: "2014",
        replace: "2026"
      });
      const body = preview.body as {
        dryRunId: string;
        changed: number;
        sample: { diff: string }[];
      };
      expect(body.changed).toBe(1);
      expect(body.sample[0]?.diff).toContain("-");
      expect(body.sample[0]?.diff).toContain("2014");
      expect(body.sample[0]?.diff).toContain("2026");
      expect(readFileSync(join(dir, "_inc/footer.html"), "utf8")).toContain("2014");
      const applied = runSiteTool(dir, "edit_include", {
        path: "/_inc/footer.html",
        find: "2014",
        replace: "2026",
        apply: body.dryRunId
      });
      expect(applied.record).toMatchObject({ mode: "apply", files: ["_inc/footer.html"] });
      expect(readFileSync(join(dir, "_inc/footer.html"), "utf8")).toContain(
        "© 2026 Flagstage Marina"
      );
      expect(readFileSync(join(dir, "index.html"), "utf8")).toContain(
        'virtual="/_inc/footer.html"'
      );
      expect(readFileSync(join(dir, "index.html"), "utf8")).not.toContain("2026");
      expect(
        runSiteTool(dir, "edit_include", { path: "_inc/../index.html", find: "a", replace: "b" })
          .body
      ).toEqual({
        error: "path must be a file under _inc/."
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sets and removes JSON-LD fields on the matching pages", () => {
    const dir = copyCorpus(root);
    try {
      const preview = runSiteTool(dir, "set_meta", {
        jsonLdField: "articleSection",
        jsonLdValue: "Waterfront",
        field: "articleSection",
        value: "Shore"
      });
      const body = preview.body as { dryRunId: string; pagesMatched: number; changed: number };
      expect(body.changed).toBeGreaterThan(1000);
      expect(body.changed).toBe(body.pagesMatched);
      runSiteTool(dir, "set_meta", {
        jsonLdField: "articleSection",
        jsonLdValue: "Waterfront",
        field: "articleSection",
        value: "Shore",
        apply: body.dryRunId
      });
      expect(articleOf(readFileSync(join(dir, "news/0003.html"), "utf8")).articleSection).toBe(
        "Shore"
      );
      expect(articleOf(readFileSync(join(dir, "news/0005.html"), "utf8")).articleSection).toBe(
        "Kitchen"
      );
      expect(articleOf(readFileSync(join(dir, "news/0001.html"), "utf8")).articleSection).toBe(
        "Kitchen"
      );

      const removal = runSiteTool(dir, "set_meta", {
        glob: "news/0003.html",
        field: "description",
        remove: true
      });
      runSiteTool(dir, "set_meta", {
        glob: "news/0003.html",
        field: "description",
        remove: true,
        apply: (removal.body as { dryRunId: string }).dryRunId
      });
      const updated = articleOf(readFileSync(join(dir, "news/0003.html"), "utf8"));
      expect(updated.description).toBeUndefined();
      expect(updated.headline).toBe("Story 3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("retags JSON-LD and the visible tags, and can leave quotes alone", () => {
    const dir = copyCorpus(root);
    try {
      const preview = runSiteTool(dir, "retag", { text: "harbor", add: "waterfront" });
      expect((preview.body as { changed: number }).changed).toBeGreaterThan(1000);
      expect(preview.record.files).toContain("news/0017.html");
      expect(preview.record.files).not.toContain("news/0001.html");
      runSiteTool(dir, "retag", {
        text: "harbor",
        add: "waterfront",
        apply: (preview.body as { dryRunId: string }).dryRunId
      });
      const page = readFileSync(join(dir, "news/0008.html"), "utf8");
      expect(articleOf(page).keywords).toEqual(["harbor", "waterfront"]);
      expect(page).toContain('rel="tag" href="/tags/waterfront/">waterfront');
      expect(page).toContain('content="waterfront"');
      expect(page).toContain('rel="tag" href="/tags/harbor/"');
      expect(readFileSync(join(dir, "news/0001.html"), "utf8")).not.toContain("waterfront");
      expect(readFileSync(join(dir, "news/0017.html"), "utf8")).toContain("waterfront");

      const removal = runSiteTool(dir, "retag", { glob: "news/0008.html", remove: "harbor" });
      runSiteTool(dir, "retag", {
        glob: "news/0008.html",
        remove: "harbor",
        apply: (removal.body as { dryRunId: string }).dryRunId
      });
      const removed = readFileSync(join(dir, "news/0008.html"), "utf8");
      expect(articleOf(removed).keywords).toEqual(["waterfront"]);
      expect(removed).not.toContain('content="harbor"');
      expect(removed).not.toContain('href="/tags/harbor/"');
      expect(removed).toContain("beside the harbor");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const quiet = copyCorpus(root);
    try {
      const preview = runSiteTool(quiet, "retag", {
        text: "harbor",
        add: "waterfront",
        skipQuotes: true
      });
      expect(preview.record.files).not.toContain("news/0017.html");
      expect(preview.record.files).toContain("news/0008.html");
    } finally {
      rmSync(quiet, { recursive: true, force: true });
    }
  });

  it("lists links and rewrites a pattern", () => {
    const dir = copyCorpus(root);
    try {
      const listed = runSiteTool(dir, "list_links", { pattern: "https://example.com/old/**" });
      const links = listed.body as { count: number; links: { href: string }[] };
      expect(links.count).toBeGreaterThan(10);
      expect(links.links.some((link) => link.href === "https://example.com/old/slip-0")).toBe(true);
      const preview = runSiteTool(dir, "list_links", {
        pattern: "https://example.com/old/**",
        replacement: "https://example.com/new/$1"
      });
      const sample = (preview.body as { sample: { diff: string }[]; dryRunId: string }).sample[0];
      expect(sample?.diff).toContain("https://example.com/old/");
      expect(sample?.diff).toContain("https://example.com/new/");
      runSiteTool(dir, "list_links", {
        pattern: "https://example.com/old/**",
        replacement: "https://example.com/new/$1",
        apply: (preview.body as { dryRunId: string }).dryRunId
      });
      expect(readFileSync(join(dir, "index.html"), "utf8")).toContain(
        'href="https://example.com/new/slip-0"'
      );
      expect(readFileSync(join(dir, "index.html"), "utf8")).not.toContain(
        "https://example.com/old/"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves the tools on loopback and the plugin file parses", () => {
    const dir = copyCorpus(root);
    const checked = join(dir, "plugin.mjs");
    writeFileSync(checked, SITE_EDIT_PLUGIN_SOURCE);
    const syntax = spawnSync(process.execPath, ["--check", checked], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);
    expect(SITE_EDIT_PLUGIN_SOURCE).toContain("ctx.tool.transform");
    expect(SITE_EDIT_PLUGIN_SOURCE).not.toContain("@opencode/plugin");
    return startSiteToolServer(dir).then(async (server) => {
      try {
        const denied = await fetch(`http://127.0.0.1:${server.port}/tools`);
        expect(denied.status).toBe(401);
        const headers = { authorization: `Bearer ${server.token}` };
        const listed = await fetch(`http://127.0.0.1:${server.port}/tools`, { headers });
        const specs = (await listed.json()) as { name: string }[];
        expect(specs.map((tool) => tool.name)).toEqual([
          "find_pages",
          "read_page",
          "edit_include",
          "set_meta",
          "retag",
          "replace_text",
          "list_links"
        ]);
        const preview = await fetch(`http://127.0.0.1:${server.port}/tool`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            tool: "edit_include",
            input: { path: "_inc/footer.html", find: "2014", replace: "2026" }
          })
        });
        const body = (await preview.json()) as { dryRunId: string };
        expect(body.dryRunId).toMatch(/^[0-9a-f]{16}$/);
        expect(server.calls.map((call) => call.tool)).toEqual(["edit_include"]);
        expect(server.calls[0]?.mode).toBe("dry-run");
      } finally {
        await server.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
