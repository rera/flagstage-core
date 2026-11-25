import { describe, expect, it } from "vitest";

import {
  PUBLIC_IMPORTER_ID,
  WORDPRESS_IMPORTER_ID,
  getImporter,
  listImporters,
  publicImporter,
  registerImporter
} from "./index";

describe("importer registry", () => {
  it("registers the public crawler and the WordPress importer", async () => {
    expect(getImporter(PUBLIC_IMPORTER_ID)).toBe(publicImporter);
    expect(publicImporter.id).toBe("public");
    expect(publicImporter.label).toBe("Public website");
    expect(await publicImporter.detect("https://example.com", async () => null)).toBeNull();
    expect(getImporter(WORDPRESS_IMPORTER_ID).label).toBe("WordPress");
    expect(listImporters()).toEqual(expect.arrayContaining(["public", "wordpress"]));
  });

  it("replaces a source when the same id is registered again", () => {
    const first = {
      id: "acme",
      label: "Acme",
      detect() {
        return null;
      },
      run: async () => {
        throw new Error("first");
      }
    };
    const second = {
      id: "acme",
      label: "Acme again",
      detect() {
        return null;
      },
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

  it("rejects a blank id, a blank label, and an unknown source", () => {
    expect(() =>
      registerImporter({
        id: " ",
        label: "Blank",
        detect() {
          return null;
        },
        run: async () => {
          throw new Error("unused");
        }
      })
    ).toThrow(/id/);
    expect(() =>
      registerImporter({
        id: "labeled",
        label: " ",
        detect() {
          return null;
        },
        run: async () => {
          throw new Error("unused");
        }
      })
    ).toThrow(/label/);
    expect(() => getImporter("no-such-source")).toThrow(/no-such-source/);
  });
});
