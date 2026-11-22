import { describe, expect, it } from "vitest";

import {
  PUBLIC_SITE_SOURCE,
  getImporter,
  listImporters,
  publicSiteImporter,
  registerImporter
} from "./index";

describe("importer registry", () => {
  it("registers the public-site crawler", () => {
    expect(getImporter(PUBLIC_SITE_SOURCE)).toBe(publicSiteImporter);
    expect(publicSiteImporter.name).toBe("public-site");
    expect(listImporters()).toContain("public-site");
  });

  it("replaces a source when the same name is registered again", () => {
    const first = {
      name: "acme",
      run: async () => {
        throw new Error("first");
      }
    };
    const second = {
      name: "acme",
      run: async () => {
        throw new Error("second");
      }
    };
    registerImporter(first);
    expect(getImporter("acme")).toBe(first);
    registerImporter(second);
    expect(getImporter("acme")).toBe(second);
    expect(listImporters()).toContain("acme");
  });

  it("rejects a blank name and an unknown source", () => {
    expect(() =>
      registerImporter({
        name: " ",
        run: async () => {
          throw new Error("unused");
        }
      })
    ).toThrow(/name/);
    expect(() => getImporter("no-such-source")).toThrow(/no-such-source/);
  });
});
