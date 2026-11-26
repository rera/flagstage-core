import { describe, expect, it } from "vitest";

import { settingsTabPath } from "./site-settings-path";

describe("settingsTabPath", () => {
  it("builds a tab url and keeps the query", () => {
    expect(settingsTabPath("championships", "site-1", "people")).toBe(
      "/a/championships/sites/site-1/settings/people"
    );
    expect(
      settingsTabPath("championships", "site-1", "people", {
        dialog: "role",
        person: "sam.patel@example.com"
      })
    ).toBe(
      "/a/championships/sites/site-1/settings/people?dialog=role&person=sam.patel%40example.com"
    );
  });
});
