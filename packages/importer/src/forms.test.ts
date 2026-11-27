import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { account, importRun, leadForm, site, type Database } from "@flagstage/db";
import * as fullSchema from "@flagstage/db";

import { crawlSite } from "./crawl";
import { actionTargetsOrigin, detectPageForms, legacyFormPosts } from "./forms";
import { wordpressImporter, type ImportOptions } from "./index";
import { storeImport } from "./persist";
import { applyFormActions } from "./rewrite";
import type { Fetched } from "./types";

const origin = new URL("https://club.example");

function detect(
  html: string,
  page = "/",
  claimed?: Parameters<typeof detectPageForms>[0]["claimed"]
) {
  return detectPageForms({ html, page, origin, claimed });
}

function html(body: string): Fetched {
  return {
    status: 200,
    body: new TextEncoder().encode(body),
    contentType: "text/html; charset=utf-8"
  };
}

const PLAIN = `<!doctype html><html><body>
<form action="/send" method="get" onsubmit="return sendIt()">
  <input type="text" name="your-name">
  <input type="email" name="your-email">
  <textarea name="your-message"></textarea>
  <button type="submit" formaction="/send">Send</button>
</form>
</body></html>`;

const SQUARESPACE = `<!doctype html><html><body>
<div class="form-block">
  <div class="form-wrapper">
    <h2 class="form-title">Get a quote</h2>
    <form class="react-form-contents" data-form-id="abc" method="POST" action="/">
      <div class="field-list">
        <div class="form-item fields text">
          <label class="title">Name</label>
          <input class="field-element text" type="text" name="name">
        </div>
        <div class="form-item field email">
          <label class="title">Email</label>
          <input class="field-element" type="email" name="email">
        </div>
        <div class="form-item field textarea">
          <label class="title">Message</label>
          <textarea class="field-element" name="message"></textarea>
        </div>
      </div>
      <button class="button sqs-system-button" type="submit">Submit</button>
    </form>
  </div>
</div>
</body></html>`;

const WIX = `<!doctype html><html><body>
<div id="comp-wrap" class="wixui-form">
  <h2>Event signup</h2>
  <form id="comp-ks2" class="wixui-form" action="">
    <div class="wixui-text-input">
      <label for="input_comp-1">Email</label>
      <input id="input_comp-1" type="email" name="email" class="wixui-text-input__input">
    </div>
    <div class="wixui-text-box">
      <textarea id="textarea_comp-2" name="message"></textarea>
    </div>
    <button class="wixui-button">Submit</button>
  </form>
</div>
</body></html>`;

const SEARCHES = [
  `<form role="search" action="/" method="get"><input type="search" name="q"></form>`,
  `<form action="/search" method="get"><input type="text" name="query"></form>`,
  `<form action="/find" method="get"><input type="text" name="s"></form>`
];

const EXTERNAL_NEWSLETTER = `<form action="https://example.us1.list-manage.com/subscribe/post?u=1&amp;id=2" method="post">
  <input type="email" name="EMAIL">
  <button>Subscribe</button>
</form>`;

const ONSITE_NEWSLETTER = `<h2>Newsletter</h2>
<form action="/newsletter" method="post">
  <input type="email" name="email">
</form>`;

const TWO_FORMS = `<h2>Quote request</h2>
<form id="quote" action="/quote" method="post">
  <input type="text" name="details">
  <input type="email" name="email">
</form>
<h2>RSVP</h2>
<form action="/rsvp" method="post">
  <select name="attending"><option>Yes</option></select>
  <input type="text" name="guest">
</form>`;

