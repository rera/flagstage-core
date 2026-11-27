import { describe, expect, it } from "vitest";

import {
  detectImporter,
  publicImporter,
  registerImporter,
  wordpressImporter,
  type ImportOptions,
  type PageFetch
} from "./index";

const caps = { maxPages: 20, maxDepth: 2, maxAssets: 20 };

function options(sourceUrl: string, fetchPage: PageFetch): ImportOptions {
  return {
    sourceUrl,
    appOrigin: "http://localhost:3000",
    siteId: "site-1",
    caps,
    fetchPage
  };
}

function html(body: string) {
  return {
    status: 200,
    body: new TextEncoder().encode(body),
    contentType: "text/html; charset=utf-8"
  };
}

function json(value: unknown) {
  return {
    status: 200,
    body: new TextEncoder().encode(JSON.stringify(value)),
    contentType: "application/json"
  };
}

const wpIndex = json({ name: "Fixture", namespaces: ["oembed/1.0", "wp/v2"] });

const plainPage = `<!doctype html><html><body>
<a href="/about">About</a>
<form class="wpcf7-form" action="/#wpcf7"><input type="hidden" name="_wpcf7" value="12"></form>
<!-- wp-comments-post wp-login.php tribe-events wp-calendar /feed /index.php -->
</body></html>`;

describe("WordPress detector", () => {
  it("matches a WordPress REST index and not a plain site", async () => {
    const requested: string[] = [];
    const wp = await wordpressImporter.detect("https://news.example/about", async (url) => {
      requested.push(url);
      const path = new URL(url).pathname;
      if (path === "/wp-json") return wpIndex;
      return { status: 404, body: new Uint8Array(), contentType: "text/html" };
    });
    expect(requested).toEqual(["https://news.example/wp-json"]);
    expect(wp).toEqual({
      match: true,
      confidence: 0.95,
      evidence: "The site exposes the WordPress REST API at /wp-json."
    });

    const plain = await wordpressImporter.detect("https://plain.example", async () =>
      html("<!doctype html><script>const x = { ok: true }</script>")
    );
    expect(plain).toBeNull();

    const missing = await wordpressImporter.detect("https://plain.example", async () => ({
      status: 404,
      body: new TextEncoder().encode("missing"),
      contentType: "text/html"
    }));
    expect(missing).toBeNull();

    const otherJson = await wordpressImporter.detect("https://plain.example", async () => json({}));
    expect(otherJson).toBeNull();
  });
});

describe("public crawler", () => {
  it("imports a plain site with no WordPress redirects or feed redirects", async () => {
    const requested: string[] = [];
    const result = await publicImporter.run(
      options("https://plain.example", async (url) => {
        const path = new URL(url).pathname;
        requested.push(path);
        if (path === "/" || path === "/about") return html(plainPage);
        if (path === "/wp-json") return wpIndex;
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      })
    );
    expect(result.redirects).toEqual([]);
    expect(result.forms).toEqual([]);
    expect(result.report.forms.map((item) => item.kind)).toEqual(["form", "form"]);
    expect(result.report.plugins).toEqual([]);
    expect(result.pages.map((file) => file.path).sort()).toEqual([
      "about/index.html",
      "index.html"
    ]);
    expect(requested.some((path) => path.startsWith("/wp-"))).toBe(false);
    expect(requested).not.toContain("/sitemap_index.xml");
    expect(requested).not.toContain("/feed");
    expect(requested).not.toContain("/feed/");
    expect(requested).not.toContain("/index.php");
    const home = new TextDecoder().decode(
      result.pages.find((file) => file.path === "index.html")?.body
    );
    expect(home).not.toContain("/f/site-1/cf7-12");
    expect(home).not.toContain("<form");
    expect(home).not.toContain('action="/#wpcf7"');
  });
});

