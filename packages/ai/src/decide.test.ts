import { describe, expect, it } from "vitest";

import { bedrockListingDecide, parseListingDecision, type ListingSummary } from "./decide";

const SUMMARY: ListingSummary = {
  candidateSelectors: [
    { selector: "li.post", count: 10 },
    { selector: "span.bit", count: 20 }
  ],
  pageSizes: [8, 10, 12],
  urlSamples: ["/news/page/2/", "/news/page/3/"],
  sampleItemHtml: '<li class="post"><a href="/stories/1">Story</a></li>'
};

const GOOD = {
  pageSize: 10,
  itemSelector: "li.post",
  urlPattern: "/news/page/{n}/",
  order: "newest-first",
  group: "all",
  confidence: 0.8,
  reason: "Full pages disagree."
};

describe("listing decide", () => {
  it("parses a JSON object and a fenced reply", () => {
    expect(parseListingDecision(JSON.stringify(GOOD))).toEqual(GOOD);
    const fenced = parseListingDecision(
      "```json\n" + JSON.stringify({ ...GOOD, confidence: 80 }) + "\n```"
    );
    expect(fenced.confidence).toBe(0.8);
    expect(fenced.itemSelector).toBe("li.post");
  });

  it("rejects a reply that is not the decision shape", () => {
    expect(() => parseListingDecision("not json")).toThrow(/JSON/);
    expect(() => parseListingDecision(JSON.stringify({ ...GOOD, order: "sideways" }))).toThrow(
      /order/
    );
    expect(() => parseListingDecision(JSON.stringify({ ...GOOD, urlPattern: "/news/" }))).toThrow(
      /\{n\}/
    );
  });

  it("calls the injected sender and does not call AWS", async () => {
    let seen = "";
    const decide = bedrockListingDecide({
      region: "us-east-1",
      modelId: "anthropic.claude-3-haiku-test",
      send: async (region, modelId, prompt) => {
        seen = `${region} ${modelId} ${prompt}`;
        return JSON.stringify(GOOD);
      }
    });
    const decision = await decide(SUMMARY);
    expect(decision.pageSize).toBe(10);
    expect(seen).toContain("us-east-1 anthropic.claude-3-haiku-test");
    expect(seen).toContain("li.post");
    expect(seen).toContain("<untrusted>");

    let called = false;
    const missing = bedrockListingDecide({
      region: "",
      modelId: "anthropic.claude-3-haiku-test",
      send: async () => {
        called = true;
        return JSON.stringify(GOOD);
      }
    });
    await expect(missing(SUMMARY)).rejects.toThrow(/region/);
    expect(called).toBe(false);
  });
});