describe("generic form detection", () => {
  it("rewires a plain form, posts it, and does not name it Contact form", () => {
    const found = detect(PLAIN, "/contact");
    expect(found.mapped).toEqual([
      expect.objectContaining({
        formKey: "contact-1",
        name: "Form on /contact",
        page: "/contact",
        marker: 'data-flagstage-form="contact-1"'
      })
    ]);
    expect(found.notes).toEqual([
      {
        page: "/contact",
        kind: "form",
        detail: 'Form "Form on /contact" was pointed at the site form endpoint.'
      }
    ]);
    const rewritten = applyFormActions(found.html, "http://localhost:3000", "site-1", found.mapped);
    expect(rewritten).toContain('method="post"');
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/contact-1"');
    expect(rewritten).toContain('name="your-name"');
    expect(rewritten).toContain('name="your-email"');
    expect(rewritten).toContain('name="your-message"');
    expect(rewritten).not.toContain("onsubmit");
    expect(rewritten).not.toContain("formaction");
    expect(rewritten).not.toContain('method="get"');
    expect(rewritten).not.toContain("Contact form");
  });

  it("rewires a Squarespace-style form from its heading", () => {
    const found = detect(SQUARESPACE, "/");
    expect(found.mapped).toEqual([
      expect.objectContaining({ formKey: "home-1", name: "Get a quote", page: "/" })
    ]);
    const rewritten = applyFormActions(found.html, "http://localhost:3000", "site-1", found.mapped);
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/home-1"');
    expect(rewritten).toContain('name="email"');
    expect(rewritten).toContain('name="message"');
  });

  it("rewires a Wix-style form and keeps the generated id in the key", () => {
    const found = detect(WIX, "/events");
    expect(found.mapped).toEqual([
      expect.objectContaining({
        formKey: "events-comp-ks2",
        name: "Event signup",
        page: "/events",
        marker: 'id="comp-ks2"'
      })
    ]);
  });

  it("removes search forms instead of rewiring them", () => {
    for (const body of SEARCHES) {
      const found = detect(`<html><body>${body}</body></html>`);
      expect(found.mapped).toEqual([]);
      expect(found.notes.map((item) => item.kind)).toEqual(["search"]);
      expect(found.html).not.toContain("<form");
    }
    const typed = detect(`<form action="/find"><input type="search" name="query"></form>`);
    expect(typed.mapped).toEqual([]);
    expect(typed.notes[0]?.kind).toBe("search");
    expect(typed.html).not.toContain("<form");
    const subdomain = detect(
      `<form role="search" action="https://search.club.example/"><input type="search" name="q"></form>`
    );
    expect(subdomain.mapped).toEqual([]);
    expect(subdomain.notes[0]?.kind).toBe("search");
    expect(subdomain.html).not.toContain("<form");
  });

  it("leaves a newsletter embed that posts to another site and rewires one that posts here", () => {
    const external = detect(EXTERNAL_NEWSLETTER);
    expect(external.mapped).toEqual([]);
    expect(external.notes.map((item) => item.kind)).toEqual(["external-form"]);

    const local = detect(ONSITE_NEWSLETTER, "/");
    expect(local.mapped).toEqual([
      expect.objectContaining({ formKey: "home-1", name: "Newsletter", page: "/" })
    ]);

    const apex = detect(
      `<form action="https://www.club.example/join" method="post"><input type="email" name="email"></form>`
    );
    expect(apex.mapped).toHaveLength(1);

    const subdomain = detect(
      `<h2>Join the newsletter</h2><form action="https://forms.club.example/join" method="post"><input type="email" name="email"></form>`
    );
    expect(subdomain.mapped).toEqual([
      expect.objectContaining({ formKey: "home-1", name: "Join the newsletter", page: "/" })
    ]);
    const rewritten = applyFormActions(
      subdomain.html,
      "http://localhost:3000",
      "site-1",
      subdomain.mapped
    );
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/home-1"');
    expect(rewritten).not.toContain("forms.club.example");
  });

  it("maps two forms on one page with stable keys and heading names", () => {
    const found = detect(TWO_FORMS, "/visit");
    expect(found.mapped.map((form) => [form.formKey, form.name])).toEqual([
      ["visit-quote", "Quote request"],
      ["visit-2", "RSVP"]
    ]);
    const rewritten = applyFormActions(found.html, "http://localhost:3000", "site-1", found.mapped);
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/visit-quote"');
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/visit-2"');
    expect(rewritten).toContain('name="details"');
    expect(rewritten).toContain('name="guest"');
    const again = detect(TWO_FORMS, "/visit");
    expect(again.mapped.map((form) => form.formKey)).toEqual(
      found.mapped.map((form) => form.formKey)
    );
  });

  it("uses a heading or aria-label, and skips a personal name", () => {
    const booking = detect(
      `<h2>Request a tee time</h2><form id="tee-time" action="/booking"><input type="text" name="date"><input type="email" name="email"></form>`,
      "/booking"
    );
    expect(booking.mapped[0]).toMatchObject({
      formKey: "booking-tee-time",
      name: "Request a tee time"
    });

    const labelled = detect(
      `<form aria-label="Lesson request" action="/lessons"><input type="text" name="when"></form>`,
      "/lessons"
    );
    expect(labelled.mapped[0]?.name).toBe("Lesson request");

    const person = detect(
      `<h2>Jane Smith</h2><form action="/about"><input type="email" name="email"><textarea name="message"></textarea></form>`,
      "/about"
    );
    expect(person.mapped[0]).toMatchObject({ formKey: "about-1", name: "Form on /about" });

    const namedId = detect(
      `<h2>Jane Smith</h2><form id="jane-smith" action="/about"><input type="email" name="email"></form>`,
      "/about"
    );
    expect(namedId.mapped[0]).toMatchObject({
      formKey: "about-jane-smith",
      name: "Form on /about"
    });
  });

  it("reports login, comment, checkout, file, and iframe forms instead of rewiring them", () => {
    const login = detect(
      `<form action="/login" method="post"><input type="email" name="email"><input type="password" name="password"></form>`
    );
    expect(login.mapped).toEqual([]);
    expect(login.notes[0]).toMatchObject({ page: "/", kind: "login" });
    expect(login.html).not.toContain("<form");

    const comment = detect(
      `<form id="commentform" action="/wp-comments-post.php" method="post"><input type="text" name="author"><textarea name="comment"></textarea></form>`
    );
    expect(comment.mapped).toEqual([]);
    expect(comment.notes[0]).toMatchObject({ page: "/", kind: "comments" });
    expect(comment.html).not.toContain("<form");

    const checkout = detect(
      `<form class="woocommerce-checkout" action="/checkout" method="post"><input type="email" name="billing_email"><input type="text" name="card-number"></form>`
    );
    expect(checkout.mapped).toEqual([]);
    expect(checkout.notes[0]).toMatchObject({ page: "/", kind: "checkout" });
    expect(checkout.html).not.toContain("<form");

    const cart = detect(
      `<form class="cart" action="/cart" method="post"><input type="number" name="quantity"></form>`
    );
    expect(cart.mapped).toEqual([]);
    expect(cart.notes[0]?.kind).toBe("checkout");
    expect(cart.html).not.toContain("<form");

    const payment = detect(
      `<form id="payment" action="/pay" method="post"><input type="text" name="name"></form>`
    );
    expect(payment.mapped).toEqual([]);
    expect(payment.notes[0]?.kind).toBe("checkout");
    expect(payment.html).not.toContain("<form");

    const upload = detect(
      `<form id="application" action="/apply" method="post"><h2>Application</h2><input type="text" name="applicant"><input type="file" name="resume"></form>`,
      "/apply"
    );
    expect(upload.mapped).toEqual([]);
    expect(upload.notes[0]).toMatchObject({ page: "/apply", kind: "file-upload" });
    expect(upload.html).not.toContain("<form");
    expect(upload.html).not.toContain('type="file"');

    const inquiry = detect(
      `<h2>Order inquiry</h2><form action="/order-inquiry" method="post"><input type="text" name="order"><textarea name="message"></textarea></form>`,
      "/order-inquiry"
    );
    expect(inquiry.mapped[0]).toMatchObject({ name: "Order inquiry" });

    const rsvp = detect(
      `<form action="/rsvp"><input type="checkbox" name="attending" value="yes"></form>`
    );
    expect(rsvp.mapped).toHaveLength(1);

    const iframe = detect(
      `<iframe src="https://form.typeform.com/to/abc" title="Survey"></iframe>
       <iframe src="https://www.youtube.com/embed/abc" title="Tour"></iframe>
       <iframe src="https://files.example/widget"><form action="/contact"><input type="email" name="email"></form></iframe>`
    );
    expect(iframe.mapped).toHaveLength(1);
    expect(iframe.notes.filter((item) => item.kind === "iframe-form")).toHaveLength(1);
    const rewritten = applyFormActions(
      iframe.html,
      "http://localhost:3000",
      "site-1",
      iframe.mapped
    );
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/');
    expect(rewritten).not.toContain('action="/contact"');
    expect(rewritten).toContain("form.typeform.com");
    expect(rewritten).toContain("youtube.com");
  });

  it("removes a same-site form that only has a submit button, and ignores a form written in a script", () => {
    const button = detect(`<form action="/go"><button type="submit">Go</button></form>`);
    expect(button.mapped).toEqual([]);
    expect(button.notes.map((item) => item.kind)).toEqual(["form"]);
    expect(button.html).not.toContain("<form");
    const script = detect(
      `<script>var t = '<form><input type="email" name="email"></form>';</script><p>Hi</p>`
    );
    expect(script.mapped).toEqual([]);
  });

  it("lets an importer claim a form and still maps the other form on the page", () => {
    const html = `<form class="wpcf7-form" action="/#wpcf7" method="post">
      <input type="hidden" name="_wpcf7" value="12">
      <input type="email" name="your-email">
      <textarea name="your-message"></textarea>
    </form>
    <div class="gform_wrapper"><form id="gform_1" action="/"><input type="email" name="email"></form></div>
    <h2>Book a lesson</h2>
    <form id="lesson" action="/book"><input type="text" name="date"><input type="email" name="email"></form>`;
    const found = detect(html, "/", [
      { formKey: "cf7-12", name: "Contact form 12", page: "/", marker: "wpcf7-form" },
      { formKey: "gravity-home", name: "Gravity form", page: "/", marker: "gform_wrapper" }
    ]);
    expect(found.mapped.map((form) => form.formKey)).toEqual(["home-lesson"]);
    expect(found.mapped[0]?.name).toBe("Book a lesson");
    const rewritten = applyFormActions(found.html, "http://localhost:3000", "site-1", [
      { formKey: "cf7-12", name: "Contact form 12", page: "/", marker: "wpcf7-form" },
      { formKey: "gravity-home", name: "Gravity form", page: "/", marker: "gform_wrapper" },
      ...found.mapped
    ]);
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/cf7-12"');
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/gravity-home"');
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/home-lesson"');
  });

  it("wires a same-site formaction and leaves third-party forms in place", () => {
    const posted = detect(
      `<form method="post"><input type="email" name="email"><button type="submit" formaction="/join">Join</button></form>`
    );
    expect(posted.mapped).toHaveLength(1);
    const rewritten = applyFormActions(
      posted.html,
      "http://localhost:3000",
      "site-1",
      posted.mapped
    );
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/home-1"');
    expect(rewritten).not.toContain("formaction");

    const thirdParty = `<form action="https://manage.kmail-lists.com/subscriptions/subscribe" method="post"><input type="email" name="email"></form>
<form action="https://forms.hubspot.com/uploads/form/v2/1/2" method="post"><input type="email" name="email"></form>
<form action="https://formspree.io/f/abc" method="post"><input type="email" name="email"></form>`;
    const left = detect(thirdParty);
    expect(left.mapped).toEqual([]);
    expect(left.notes.map((item) => item.kind)).toEqual([
      "external-form",
      "external-form",
      "external-form"
    ]);
    expect(left.html).toContain("kmail-lists.com");
    expect(left.html).toContain("forms.hubspot.com");
    expect(left.html).toContain("formspree.io");

    const checkoutElsewhere = detect(
      `<form action="https://checkout.stripe.com/pay" method="post"><input type="email" name="email"></form>`
    );
    expect(checkoutElsewhere.mapped).toEqual([]);
    expect(checkoutElsewhere.html).toContain("checkout.stripe.com");
    expect(checkoutElsewhere.notes[0]?.kind).toBe("external-form");
  });

  it("treats a subdomain of a .co.uk site as the same site", () => {
    const origin = new URL("https://www.example.co.uk");
    const found = detectPageForms({
      html: `<h2>Visit us</h2>
<form action="https://forms.example.co.uk/join" method="post"><input type="email" name="email"></form>
<form action="https://other.co.uk/join" method="post"><input type="email" name="email"></form>
<form action="https://example.com/join" method="post"><input type="email" name="email"></form>`,
      page: "/visit",
      origin
    });
    expect(found.mapped).toEqual([
      expect.objectContaining({ formKey: "visit-1", name: "Visit us", page: "/visit" })
    ]);
    expect(found.notes.map((item) => item.kind)).toEqual([
      "external-form",
      "external-form",
      "form"
    ]);
    expect(found.html).toContain("other.co.uk");
    expect(found.html).toContain("example.com/join");
    const rewritten = applyFormActions(found.html, "http://localhost:3000", "site-1", found.mapped);
    expect(rewritten).toContain('action="http://localhost:3000/f/site-1/visit-1"');
    expect(rewritten).not.toContain("forms.example.co.uk");
    expect(actionTargetsOrigin("https://shop.example.co.uk/book", origin)).toBe(true);
    expect(actionTargetsOrigin("/book", origin)).toBe(true);
    expect(actionTargetsOrigin("https://other.co.uk/book", origin)).toBe(false);
    expect(actionTargetsOrigin("", origin)).toBe(false);
  });
});