describe("WordPress importer", () => {
  it("seeds REST and sitemap URLs and records ?p= and feed redirects", async () => {
    const origin = "https://news.example";
    const home = `<!doctype html><html><body>
<form class="wpcf7-form" action="/#wpcf7"><input type="hidden" name="_wpcf7" value="12"></form>
<form id="commentform" action="/wp-comments-post.php"></form>
<a href="/wp-login.php">Log in</a>
<div class="wp-calendar"></div>
<div class="tribe-events"></div>
</body></html>`;
    const requested: string[] = [];
    const result = await wordpressImporter.run(
      options(origin, async (url) => {
        const parsed = new URL(url);
        requested.push(`${parsed.pathname}${parsed.search}`);
        if (parsed.pathname === "/") return html(home);
        if (parsed.pathname === "/wp-sitemap.xml") {
          return {
            status: 200,
            body: new TextEncoder().encode(
              `<urlset><url><loc>${origin}/from-map</loc></url></urlset>`
            ),
            contentType: "application/xml"
          };
        }
        if (parsed.pathname === "/sitemap_index.xml") {
          return {
            status: 200,
            body: new TextEncoder().encode(
              `<sitemapindex><sitemap><loc>${origin}/from-index</loc></sitemap></sitemapindex>`
            ),
            contentType: "application/xml"
          };
        }
        if (parsed.pathname === "/wp-json/wp/v2/posts") {
          return json([{ id: 7, link: `${origin}/hello`, modified: "2026-01-01" }]);
        }
        if (parsed.pathname === "/wp-json/wp/v2/pages") {
          return json([{ id: 3, link: `${origin}/about` }]);
        }
        if (
          parsed.pathname === "/from-map" ||
          parsed.pathname === "/from-index" ||
          parsed.pathname === "/hello" ||
          parsed.pathname === "/about"
        ) {
          return html("<!doctype html><p>page</p>");
        }
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      })
    );
    expect(result.pages.map((file) => file.path).sort()).toEqual([
      "about/index.html",
      "from-index/index.html",
      "from-map/index.html",
      "hello/index.html",
      "index.html"
    ]);
    expect(result.redirects).toEqual([
      { fromPath: "/feed", toPath: "/", source: "wordpress" },
      { fromPath: "/feed/", toPath: "/", source: "wordpress" },
      { fromPath: "/index.php", toPath: "/", source: "wordpress" },
      { fromPath: "/?p=3", toPath: "/about", source: "wordpress" },
      { fromPath: "/?p=7", toPath: "/hello", source: "wordpress" }
    ]);
    expect(result.forms.map((form) => form.formKey)).toEqual(["cf7-12"]);
    expect([...new Set(result.report.plugins.map((item) => item.kind))].sort()).toEqual([
      "calendar",
      "comments",
      "login"
    ]);
    expect(requested).toContain("/wp-json/wp/v2/posts?per_page=100&_fields=id,link,modified");
    expect(requested).toContain("/wp-json/wp/v2/pages?per_page=100&_fields=id,link,modified");
    const stored = new TextDecoder().decode(
      result.pages.find((file) => file.path === "index.html")?.body
    );
    expect(stored).toContain("http://localhost:3000/f/site-1/cf7-12");
  });
});

describe("detectImporter", () => {
  it("picks WordPress for a wp/v2 site and falls back to public", async () => {
    const wp = await detectImporter("https://news.example/start", async (url) => {
      if (new URL(url).pathname === "/wp-json") return wpIndex;
      return { status: 404, body: new Uint8Array(), contentType: "text/html" };
    });
    expect(wp).toEqual({
      id: "wordpress",
      label: "WordPress",
      confidence: 0.95,
      evidence: "The site exposes the WordPress REST API at /wp-json."
    });

    const plain = await detectImporter("https://plain.example", async () =>
      html("<!doctype html><p>Hello</p>")
    );
    expect(plain).toEqual({
      id: "public",
      label: "Public website",
      confidence: 0,
      evidence: "No importer recognized this site."
    });
  });

  it("keeps the highest confidence match and ignores a detector that throws", async () => {
    registerImporter({
      id: "zeta",
      label: "Zeta",
      detect(url) {
        if (new URL(url).hostname !== "tie.example") return null;
        return { match: true, confidence: 0.4, evidence: "Zeta markup was found." };
      },
      async run() {
        throw new Error("unused");
      }
    });
    registerImporter({
      id: "alpha",
      label: "Alpha",
      detect(url) {
        if (new URL(url).hostname !== "tie.example") return null;
        return { match: true, confidence: 0.4, evidence: "Alpha markup was found." };
      },
      async run() {
        throw new Error("unused");
      }
    });
    registerImporter({
      id: "squarespace",
      label: "Squarespace",
      detect(url) {
        if (new URL(url).hostname !== "squarespace.example") return null;
        return { match: true, confidence: 0.99, evidence: "Squarespace markup was found." };
      },
      async run() {
        throw new Error("unused");
      }
    });
    registerImporter({
      id: "broken",
      label: "Broken",
      detect() {
        throw new Error("detector failed");
      },
      async run() {
        throw new Error("unused");
      }
    });

    const tied = await detectImporter("https://tie.example", async () => ({
      status: 404,
      body: new Uint8Array(),
      contentType: "text/html"
    }));
    expect(tied.id).toBe("alpha");
    expect(tied.evidence).toBe("Alpha markup was found.");

    const square = await detectImporter("https://squarespace.example", async (url) => {
      if (new URL(url).pathname === "/wp-json") return wpIndex;
      return html("<!doctype html><p>Square</p>");
    });
    expect(square).toMatchObject({ id: "squarespace", label: "Squarespace", confidence: 0.99 });

    const stillWordPress = await detectImporter("https://news.example", async (url) => {
      if (new URL(url).pathname === "/wp-json") return wpIndex;
      return { status: 404, body: new Uint8Array(), contentType: "text/html" };
    });
    expect(stillWordPress.id).toBe("wordpress");
  });

  it("rejects a URL that is not http or https", async () => {
    const fetchPage = async () => {
      throw new Error("should not fetch");
    };
    await expect(detectImporter("not a url", fetchPage)).rejects.toThrow(/http/);
    await expect(detectImporter("ftp://files.example/readme", fetchPage)).rejects.toThrow(/http/);
  });
});
