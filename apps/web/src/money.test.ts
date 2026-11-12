import { describe, expect, it } from "vitest";

import { formatUsd } from "./money";

describe("formatUsd", () => {
  it("shows cents, and a less-than mark under one cent", () => {
    expect(formatUsd(0)).toEqual({ text: "$0.00", title: "$0.000000" });
    expect(formatUsd(0.000006405)).toEqual({ text: "<$0.01", title: "$0.000006" });
    expect(formatUsd(0.004)).toEqual({ text: "<$0.01", title: "$0.004000" });
    expect(formatUsd(0.005)).toEqual({ text: "$0.01", title: "$0.005000" });
    expect(formatUsd(0.01)).toEqual({ text: "$0.01", title: "$0.010000" });
    expect(formatUsd(12.5)).toEqual({ text: "$12.50", title: "$12.500000" });
  });
});
