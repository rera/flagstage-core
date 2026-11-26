import { describe, expect, it } from "vitest";

import { fallbackBlockExplanation } from "@flagstage/ai";

import { explainUncertainBlocks } from "./explain";
import type { ImportResult } from "./types";

const DEBUG =
  "Left the footer.site-footer block inline. It is close to /_inc/footer.html but not an exact match after normalizing the current-page marker.";
const VARIED =
  "Left the div.cookie block inline. Similar copies appear on most pages, and no copy is the same on most pages.";
const FOOTER = fallbackBlockExplanation("footer");
const COOKIE = fallbackBlockExplanation("cookie notice");

function imported(uncertain: ImportResult["report"]["uncertain"]): ImportResult {
  return {
    pages: [],
    assets: [],
    redirects: [],
    forms: [],
    report: { forms: [], plugins: [], missingAssets: [], cssBackgrounds: [], uncertain },
    stats: { pages: 2, assets: 0 }
  };
}

const settings = {
  decisionEnabled: true,
  decisionModel: { provider: "bedrock" as const, modelId: "anthropic.claude-haiku-4-5-test" }
};

describe("explain uncertain blocks", () => {
  it("stores one model sentence per block and keeps the technical detail", async () => {
    const prompts: string[] = [];
    const result = await explainUncertainBlocks(
      imported([
        { page: "jackets/index.html", kind: "drift", detail: DEBUG },
        { page: "coats/index.html", kind: "drift", detail: DEBUG },
        { page: "visit/index.html", kind: "near-duplicate", detail: VARIED }
      ]),
      {
        region: "us-east-1",
        settings,
        send: async (_region, _modelId, prompt) => {
          prompts.push(prompt);
          return JSON.stringify({
            sentences: [
              {
                id: "1",
                sentence:
                  "This page's cookie notice is a little different, so we kept it on the page."
              },
              {
                id: "2",
                sentence:
                  "This page's footer did not match the shared footer, so it stayed on the page."
              }
            ]
          });
        }
      }
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("footer");
    expect(prompts[0]).toContain("cookie notice");
    expect(prompts[0]).not.toContain("site-footer");
    expect(prompts[0]).not.toContain("/_inc");
    expect(result.report.uncertain).toEqual([
      {
        page: "jackets/index.html",
        kind: "drift",
        detail: DEBUG,
        explanation: "This page's footer did not match the shared footer, so it stayed on the page."
      },
      {
        page: "coats/index.html",
        kind: "drift",
        detail: DEBUG,
        explanation: "This page's footer did not match the shared footer, so it stayed on the page."
      },
      {
        page: "visit/index.html",
        kind: "near-duplicate",
        detail: VARIED,
        explanation: "This page's cookie notice is a little different, so we kept it on the page."
      }
    ]);
  });

  it("uses the fallback when a sentence fails the checks or the model is unavailable", async () => {
    const rejected = await explainUncertainBlocks(
      imported([{ page: "jackets/index.html", kind: "drift", detail: DEBUG }]),
      {
        region: "us-east-1",
        settings,
        send: async () =>
          JSON.stringify({
            sentences: [{ id: "1", sentence: "Left the footer.site-footer block inline." }]
          })
      }
    );
    expect(rejected.report.uncertain[0]).toMatchObject({ detail: DEBUG, explanation: FOOTER });

    const thrown = await explainUncertainBlocks(
      imported([
        { page: "jackets/index.html", kind: "drift", detail: DEBUG },
        { page: "visit/index.html", kind: "near-duplicate", detail: VARIED }
      ]),
      {
        region: "us-east-1",
        settings,
        send: async () => {
          throw new Error("bedrock down");
        }
      }
    );
    expect(thrown.report.uncertain.map((item) => item.explanation)).toEqual([FOOTER, COOKIE]);

    let called = false;
    const off = await explainUncertainBlocks(
      imported([{ page: "jackets/index.html", kind: "drift", detail: DEBUG }]),
      {
        region: "us-east-1",
        settings: { ...settings, decisionEnabled: false },
        send: async () => {
          called = true;
          return "{}";
        }
      }
    );
    expect(called).toBe(false);
    expect(off.report.uncertain[0]?.explanation).toBe(FOOTER);

    const listing = await explainUncertainBlocks(
      imported([
        {
          page: "news/index.html",
          kind: "listing",
          detail:
            "Low-confidence listing decision for news/index.html: page size 10, selector li.post."
        }
      ]),
      {
        region: "us-east-1",
        settings,
        send: async () => {
          throw new Error("should not be asked");
        }
      }
    );
    expect(listing.report.uncertain[0]?.explanation).toBeUndefined();
  });
});
