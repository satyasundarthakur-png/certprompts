/** The structured description every analysis engine produces. */
export interface Swatch {
  name: string;
  hex: string;
  role: string;
}

export interface Part {
  id: string;
  name: string;
  kind: "artwork" | "text";
  position: string;
  description: string;
  prompt: string; // a self-contained prompt fragment for this component
  include: boolean;
  confidence: "seen" | "assumed";
}

export interface TextBlock {
  element: string;
  content: string;
  style: string;
}

export interface Analysis {
  source: "ai" | "local" | "pasted";
  summary: string;
  orientation: "landscape" | "portrait";
  aspect: [number, number];
  style: string;
  mood: string[];
  palette: Swatch[];
  parts: Part[];
  text: TextBlock[];
}

/** Instruction sent to vision models (and shown for copy/paste into any chatbot). */
export const INSTRUCTION = `You are a senior print designer. Study the attached certificate and describe its DESIGN so that an AI image generator can recreate the same look.

Rules:
- Describe every visible component separately: background/paper texture, borders/frames, corner ornaments, guilloche or line patterns, watermark, header emblem/logo area, title lettering, ribbons/banners, recipient-name area, body text block, signature lines, seal/rosette/medal, footer elements, any photos or illustrations.
- For each component give: position on the page, shape, colours (with hex), material/finish (flat ink, gold foil, embossed, gradient…), line weights, and an image-generator prompt fragment that would reproduce just that component.
- Logos, seals, emblems and signatures: describe their SHAPE and STYLE only (e.g. "circular gold rosette seal with a star"), never the exact insignia, wording inside them, or a signature's letterforms.
- Text: transcribe headings and generic wording, but replace personal names, organisation names, registration/ID numbers and dates with placeholders like [Recipient Name], [Organisation Name], [Certificate ID], [Date].
- Fonts: name the closest common typefaces (e.g. "Great Vibes", "Playfair Display", "Cinzel", "Montserrat").

Reply with JSON only, exactly in this shape:
{
  "summary": "one-paragraph overall description",
  "orientation": "landscape" | "portrait",
  "aspect": [width, height],
  "style": "e.g. classic Victorian, modern minimal, academic, corporate",
  "mood": ["formal", "luxurious"],
  "palette": [{"name": "antique gold", "hex": "#c9a24a", "role": "border and seal"}],
  "parts": [{"id": "border", "name": "Outer border", "kind": "artwork", "position": "around all four edges, ~3% inset", "description": "…", "prompt": "…"}],
  "text": [{"element": "title", "content": "Certificate of Achievement", "style": "engraved serif capitals, gold foil"}]
}`;

const s = (v: unknown, d = "") => (typeof v === "string" ? v.trim() : d);

function slug(t: string) {
  return t["toLowerCase"]().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "part";
}

/** Pull the JSON object out of a model reply (tolerates code fences and chatter) and normalise it. */
export function parseAnalysis(raw: string, source: Analysis["source"]): Analysis {
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) txt = fence[1];
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON found in the reply.");
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(txt.slice(start, end + 1));
  } catch {
    throw new Error("The reply wasn't valid JSON. Ask the chatbot to reply with JSON only and try again.");
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const aspect = arr(obj["aspect"]).map(Number).filter((n) => n > 0);
  const orientation = s(obj["orientation"]) === "portrait" ? "portrait" : "landscape";
  const seen = new Set<string>();
  const parts: Part[] = arr(obj["parts"])
    .map((p: Record<string, unknown>) => {
      const name = s(p["name"], "Component");
      let id = slug(s(p["id"]) || name);
      while (seen.has(id)) id += "-2";
      seen.add(id);
      return {
        id,
        name,
        kind: (s(p["kind"]) === "text" ? "text" : "artwork") as Part["kind"],
        position: s(p["position"]),
        description: s(p["description"]),
        prompt: s(p["prompt"]) || s(p["description"]),
        include: true,
        confidence: "seen" as const,
      };
    })
    .filter((p) => p.prompt);
  return {
    source,
    summary: s(obj["summary"]),
    orientation,
    aspect: aspect.length === 2 ? [aspect[0] ?? 297, aspect[1] ?? 210] : orientation === "portrait" ? [210, 297] : [297, 210],
    style: s(obj["style"], "formal certificate"),
    mood: arr(obj["mood"]).map((m) => s(m)).filter(Boolean).slice(0, 6),
    palette: arr(obj["palette"])
      .map((p: Record<string, unknown>) => ({ name: s(p["name"], "colour"), hex: /^#[0-9a-f]{6}$/i.test(s(p["hex"])) ? s(p["hex"]).toLowerCase() : "#888888", role: s(p["role"]) }))
      .slice(0, 8),
    parts,
    text: arr(obj["text"])
      .map((t: Record<string, unknown>) => ({ element: s(t["element"], "text"), content: s(t["content"]), style: s(t["style"]) }))
      .filter((t) => t.content),
  };
}