describe("legacy form actions", () => {
  it("reports a form action or button formaction that still resolves to the imported site", () => {
    const origin = new URL("https://www.grove.co.uk");
    const html = `<form action="https://forms.grove.co.uk/join"><input type="email" name="email"></form>
<form action="https://formspree.io/f/abc"><input type="email" name="email"></form>
<form action="https://other.co.uk/join"><button formaction="https://grove.co.uk/save">Save</button></form>
<form action="/search"><input type="search" name="q"></form>`;
    expect(legacyFormPosts(html, "index.html", origin)).toEqual([
      {
        page: "index.html",
        kind: "form-action",
        detail: 'Form action "https://forms.grove.co.uk/join" still points at the imported site.'
      },
      {
        page: "index.html",
        kind: "formaction",
        detail: 'Button formaction "https://grove.co.uk/save" still points at the imported site.'
      },
      {
        page: "index.html",
        kind: "form-action",
        detail: 'Form action "/search" still points at the imported site.'
      }
    ]);
  });
});

describe("crawl form wiring", () => {
  it("points a plain form at the form endpoint and keeps the same key on a second crawl", async () => {
    const fetchPage = async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/") return html(PLAIN);
      return { status: 404, body: new Uint8Array(), contentType: "text/html" };
    };
    const input = {
      sourceUrl: origin.origin,
      appOrigin: "http://localhost:3000",
      siteId: "site-1",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      hostIntervalMs: 0,
      concurrency: 1,
      fetchPage
    };
    const first = await crawlSite(input);
    const second = await crawlSite(input);
    expect(first.forms).toEqual(second.forms);
    expect(first.forms).toEqual([
      expect.objectContaining({ formKey: "home-1", name: "Form on /", page: "/" })
    ]);
    const page = new TextDecoder().decode(first.pages[0]?.body);
    expect(page).toContain('action="http://localhost:3000/f/site-1/home-1"');
    expect(page).toContain('method="post"');
    expect(page).toContain('name="your-email"');
    expect(page).not.toContain("onsubmit");
    expect(page).not.toContain("formaction");
    const squarespace = await crawlSite({
      ...input,
      fetchPage: async (url) => {
        if (new URL(url).pathname === "/") return html(SQUARESPACE);
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(squarespace.forms[0]).toMatchObject({ formKey: "home-1", name: "Get a quote" });
    const wix = await crawlSite({
      ...input,
      fetchPage: async (url) => {
        if (new URL(url).pathname === "/") return html(WIX);
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(wix.forms[0]).toMatchObject({ formKey: "home-comp-ks2", name: "Event signup" });
  });

  it("does not duplicate a WordPress contact form that also has fields", async () => {
    const page = `<!doctype html><html><body>
      <form class="wpcf7-form" action="/#wpcf7" method="post" onsubmit="return false">
        <input type="hidden" name="_wpcf7" value="12">
        <input type="email" name="your-email">
        <textarea name="your-message"></textarea>
      </form>
      <h2>Book a lesson</h2>
      <form id="lesson" action="/book" method="post">
        <input type="text" name="date">
        <input type="email" name="email">
      </form>
    </body></html>`;
    const result = await wordpressImporter.run({
      sourceUrl: origin.origin,
      appOrigin: "http://localhost:3000",
      siteId: "site-1",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      hostIntervalMs: 0,
      concurrency: 1,
      fetchPage: async (url) => {
        if (new URL(url).pathname === "/") return html(page);
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    } as ImportOptions);
    expect(result.forms.map((form) => form.formKey).sort()).toEqual(["cf7-12", "home-lesson"]);
    expect(result.forms.find((form) => form.formKey === "cf7-12")?.name).toBe("Contact form 12");
    expect(result.forms.find((form) => form.formKey === "home-lesson")?.name).toBe("Book a lesson");
    const stored = new TextDecoder().decode(result.pages[0]?.body);
    expect(stored.split("/f/site-1/cf7-12").length - 1).toBe(1);
    expect(stored).toContain("/f/site-1/home-lesson");
    expect(stored).toContain('name="your-email"');
    expect(stored).toContain('name="date"');
    expect(stored).not.toContain("onsubmit");
  });
});

describe("form persist", () => {
  it("keeps one lead form when the same import is stored twice", async () => {
    const crawled = await crawlSite({
      sourceUrl: origin.origin,
      appOrigin: "http://localhost:3000",
      siteId: "site-forms",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      hostIntervalMs: 0,
      concurrency: 1,
      fetchPage: async (url) => {
        if (new URL(url).pathname === "/") return html(PLAIN);
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    const again = await crawlSite({
      sourceUrl: origin.origin,
      appOrigin: "http://localhost:3000",
      siteId: "site-forms",
      caps: { maxPages: 5, maxDepth: 1, maxAssets: 5 },
      hostIntervalMs: 0,
      concurrency: 1,
      fetchPage: async (url) => {
        if (new URL(url).pathname === "/") return html(PLAIN);
        return { status: 404, body: new Uint8Array(), contentType: "text/html" };
      }
    });
    expect(again.forms).toEqual(crawled.forms);
    const client = new PGlite();
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../db/drizzle");
    for (const file of readdirSync(root)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const sqlText = readFileSync(join(root, file), "utf8");
      for (const statement of sqlText.split("--> statement-breakpoint")) {
        const query = statement.trim();
        if (query) await client.exec(query);
      }
    }
    const db = drizzle(client, { schema: fullSchema }) as unknown as Database;
    const files = new Map<string, { body: Uint8Array; contentType: string }>();
    const store = {
      async put(key: string, body: Uint8Array, contentType?: string) {
        files.set(key, { body, contentType: contentType ?? "application/octet-stream" });
      },
      async get(key: string) {
        return files.get(key) ?? null;
      },
      async list(prefix: string) {
        return [...files.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key, size: files.get(key)?.body.byteLength ?? 0 }));
      },
      async delete(key: string) {
        files.delete(key);
      },
      async copy(from: string, to: string) {
        const object = files.get(from);
        if (!object) throw new Error(`Missing ${from}`);
        files.set(to, { body: new Uint8Array(object.body), contentType: object.contentType });
      }
    };
    await db.insert(account).values({ id: "acct-forms", name: "Club", slug: "club" });
    await db.insert(site).values({
      id: "site-forms",
      accountId: "acct-forms",
      name: "Club",
      slug: "club-site",
      sourceUrl: origin.origin
    });
    await db.insert(importRun).values({
      id: "run-forms",
      siteId: "site-forms",
      sourceUrl: origin.origin,
      status: "running"
    });
    await storeImport({
      db,
      store,
      siteId: "site-forms",
      importRunId: "run-forms",
      result: crawled
    });
    await storeImport({
      db,
      store,
      siteId: "site-forms",
      importRunId: "run-forms",
      result: again
    });
    const rows = await db.select().from(leadForm).where(eq(leadForm.siteId, "site-forms"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.formKey).toBe("home-1");
    expect(rows[0]?.name).toBe("Form on /");
    await client.close();
  });
});
