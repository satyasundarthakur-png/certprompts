import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { parseAnalysis, type Analysis } from "@/lib/analysis";
import { readGeminiText, post, REQUEST_TIMEOUT_MS } from "@/lib/ai";
import { buildPrompts, partPrompt } from "@/lib/prompts";
import { buildTemplate } from "@/lib/template";
import { analyseReference } from "@/lib/reference";

const base: Analysis = {
  source: "ai",
  summary: "",
  orientation: "landscape",
  aspect: [297, 210],
  style: "classic",
  mood: [],
  palette: [
    { name: "gold", hex: "#c9a24a", role: "border" },
    { name: "cream", hex: "#faf3e0", role: "background" },
  ],
  parts: [
    {
      id: "border",
      name: "Border",
      kind: "artwork",
      position: "",
      description: "",
      prompt: "gold frame",
      include: true,
      confidence: "seen",
    },
    {
      id: "title",
      name: "Title",
      kind: "text",
      position: "",
      description: "",
      prompt: "Certificate of Merit",
      include: true,
      confidence: "seen",
    },
  ],
  text: [],
};

const prompt = (
  a: Analysis,
  tool: string,
  o = { withText: false, reference: false, changes: "" },
) => buildPrompts(a, o).find((p) => p.tool === tool)!.prompt;

describe("Midjourney --no list", () => {
  it("keeps the text negatives when the design should have no wording", () => {
    const mj = prompt(base, "midjourney");
    const no = mj.split("--no ")[1] ?? "";
    expect(no).toMatch(/\btext\b/);
    expect(no).toMatch(/\bletters\b/);
  });

  it("keeps the misspelling negatives when the wording is in the image", () => {
    const no =
      prompt(base, "midjourney", { withText: true, reference: false, changes: "" }).split(
        "--no ",
      )[1] ?? "";
    expect(no).toMatch(/misspelled text/);
  });
});

describe("aspect ratios", () => {
  const ar = (aspect: [number, number]) =>
    /--ar (\d+:\d+)/.exec(prompt({ ...base, aspect }, "midjourney"))?.[1];

  it("keeps A4 exact", () => expect(ar([297, 210])).toBe("99:70"));
  it("does not distort US Letter (11 x 8.5)", () => expect(ar([11, 8.5])).toBe("22:17"));
  it("does not collapse a decimal ratio to 1:1", () => expect(ar([1.414, 1])).toBe("141:100"));

  it("draws the SVG on a canvas whose shape matches the page whatever unit the aspect is in", () => {
    const vb = (aspect: [number, number]) =>
      /viewBox="0 0 (\d+) (\d+)"/.exec(prompt({ ...base, aspect }, "code"));
    for (const aspect of [
      [297, 210],
      [11, 8.5],
      [1.414, 1],
      [210, 297],
    ] as [number, number][]) {
      const m = vb(aspect)!;
      expect(Number(m[1]) / Number(m[2])).toBeCloseTo(aspect[0] / aspect[1], 1);
      expect(Math.max(Number(m[1]), Number(m[2]))).toBeGreaterThan(500);
    }
  });
});

describe("stand-alone text prompt background", () => {
  it("uses the swatch whose role is background, not just the first swatch", () => {
    expect(partPrompt(base, base.parts[1]!)).toContain("plain cream background");
  });
});

describe("parseAnalysis aspect", () => {
  it("ignores non-finite numbers instead of building a broken page size", () => {
    const a = parseAnalysis(
      JSON.stringify({ aspect: ["Infinity", 1], parts: [{ name: "x", prompt: "p" }] }),
      "ai",
    );
    expect(a.aspect).toEqual([297, 210]);
  });
});

describe("Gemini replies", () => {
  it("returns the text parts", () => {
    expect(
      readGeminiText({ candidates: [{ content: { parts: [{ text: "{" }, { text: "}" }] } }] }),
    ).toBe("{}");
  });
  it("explains a blocked reply instead of 'No JSON found'", () => {
    expect(() => readGeminiText({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(
      /declined.*SAFETY/i,
    );
  });
  it("explains an empty reply", () => {
    expect(() => readGeminiText({ candidates: [] })).toThrow(/empty reply/i);
  });
});

describe("request timeout", () => {
  it("turns a timeout into a readable message", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.reject(new DOMException("signal timed out", "TimeoutError")),
    );
    await expect(post("https://example.test", {}, "Gemini")).rejects.toThrow(
      new RegExp(`Gemini didn't answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`),
    );
    vi.unstubAllGlobals();
  });

  it("passes other network errors through untouched", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(post("https://example.test", {}, "Gemini")).rejects.toThrow("Failed to fetch");
    vi.unstubAllGlobals();
  });
});

describe("DOCX text boxes", () => {
  it("reads boxed wording once, not once per nesting level and Word fallback copy", async () => {
    const W =
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"';
    const box = `<w:txbxContent><w:p><w:r><w:t>Boxed wording for the recipient</w:t></w:r></w:p></w:txbxContent>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>
      <w:p><w:r><w:t>Certificate of Merit</w:t></w:r></w:p>
      <w:p><w:r><mc:AlternateContent>
        <mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx>${box}</wps:txbx></wps:wsp></w:drawing></mc:Choice>
        <mc:Fallback><w:pict><v:shape><v:textbox>${box}</v:textbox></v:shape></w:pict></mc:Fallback>
      </mc:AlternateContent></w:r></w:p>
    </w:body></w:document>`;
    const zip = new JSZip();
    zip.file("word/document.xml", xml);
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([buf], "boxed.docx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => buf }); // older jsdom has no Blob.arrayBuffer

    const r = await analyseReference(file);
    expect(r.text.lines).toEqual(["Certificate of Merit", "Boxed wording for the recipient"]);
  });
});

describe("template page shape", () => {
  it("keeps a sane page size even for an absurd aspect", () => {
    for (const aspect of [
      [Number.POSITIVE_INFINITY, 1],
      [1, 0],
      [Number.NaN, 5],
      [1000, 1],
    ] as [number, number][]) {
      const [w, h] = buildTemplate({ ...base, aspect }).mm;
      expect(Number.isFinite(w) && Number.isFinite(h)).toBe(true);
      expect(Math.min(w, h)).toBeGreaterThan(50);
    }
  });
});
