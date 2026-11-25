import { describe, expect, it } from "vitest";

import { installedImporters } from "./installed-importers";

describe("installed importers", () => {
  it("lists the registered public and WordPress importers", () => {
    expect(installedImporters()).toEqual([
      { id: "public", name: "Public website", detects: "Public websites" },
      { id: "wordpress", name: "WordPress", detects: "WordPress sites" }
    ]);
  });
});
