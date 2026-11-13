import { describe, expect, it } from "vitest";

import { parseSiteMemory, serializeSiteMemory } from "./account-cookie";

describe("site memory cookie", () => {
  it("keeps one site per account and drops junk", () => {
    const memory = parseSiteMemory("harbor:site-1,north:site-2,../x:nope,only");
    expect(memory.get("harbor")).toBe("site-1");
    expect(memory.get("north")).toBe("site-2");
    expect(memory.size).toBe(2);
    memory.set("harbor", "site-3");
    expect(serializeSiteMemory(memory)).toBe("harbor:site-3,north:site-2");
  });
});
