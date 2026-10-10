import { describe, expect, it } from "vitest";
import { parseAnalysis } from "@/lib/analysis";

describe("parseAnalysis", () => {
  it("skips malformed items instead of crashing", () => {
    const a = parseAnalysis(
      JSON.stringify({ parts: [null, "border", { name: "Seal", prompt: "gold seal" }], palette: [null], text: [7] }),
      "pasted",
    );
    expect(a.parts).toHaveLength(1);
    expect(a.palette).toHaveLength(0);
    expect(a.text).toHaveLength(0);
  });

  it("numbers duplicate part ids sequentially", () => {
    const a = parseAnalysis(
      JSON.stringify({ parts: [1, 2, 3].map(() => ({ id: "border", name: "Border", prompt: "frame" })) }),
      "ai",
    );
    expect(a.parts.map((p) => p.id)).toEqual(["border", "border-2", "border-3"]);
  });
});
