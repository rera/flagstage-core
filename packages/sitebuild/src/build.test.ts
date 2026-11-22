import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildSite, diffManifests, SiteBuildError } from "./index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function workspace(): { root: string; src: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), "sitebuild-"));
  roots.push(root);
  const src = join(root, "src");
  mkdirSync(src);
  return { root, src, out: join(root, "out") };
}

function write(root: string, rel: string, body: string | Buffer): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function buildError(run: () => void): SiteBuildError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SiteBuildError);
    if (error instanceof SiteBuildError) return error;
  }
  throw new Error("expected SiteBuildError");
}

describe("buildSite", () => {
  it("stitches the SSI directive and marks only the first exact nav link", () => {
    const { src, out } = workspace();
    write(
      src,
      "_inc/header.html",
      '<header>\n  <a href="/">Home</a>\n  <a href="/news">News</a>\n  <a href="/news">News again</a>\n  <a href="/newsletter">Newsletter</a>\n</header>\n'
    );
    write(src, "_inc/footer.html", "<footer>© 2026</footer>\n");
    write(
      src,
      "index.html",
      '<!doctype html>\n<body>\n<!--#include virtual="/_inc/header.html" active="/news" -->\n<main>Hi</main>\nX<!--#include virtual="/_inc/footer.html" -->Y\n</body>\n'
    );
    const result = buildSite({ sourceDir: src, outputDir: out });
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).toBe(
      '<!doctype html>\n<body>\n<header>\n  <a href="/">Home</a>\n  <a href="/news" class="active" aria-current="page">News</a>\n  <a href="/news">News again</a>\n  <a href="/newsletter">Newsletter</a>\n</header>\n\n<main>Hi</main>\nX<footer>© 2026</footer>\nY\n</body>\n'
    );
    expect(html).not.toContain("<!--#include");
    expect(result.stitched).toBe(1);
    expect(result.files).toBe(1);
    expect(existsSync(join(out, "_inc"))).toBe(false);
  });

  it("reproduces inlined chrome by splicing the include, without reparsing HTML", () => {
    const neutral =
      '<header class="site-header"><a href="/">Home</a><a href="/news">News</a><a href="/tickets">Tickets</a></header>';
    const live = neutral.replace(
      '<a href="/news">',
      '<a href="/news" class="active" aria-current="page">'
    );
    const original = `<!doctype html>\n<html>\n<body>\n  ${live}\n  <main>Story</main>\n</body>\n</html>\n`;
    const start = original.indexOf("<header");
    const end = original.indexOf("</header>") + "</header>".length;
    const page =
      original.slice(0, start) +
      '<!--#include virtual="/_inc/header.html" active="/news" -->' +
      original.slice(end);
    const { src, out } = workspace();
    write(src, "_inc/header.html", neutral);
    write(src, "news/story.html", page);
    buildSite({ sourceDir: src, outputDir: out });
    expect(readFileSync(join(out, "news/story.html"), "utf8")).toBe(original);
  });

  it("applies active after nested includes, and accepts a spaced directive", () => {
    const { src, out } = workspace();
    write(src, "_inc/nav.html", '<a href="/news">News</a><a href="/tickets">Tickets</a>');
    write(src, "_inc/header.html", '<header><!--#include virtual="/_inc/nav.html" --></header>');
    write(src, "index.html", "<!--#include\n  active='/news'\n  virtual='/_inc/header.html'\n-->");
    buildSite({ sourceDir: src, outputDir: out });
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe(
      '<header><a href="/news" class="active" aria-current="page">News</a><a href="/tickets">Tickets</a></header>'
    );
  });

  it("keeps each active splice independent when the same partial is used twice", () => {
    const { src, out } = workspace();
    write(src, "_inc/nav.html", '<a href="/news">News</a><a href="/tickets">Tickets</a>');
    write(
      src,
      "index.html",
      '<!--#include virtual="/_inc/nav.html" active="/news"-->\n<!--#include virtual="/_inc/nav.html" active="/tickets" -->'
    );
    buildSite({ sourceDir: src, outputDir: out });
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe(
      '<a href="/news" class="active" aria-current="page">News</a><a href="/tickets">Tickets</a>\n<a href="/news">News</a><a href="/tickets" class="active" aria-current="page">Tickets</a>'
    );
  });

  it("leaves the include unchanged when active is empty or matches no link", () => {
    const { src, out } = workspace();
    write(src, "_inc/nav.html", '<a href="/news">News</a>');
    write(src, "empty.html", '<!--#include virtual="/_inc/nav.html" active="" -->');
    write(src, "miss.html", '<!--#include virtual="/_inc/nav.html" active="/tickets" -->');
    buildSite({ sourceDir: src, outputDir: out });
    expect(readFileSync(join(out, "empty.html"), "utf8")).toBe('<a href="/news">News</a>');
    expect(readFileSync(join(out, "miss.html"), "utf8")).toBe('<a href="/news">News</a>');
  });

  it("copies assets, omits private directories, and hashes output bytes", () => {
    const { src, out } = workspace();
    const bytes = Buffer.from([0, 1, 2, 255, 254, 0x80, 0x3c]);
    write(src, "hello.txt", "hello");
    write(src, "img/logo.bin", bytes);
    write(src, "news/story.html", "<p>story</p>");
    write(src, "_inc/header.html", "SECRET_HEADER");
    write(src, "_templates/article.html", "TEMPLATE_SECRET");
    write(src, ".flagstage/skill.md", "SKILL_SECRET");
    write(src, "news/_templates/hidden.html", "NESTED_SECRET");
    write(src, "section/.flagstage/note.txt", "DOT_SECRET");
    const result = buildSite({ sourceDir: src, outputDir: out });
    expect(Object.keys(result.manifest.files)).toEqual([
      "hello.txt",
      "img/logo.bin",
      "news/story.html"
    ]);
    expect(result.stitched).toBe(0);
    expect(result.diff.changed).toEqual(["hello.txt", "img/logo.bin", "news/story.html"]);
    expect(result.manifest.files["hello.txt"]).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    expect(result.manifest.files["hello.txt"]).toBe(
      createHash("sha256")
        .update(readFileSync(join(out, "hello.txt")))
        .digest("hex")
    );
    expect(readFileSync(join(out, "img/logo.bin"))).toEqual(bytes);
    expect(existsSync(join(out, "_inc"))).toBe(false);
    expect(existsSync(join(out, "_templates"))).toBe(false);
    expect(existsSync(join(out, ".flagstage"))).toBe(false);
    expect(existsSync(join(out, "news", "_templates"))).toBe(false);
    expect(existsSync(join(out, "section", ".flagstage"))).toBe(false);
    const published = readFileSync(join(out, "news/story.html"), "utf8");
    expect(published).toBe("<p>story</p>");
    expect(published).not.toContain("SECRET");
  });

  it("does not follow symbolic links, and rejects an include that escapes /_inc", () => {
    const { root, src, out } = workspace();
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "hidden.html"), "HIDDEN");
    symlinkSync(outside, join(src, "linked-dir"));
    write(src, "secret.html", "SECRET");
    symlinkSync(join(src, "secret.html"), join(src, "link.html"));
    write(src, "index.html", "<p>ok</p>");
    const result = buildSite({ sourceDir: src, outputDir: out });
    expect(result.manifest.files["link.html"]).toBeUndefined();
    expect(result.manifest.files["linked-dir/hidden.html"]).toBeUndefined();
    expect(existsSync(join(out, "link.html"))).toBe(false);
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe("<p>ok</p>");

    write(src, "_inc/leak.html", "");
    rmSync(join(src, "_inc/leak.html"));
    symlinkSync(join(src, "secret.html"), join(src, "_inc/leak.html"));
    write(src, "page.html", '<!--#include virtual="/_inc/leak.html" -->');
    const error = buildError(() => buildSite({ sourceDir: src, outputDir: out }));
    expect(error.code).toBe("bad-path");
    expect(error.message).toBe(
      'Include path "/_inc/leak.html" must stay inside /_inc/ (from page.html)'
    );
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe("<p>ok</p>");
    expect(existsSync(join(out, "page.html"))).toBe(false);
  });

  it("reports added, edited, and removed keys, and an identical rebuild changes nothing", () => {
    const { src, out } = workspace();
    write(src, "a.html", "<p>a</p>");
    write(src, "b.html", "<p>b</p>");
    write(src, "c.html", "<p>c</p>");
    const first = buildSite({ sourceDir: src, outputDir: out });
    expect(first.diff).toEqual({
      changed: ["a.html", "b.html", "c.html"],
      removed: [],
      unchanged: []
    });
    write(src, "a.html", "<p>a2</p>");
    rmSync(join(src, "c.html"));
    write(src, "d.html", "<p>d</p>");
    const second = buildSite({ sourceDir: src, outputDir: out, previous: first.manifest });
    expect(second.diff).toEqual({
      changed: ["a.html", "d.html"],
      removed: ["c.html"],
      unchanged: ["b.html"]
    });
    expect(existsSync(join(out, "c.html"))).toBe(false);
    expect(readFileSync(join(out, "a.html"), "utf8")).toBe("<p>a2</p>");
    const third = buildSite({ sourceDir: src, outputDir: out, previous: second.manifest });
    expect(third.diff.changed).toEqual([]);
    expect(third.diff.removed).toEqual([]);
    expect(third.diff.unchanged).toEqual(["a.html", "b.html", "d.html"]);
    expect(third.manifest).toEqual(second.manifest);
  });

  it("fans one header edit out to every linked page", () => {
    const { src, out } = workspace();
    write(src, "_inc/header.html", '<header><a href="/news">News</a> nav-rev-1</header>');
    for (const name of ["a", "b", "c"]) {
      write(
        src,
        `${name}.html`,
        `<!--#include virtual="/_inc/header.html" active="/news" --><p>${name}</p>`
      );
    }
    write(src, "plain.html", "<p>plain</p>");
    write(src, "css/site.css", "body{}");
    const first = buildSite({ sourceDir: src, outputDir: out });
    write(src, "_inc/header.html", '<header><a href="/news">News</a> nav-rev-2</header>');
    const second = buildSite({ sourceDir: src, outputDir: out, previous: first.manifest });
    expect(second.diff.changed).toEqual(["a.html", "b.html", "c.html"]);
    expect(second.diff.unchanged).toEqual(["css/site.css", "plain.html"]);
    expect(second.diff.removed).toEqual([]);
    expect(second.stitched).toBe(3);
    for (const name of ["a", "b", "c"]) {
      const html = readFileSync(join(out, `${name}.html`), "utf8");
      expect(html).toContain("nav-rev-2");
      expect(html).not.toContain("nav-rev-1");
      expect(html).toContain('<a href="/news" class="active" aria-current="page">');
      expect(html).not.toContain("<!--#include");
    }
    expect(readFileSync(join(out, "plain.html"), "utf8")).toBe("<p>plain</p>");
    expect(existsSync(join(out, "_inc"))).toBe(false);
  });

  it("names a missing include, a cycle, and a path that leaves /_inc", () => {
    const missingDirect = buildError(() => {
      const { src, out } = workspace();
      write(src, "index.html", '<!--#include virtual="/_inc/header.html" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(missingDirect.code).toBe("missing-include");
    expect(missingDirect.message).toBe('Missing include "/_inc/header.html" (from index.html)');

    const missingNested = buildError(() => {
      const { src, out } = workspace();
      write(src, "_inc/header.html", '<!--#include virtual="/_inc/nav.html" -->');
      write(src, "news/a.html", '<!--#include virtual="/_inc/header.html" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(missingNested.message).toBe(
      'Missing include "/_inc/nav.html" (from news/a.html via /_inc/header.html)'
    );

    const notFile = buildError(() => {
      const { src, out } = workspace();
      mkdirSync(join(src, "_inc", "nav"), { recursive: true });
      write(src, "dir.html", '<!--#include virtual="/_inc/nav" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(notFile.message).toBe('Include "/_inc/nav" is not a file (from dir.html)');

    const cycle = buildError(() => {
      const { src, out } = workspace();
      write(src, "_inc/header.html", '<!--#include virtual="/_inc/nav.html" -->');
      write(src, "_inc/nav.html", '<!--#include virtual="/_inc/header.html" -->');
      write(src, "cycle.html", '<!--#include virtual="/_inc/header.html" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(cycle.code).toBe("include-cycle");
    expect(cycle.message).toBe(
      "Include cycle: cycle.html -> /_inc/header.html -> /_inc/nav.html -> /_inc/header.html"
    );

    const escaped = buildError(() => {
      const { src, out } = workspace();
      write(src, "secret.html", "SECRET");
      write(src, "escape.html", '<!--#include virtual="/_inc/../secret.html" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(escaped.code).toBe("bad-path");
    expect(escaped.message).toBe(
      'Include path "/_inc/../secret.html" must stay inside /_inc/ (from escape.html)'
    );

    const outside = buildError(() => {
      const { src, out } = workspace();
      write(src, "root.html", '<!--#include virtual="/header.html" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(outside.message).toBe(
      'Include path "/header.html" must stay inside /_inc/ (from root.html)'
    );
  });

  it("rejects include directives that are not virtual files under /_inc", () => {
    const unclosed = buildError(() => {
      const { src, out } = workspace();
      write(src, "_inc/header.html", "<header></header>");
      write(src, "unclosed.html", '<!--#include virtual="/_inc/header.html"');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(unclosed.message).toBe("Unclosed include in unclosed.html");

    const extra = buildError(() => {
      const { src, out } = workspace();
      write(src, "_inc/header.html", "<header></header>");
      write(src, "file.html", '<!--#include virtual="/_inc/header.html" file="x" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(extra.code).toBe("bad-include");
    expect(extra.message).toBe('Unrecognized include attribute "file" in file.html');

    const duplicate = buildError(() => {
      const { src, out } = workspace();
      write(src, "dup.html", '<!--#include virtual="/_inc/a.html" virtual="/_inc/b.html" -->');
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(duplicate.message).toBe('Duplicate attribute "virtual" on include in dup.html');

    const bare = buildError(() => {
      const { src, out } = workspace();
      write(src, "bare.html", "<!--#include-->");
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(bare.message).toBe('Include in bare.html is missing virtual="/_inc/..."');

    const junk = buildError(() => {
      const { src, out } = workspace();
      write(src, "junk.html", "<!--#include nope -->");
      buildSite({ sourceDir: src, outputDir: out });
    });
    expect(junk.message).toBe("Unrecognized include in junk.html: <!--#include nope-->");
  });

  it("leaves an existing output directory in place when the build fails", () => {
    const { root, src, out } = workspace();
    mkdirSync(out);
    writeFileSync(join(out, "keep.html"), "keep");
    write(src, "index.html", '<!--#include virtual="/_inc/missing.html" -->');
    const error = buildError(() => buildSite({ sourceDir: src, outputDir: out }));
    expect(error.code).toBe("missing-include");
    expect(readFileSync(join(out, "keep.html"), "utf8")).toBe("keep");
    expect(readdirSync(root).filter((name) => name.startsWith(".out-sitebuild-"))).toEqual([]);
  });

  it("refuses to write the output inside the source, or to build a missing source", () => {
    const { root, src, out } = workspace();
    const nested = buildError(() => buildSite({ sourceDir: src, outputDir: join(src, "out") }));
    expect(nested.code).toBe("bad-path");
    expect(nested.message).toContain("must be outside the source directory");
    const missing = buildError(() =>
      buildSite({ sourceDir: join(root, "missing"), outputDir: out })
    );
    expect(missing.message).toContain("Source directory not found");
    writeFileSync(join(root, "file"), "x");
    expect(
      buildError(() => buildSite({ sourceDir: join(root, "file"), outputDir: out })).message
    ).toContain("not a directory");
  });

  it("builds an empty source into an empty output directory", () => {
    const { src, out } = workspace();
    const result = buildSite({ sourceDir: src, outputDir: out });
    expect(result).toMatchObject({
      files: 0,
      stitched: 0,
      diff: { changed: [], removed: [], unchanged: [] }
    });
    expect(readdirSync(out)).toEqual([]);
  });
});

describe("diffManifests", () => {
  it("lists changed, removed, and unchanged keys in sorted order", () => {
    expect(
      diffManifests({ files: { b: "1", z: "9", a: "1" } }, { files: { c: "3", b: "2", a: "1" } })
    ).toEqual({
      changed: ["b", "c"],
      removed: ["z"],
      unchanged: ["a"]
    });
  });
});
