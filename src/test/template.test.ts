import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analysis";
import {
  MAX_BATCH,
  buildTemplate,
  fill,
  parseCsv,
  readCsv,
  renderDocument,
  sampleCsv,
  tokenKey,
  tokenise,
} from "@/lib/template";

const base: Analysis = {
  source: "ai",
  summary: "",
  orientation: "landscape",
  aspect: [297, 210],
  style: "classic",
  mood: [],
  palette: [
    { name: "cream", hex: "#faf3e0", role: "background" },
    { name: "navy", hex: "#1b2a49", role: "text" },
    { name: "gold", hex: "#c9a24a", role: "border and seal" },
  ],
  parts: [
    {
      id: "border",
      name: "Outer border",
      kind: "artwork",
      position: "",
      description: "",
      prompt: "frame",
      include: true,
      confidence: "seen",
    },
    {
      id: "seal",
      name: "Gold seal",
      kind: "artwork",
      position: "",
      description: "",
      prompt: "seal",
      include: true,
      confidence: "seen",
    },
    {
      id: "corners",
      name: "Corner ornaments",
      kind: "artwork",
      position: "",
      description: "",
      prompt: "c",
      include: false,
      confidence: "seen",
    },
  ],
  text: [
    { element: "organisation", content: "[Organisation Name]", style: "small capitals" },
    { element: "title", content: "Certificate of Merit", style: "engraved capitals like Cinzel" },
    { element: "recipient", content: "[Recipient Name]", style: "flowing script" },
    { element: "body", content: "for completing [Course Name]", style: "serif" },
    { element: "footer", content: "[Date] · [Certificate ID]", style: "caption" },
  ],
};

describe("tokens", () => {
  it("normalises labels and placeholders the same way", () => {
    expect(tokenKey("Recipient Name")).toBe("recipient_name");
    expect(tokenKey("  Naïve Café! ")).toBe("naive_cafe");
    expect(tokenise("Hi [Recipient Name], see [Course]")).toBe(
      "Hi {{recipient_name}}, see {{course}}",
    );
  });

  it("escapes values and never re-expands a value that looks like a token", () => {
    expect(fill("<p>{{n}}</p>", { n: "<b>x</b> & {{n}}" })).toBe(
      "<p>&lt;b&gt;x&lt;/b&gt; &amp; {{n}}</p>",
    );
    expect(fill("{{missing}}|", {})).toBe("|");
  });
});

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines and CRLF", () => {
    const rows = parseCsv('name,course\r\n"Doe, Jane","Intro ""101""\nPart 2"\r\nAli,Math\r\n');
    expect(rows).toEqual([
      ["name", "course"],
      ["Doe, Jane", 'Intro "101"\nPart 2'],
      ["Ali", "Math"],
    ]);
  });

  it("strips a BOM, skips blank lines and detects semicolons", () => {
    expect(parseCsv(`${String.fromCharCode(0xfeff)}a;b\n1;2\n\n3;4`)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("maps headers to token keys and caps the batch", () => {
    const d = readCsv("Recipient Name,Date\nAna,1 May\n");
    expect(d.columns).toEqual(["recipient_name", "date"]);
    expect(d.rows).toEqual([{ recipient_name: "Ana", date: "1 May" }]);
    const big = readCsv(`n\n${Array.from({ length: MAX_BATCH + 10 }, (_, i) => i).join("\n")}`);
    expect(big.rows).toHaveLength(MAX_BATCH);
    expect(big.truncated).toBe(true);
  });
});

describe("buildTemplate", () => {
  it("turns placeholders into tokens and keeps reading order", () => {
    const t = buildTemplate(base);
    expect(t.tokens).toEqual([
      "organisation_name",
      "recipient_name",
      "course_name",
      "date",
      "certificate_id",
    ]);
    expect(t.page).toContain("Certificate of Merit");
  });

  it("uses the palette, honours included parts and the page size", () => {
    const t = buildTemplate(base);
    expect(t.css).toContain("background:#faf3e0");
    expect(t.css).toContain("#c9a24a");
    expect(t.page).toContain('class="frame"');
    expect(t.page).toContain('class="seal"');
    expect(t.page).not.toContain("corner");
    expect(t.mm).toEqual([297, 210]);
    expect(t.fontsHref).toContain("family=Cinzel");
    expect(buildTemplate(base, { webFonts: false }).fontsHref).toBe("");
  });

  it("always offers a recipient, date and signature, and handles portrait pages", () => {
    const t = buildTemplate({
      ...base,
      orientation: "portrait",
      aspect: [210, 297],
      text: [{ element: "title", content: "Award", style: "" }],
      parts: [],
    });
    expect(t.tokens).toEqual(["recipient_name", "date"]);
    expect(t.page).toContain("Authorised signature");
    expect(t.mm).toEqual([210, 297]);
  });

  it("escapes analysis text so a model reply can't inject markup", () => {
    const t = buildTemplate({
      ...base,
      text: [{ element: "title", content: '<img src=x onerror="alert(1)">', style: "" }],
    });
    expect(t.page).not.toContain("<img");
    expect(t.page).toContain("&lt;img");
  });
});

describe("renderDocument", () => {
  it("makes one page per row with escaped values", () => {
    const t = buildTemplate(base);
    const doc = renderDocument(t, [{ recipient_name: "Ana <b>" }, { recipient_name: "Bo" }]);
    expect(doc.match(/<section class="page">/g)).toHaveLength(2);
    expect(doc).toContain("Ana &lt;b&gt;");
    expect(doc).not.toContain("{{recipient_name}}");
  });

  it("keeps tokens visible for the blank template", () => {
    expect(renderDocument(buildTemplate(base), [null])).toContain("{{recipient_name}}");
  });
});

describe("sampleCsv", () => {
  it("has a header per token and one example row", () => {
    expect(sampleCsv(["recipient_name", "date"])).toBe(
      "recipient_name,date\nExample recipient name,Example date\n",
    );
  });
});
