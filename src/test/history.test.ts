import { describe, expect, it } from "vitest";
import { MAX_HISTORY, newHistoryId, trimHistory, type HistoryEntry } from "@/lib/history";
import type { Analysis } from "@/lib/analysis";

const analysis: Analysis = {
  source: "local",
  summary: "",
  orientation: "landscape",
  aspect: [297, 210],
  style: "formal certificate",
  mood: [],
  palette: [],
  parts: [],
  text: [],
};

const entry = (id: string, savedAt: number): HistoryEntry => ({
  id,
  savedAt,
  fileName: `${id}.png`,
  thumb: "",
  ratio: 1.414,
  analysis,
});

describe("history", () => {
  it("orders newest first and caps the list", () => {
    const many = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => entry(`e${i}`, i));
    const out = trimHistory(many);
    expect(out).toHaveLength(MAX_HISTORY);
    expect(out[0]?.id).toBe(`e${MAX_HISTORY + 4}`);
    expect(out.at(-1)?.id).toBe("e5");
  });

  it("does not mutate its input", () => {
    const list = [entry("a", 1), entry("b", 2)];
    trimHistory(list);
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("makes distinct ids", () => {
    expect(new Set(Array.from({ length: 50 }, newHistoryId)).size).toBe(50);
  });
});
