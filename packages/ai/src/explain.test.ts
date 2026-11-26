import { describe, expect, it } from "vitest";

import {
  bedrockExplainBlocks,
  blockExplanationPrompt,
  blockSituation,
  fallbackBlockExplanation,
  isCustomerSentence,
  parseBlockExplanations,
  plainSectionName,
  sectionFromBlockDetail,
  type BlockBrief
} from "./explain";

const FOOTER =
  "This page's footer is a little different from the shared one, so we kept it on the page.";

const BRIEFS: BlockBrief[] = [
  { id: "1", section: "footer", situation: "close" },
  { id: "2", section: "navigation", situation: "varied" }
];

function reply(sentences: Array<{ id: string; sentence: string }>): string {
  return JSON.stringify({ sentences });
}

describe("block explanation parsing", () => {
  it("reads a JSON object and a fenced reply", () => {
    const sentences = [
      { id: "1", sentence: FOOTER },
      {
        id: "2",
        sentence: "The navigation on this page did not match the others, so it stayed on the page."
      }
    ];
    expect(parseBlockExplanations(reply(sentences))).toEqual(
      new Map(sentences.map((item) => [item.id, item.sentence]))
    );
    const fenced = parseBlockExplanations("```json\n" + reply(sentences) + "\n```");
    expect(fenced.get("1")).toBe(FOOTER);
  });

  it("drops a sentence that is not one plain sentence and keeps the rest", () => {
    const parsed = parseBlockExplanations(
      reply([
        { id: "1", sentence: FOOTER },
        { id: "2", sentence: "Left the footer.site-footer block inline." },
        { id: "3", sentence: "We kept the header. It was different." },
        { id: "4", sentence: `${"Very long ".repeat(20)}page.` },
        { id: "5", sentence: "Did we keep this page's header?" },
        { id: "6", sentence: "See /_inc/footer.html on this page." },
        { id: "7", sentence: "The <footer> stayed on the page." },
        { id: "8", sentence: "Look at `footer` on the page." }
      ])
    );
    expect([...parsed.keys()]).toEqual(["1"]);
    expect(parsed.get("1")).toBe(FOOTER);
  });

  it("rejects a reply that is not JSON", () => {
    expect(() => parseBlockExplanations("not json")).toThrow(/JSON/);
    expect(() => parseBlockExplanations(JSON.stringify({ sentences: "nope" }))).toThrow(/list/);
  });

  it("rejects code-like tokens and jargon", () => {
    expect(isCustomerSentence(FOOTER)).toBe(true);
    expect(isCustomerSentence("Left the footer.site-footer block inline.")).toBe(false);
    expect(
      isCustomerSentence(
        "Left the footer.site-footer block inline. It is close to /_inc/footer.html but not an exact match after normalizing the current-page marker."
      )
    ).toBe(false);
    expect(isCustomerSentence("We kept #site-footer on the page.")).toBe(false);
    expect(isCustomerSentence("The footer stayed inline on the page.")).toBe(false);
    expect(isCustomerSentence("Ok.")).toBe(false);
    expect(isCustomerSentence("We kept it.")).toBe(false);
  });
});

describe("block explanation fallback", () => {
  it("names a plain section and defaults to section", () => {
    expect(plainSectionName("footer.site-footer")).toBe("footer");
    expect(plainSectionName("header.site-header/nav.site-nav")).toBe("navigation");
    expect(plainSectionName("aside.sidebar")).toBe("sidebar");
    expect(plainSectionName("div.cookie")).toBe("cookie notice");
    expect(plainSectionName("div.widget")).toBe("section");
    expect(sectionFromBlockDetail("Left the footer.site-footer block inline. It is close.")).toBe(
      "footer"
    );
    expect(
      blockSituation(
        "Left the footer.site-footer block inline. It is close to /_inc/footer.html but not an exact match."
      )
    ).toBe("close");
    expect(
      blockSituation(
        "Left the div.cookie block inline. Similar copies appear on most pages, and no copy is the same on most pages."
      )
    ).toBe("varied");
    expect(sectionFromBlockDetail("Listing page was not covered.")).toBeNull();
    expect(fallbackBlockExplanation("footer")).toBe(FOOTER);
    expect(fallbackBlockExplanation("header")).toBe(
      "This page's header is a little different from the shared one, so we kept it on the page."
    );
    expect(fallbackBlockExplanation("sidebar")).toBe(
      "This page's sidebar is a little different from the shared one, so we kept it on the page."
    );
    expect(fallbackBlockExplanation("navigation")).toBe(
      "This page's navigation is a little different from the shared one, so we kept it on the page."
    );
    expect(fallbackBlockExplanation("not-a-section")).toBe(
      "This page's section is a little different from the shared one, so we kept it on the page."
    );
    expect(fallbackBlockExplanation("section")).toBe(
      "This page's section is a little different from the shared one, so we kept it on the page."
    );
  });
});

describe("block explanation prompt", () => {
  it("asks once, with plain section names and no paths", () => {
    const prompt = blockExplanationPrompt(BRIEFS);
    expect(prompt).toContain("1. The footer is close to the shared one");
    expect(prompt).toContain("2. Similar navigation blocks appear on most pages");
    expect(prompt).not.toContain(".html");
    expect(prompt).not.toContain("/_inc");
    expect(prompt).not.toContain("site-footer");
    expect(prompt.match(/\{"sentences"/g)).toHaveLength(1);
  });

  it("calls the settings model once and ignores an env model id", async () => {
    const previous = process.env.LISTING_MODEL_ID;
    process.env.LISTING_MODEL_ID = "env-should-not-win";
    try {
      const seen: string[] = [];
      const explain = bedrockExplainBlocks({
        region: "us-east-1",
        settings: {
          decisionEnabled: true,
          decisionModel: { provider: "bedrock", modelId: "anthropic.claude-haiku-4-5-test" }
        },
        send: async (region, modelId, prompt) => {
          seen.push(`${region} ${modelId} ${prompt}`);
          return reply([{ id: "1", sentence: FOOTER }]);
        }
      });
      const written = await explain(BRIEFS);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toContain("us-east-1 anthropic.claude-haiku-4-5-test");
      expect(seen[0]).not.toContain("env-should-not-win");
      expect(written.get("1")).toBe(FOOTER);
      expect(written.has("2")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.LISTING_MODEL_ID;
      else process.env.LISTING_MODEL_ID = previous;
    }
  });

  it("does not call the model when it is off or the region is missing", async () => {
    let called = false;
    const send = async () => {
      called = true;
      return reply([{ id: "1", sentence: FOOTER }]);
    };
    const off = bedrockExplainBlocks({
      region: "us-east-1",
      settings: {
        decisionEnabled: false,
        decisionModel: { provider: "bedrock", modelId: "stored-model" }
      },
      send
    });
    await expect(off(BRIEFS)).resolves.toEqual(new Map());
    const missing = bedrockExplainBlocks({
      region: "",
      settings: {
        decisionEnabled: true,
        decisionModel: { provider: "bedrock", modelId: "stored-model" }
      },
      send
    });
    await expect(missing(BRIEFS)).resolves.toEqual(new Map());
    expect(called).toBe(false);
  });
});
