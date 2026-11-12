import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FsBlobStore } from "./fs-store";
import { resolveRequestPath } from "./resolve";

describe("resolveRequestPath", () => {
  const prefix = "snapshots/site/snap/";

  it("maps a directory to index.html and rejects traversal", () => {
    const home = resolveRequestPath(prefix, "/");
    const about = resolveRequestPath(prefix, "/about");
    const logo = resolveRequestPath(prefix, "/assets/logo.png");
    expect(home.ok && home.key).toBe(`${prefix}index.html`);
    expect(about.ok && about.key).toBe(`${prefix}about/index.html`);
    expect(logo.ok && logo.key).toBe(`${prefix}assets/logo.png`);
    expect(resolveRequestPath(prefix, "/../secret").ok).toBe(false);
    expect(resolveRequestPath(prefix, "/a\\b").ok).toBe(false);
  });
});

describe("FsBlobStore", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("round-trips an object", async () => {
    dir = await mkdtemp(join(tmpdir(), "fs-store-"));
    const store = new FsBlobStore(dir);
    await store.put("snapshots/a/index.html", new TextEncoder().encode("<h1>Hi</h1>"));
    const got = await store.get("snapshots/a/index.html");
    expect(new TextDecoder().decode(got?.body)).toBe("<h1>Hi</h1>");
    expect(got?.contentType).toContain("text/html");
    const listed = await store.list("snapshots/");
    expect(listed).toHaveLength(1);
  });
});
