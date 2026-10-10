import type { Analysis, Part } from "./analysis";

export type Tool = "midjourney" | "chatgpt" | "sd" | "ideogram" | "flux" | "gemini" | "code";

export interface ToolPrompt {
  tool: Tool;
  label: string;
  prompt: string;
  negative?: string;
  settings: string[];
}

export const TOOLS: { id: Tool; label: string; note: string }[] = [
  { id: "midjourney", label: "Midjourney", note: "Paste into /imagine or the web prompt box." },
  { id: "chatgpt", label: "ChatGPT / DALL·E", note: "Paste into ChatGPT (image generation) or the OpenAI images tool." },
  { id: "sd", label: "Stable Diffusion", note: "SDXL / SD3 in Automatic1111, ComfyUI, Fooocus or DreamStudio." },
  { id: "ideogram", label: "Ideogram", note: "Best choice when the wording must appear in the image." },
  { id: "flux", label: "Flux", note: "Flux 1.x / Pro — good with long natural-language prompts." },
  { id: "gemini", label: "Gemini / Imagen", note: "Paste into Gemini image generation or Imagen." },
  { id: "code", label: "Claude / code (SVG)", note: "Paste into Claude or ChatGPT to rebuild it as an editable SVG/HTML page — sharpest text and lines." },
];

export interface BuildOptions {
  withText: boolean;
  reference: boolean; // the user will attach the original (or blank template) image
  changes: string; // what should differ from the original
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function nearestRatio([w, h]: [number, number]) {
  const r = w / h;
  const opts: [string, number][] = [["1:1", 1], ["4:3", 4 / 3], ["3:2", 1.5], ["16:9", 16 / 9], ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16]];
  return opts.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

function mjRatio([w, h]: [number, number]) {
  const a = Math.round(w), b = Math.round(h);
  const g = gcd(a, b) || 1;
  return `${a / g}:${b / g}`;
}

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
};

function textOnlyPrompts(a: Analysis, o: BuildOptions): ToolPrompt[] {
  const art = a.parts.filter((p) => p.include && p.kind === "artwork");
  const txt = a.parts.filter((p) => p.include && p.kind === "text");
  const ratio = nearestRatio(a.aspect);
  const orient = a.orientation;
  const paletteNames = a.palette.map((p) => p.name).join(", ");
  const paletteHex = a.palette.map((p) => `${p.name} ${p.hex}${p.role ? ` for ${p.role}` : ""}`).join("; ");
  const style = [a.style, ...a.mood].filter(Boolean).join(", ");
  const base = `${orient} award certificate design, flat front-facing full-page view, straight edges, print-ready`;
  const noText = "blank certificate template, no text, no letters, no words, empty centre area left for text to be added later";
  const negCommon = "photo mockup, perspective, table, hands, frame on wall, shadows of objects, watermark, blurry, low resolution, jpeg artifacts, cropped edges";
  const neg = o.withText ? `${negCommon}, misspelled text, garbled letters` : `${negCommon}, text, letters, words, typography, signature`;

  const tags = (parts: Part[]) => parts.map((p) => p.prompt.replace(/\.$/, "")).join(", ");
  const textTags = txt.map((p) => p.prompt).join(", ");
  const layout = (parts: Part[]) =>
    parts.map((p) => sentence(`${p.position ? p.position + ": " : ""}${p.prompt}`)).join(" ");

  const out: ToolPrompt[] = [];

  // Midjourney — compact, comma-separated, parameters at the end
  out.push({
    tool: "midjourney",
    label: "Midjourney",
    prompt: `${base}, ${tags(art)}${o.withText ? `, ${textTags}` : `, ${noText}`}, colour palette ${paletteNames}, ${style}, crisp vector-like print design, symmetrical, highly detailed --ar ${mjRatio(a.aspect)} --style raw --no ${neg.split(", ").slice(0, 8).join(", ")}`,
    settings: ["Use the latest model version.", "Add --stylize 50–150 for a more faithful, less artistic result.", "Upscale, then add exact wording in the Certificate Maker if letters come out wrong."],
  });

  // ChatGPT / DALL·E — structured natural language
  out.push({
    tool: "chatgpt",
    label: "ChatGPT / DALL·E",
    prompt: [
      `Create a ${orient} certificate design (${ratio} aspect ratio), shown flat and front-facing, filling the entire image — not a mockup or photo.`,
      a.summary ? sentence(a.summary) : "",
      `Style: ${style}.`,
      `Colour palette: ${paletteHex}.`,
      `Layout, component by component: ${layout(art)}`,
      o.withText ? `Text (spell exactly): ${txt.map((p) => sentence(`${p.position ? p.position + " — " : ""}${p.prompt}`)).join(" ")}` : `Leave all text areas empty: ${noText}.`,
      "Keep the design symmetrical, sharp and print-quality.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    settings: [`Ask for a ${orient} image (e.g. 1536×1024).`, "If it adds a desk or frame, reply: “flat design only, no mockup”."],
  });

  // Stable Diffusion — tag style + negative prompt
  out.push({
    tool: "sd",
    label: "Stable Diffusion",
    prompt: `(${base}:1.2), ${tags(art)}${o.withText ? `, ${textTags}` : `, ${noText}`}, ${paletteNames} colour scheme, ${style}, ornate engraving detail, vector illustration, high detail, sharp lines, 8k`,
    negative: `${neg}, deformed ornaments, asymmetrical, extra borders, oversaturated`,
    settings: [
      orient === "landscape" ? "Size: 1456×1024 (SDXL) or 1216×832" : "Size: 1024×1456 (SDXL) or 832×1216",
      "Steps 30–40 · CFG 6–7 · Sampler DPM++ 2M Karras",
      "For the seal/emblem, generate separately (see component prompts) and composite.",
    ],
  });

  // Ideogram — strong at typography
  out.push({
    tool: "ideogram",
    label: "Ideogram",
    prompt: [
      `A ${orient} ${a.style || "formal"} certificate, flat graphic design filling the frame.`,
      sentence(layout(art)),
      o.withText ? `Typography: ${txt.map((p) => sentence(p.prompt)).join(" ")}` : sentence(noText),
      `Palette: ${paletteHex}.`,
      `Mood: ${style}.`,
    ]
      .filter(Boolean)
      .join(" "),
    settings: [`Aspect ratio ${ratio}`, "Style: Design", "Magic Prompt: Off (keeps your wording exact)"],
  });

  // Flux — long natural-language description
  out.push({
    tool: "flux",
    label: "Flux",
    prompt: [
      `A flat, front-facing ${orient} certificate design that fills the whole image, ${style}.`,
      a.summary ? sentence(a.summary) : "",
      layout(art),
      o.withText ? txt.map((p) => sentence(p.prompt)).join(" ") : sentence(noText),
      `Colours: ${paletteHex}.`,
      "Crisp print-quality detail, perfectly symmetrical.",
    ]
      .filter(Boolean)
      .join(" "),
    settings: [`Aspect ratio ${ratio}`, "Guidance 3–3.5", "Steps 28–40 (dev) or default (pro)"],
  });

  // Gemini / Imagen
  out.push({
    tool: "gemini",
    label: "Gemini / Imagen",
    prompt: [
      `Generate a ${orient} certificate design in ${ratio} format, shown flat and front-on with no background scene.`,
      a.summary ? sentence(a.summary) : "",
      `Components: ${layout(art)}`,
      o.withText ? `Wording: ${txt.map((p) => sentence(p.prompt)).join(" ")}` : sentence(noText),
      `Use this palette: ${paletteHex}. Style: ${style}.`,
    ]
      .filter(Boolean)
      .join("\n"),
    settings: [`Aspect ratio ${ratio}`, "Ask for edits in follow-up messages (e.g. “make the border thinner”)."],
  });

  return out;
}

/** Prompt for generating just one component as a separate asset. */
export function partPrompt(a: Analysis, p: Part) {
  const pal = a.palette.map((s) => `${s.name} ${s.hex}`).join(", ");
  if (p.kind === "text") return `${p.prompt}, centred on a plain ${a.palette[0]?.name ?? "white"} background, typography only, crisp and legible`;
  return `${p.prompt}, isolated single design element on a plain white background, flat front view, ${a.style}, palette ${pal}, high detail, print quality, no text`;
}

export function exportText(a: Analysis, prompts: ToolPrompt[]) {
  const lines: string[] = [];
  lines.push("CERTIFICATE DESIGN BREAKDOWN", "", a.summary, "", `Style: ${a.style} | Mood: ${a.mood.join(", ")} | ${a.orientation} ${a.aspect.join(":")}`, "");
  lines.push("PALETTE", ...a.palette.map((p) => `- ${p.name} ${p.hex} — ${p.role}`), "");
  lines.push("COMPONENTS");
  a.parts.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.name} [${p.kind}${p.confidence === "assumed" ? ", assumed" : ""}]${p.include ? "" : " (excluded)"}`);
    if (p.position) lines.push(`   Position: ${p.position}`);
    if (p.description) lines.push(`   Description: ${p.description}`);
    lines.push(`   Prompt: ${p.prompt}`, `   Stand-alone: ${partPrompt(a, p)}`, "");
  });
  for (const t of prompts) {
    lines.push(`=== ${t.label} ===`, t.prompt);
    if (t.negative) lines.push("", `Negative prompt: ${t.negative}`);
    lines.push("", ...t.settings.map((s) => `• ${s}`), "");
  }
  return lines.join("\n");
}

function codePrompt(a: Analysis, o: BuildOptions): ToolPrompt {
  const parts = a.parts.filter((p) => p.include);
  const [w, h] = a.aspect;
  return {
    tool: "code",
    label: "Claude / code (SVG)",
    prompt: [
      o.reference
        ? "I've attached a certificate. Rebuild it as a single self-contained SVG that matches the attached design as closely as possible — same layout, proportions, border, ornaments, colours and type styles."
        : "Build a certificate design as a single self-contained SVG.",
      `Canvas: viewBox="0 0 ${w * 4} ${h * 4}" (${a.orientation}). Use only vector shapes and <text>; fonts from Google Fonts via @import are fine.`,
      a.summary ? `Overall: ${a.summary}` : "",
      `Palette: ${a.palette.map((p) => `${p.hex} (${p.name}${p.role ? ", " + p.role : ""})`).join(", ")}.`,
      "Components:",
      ...parts.map((p, i) => `${i + 1}. ${p.name}${p.position ? ` — ${p.position}` : ""}: ${p.prompt}`),
      o.changes.trim() ? `Changes from the original: ${o.changes.trim()}` : "",
      "Keep every text element as real <text> with clear ids (title, recipient, body, date, sig1, sig2) so the wording can be edited later. Return only the SVG code.",
    ]
      .filter(Boolean)
      .join("\n"),
    settings: ["Save the reply as certificate.svg and open it in a browser; print to PDF or convert to PNG.", "Ask for refinements: “make the corner ornaments more detailed”, “thinner inner border”."],
  };
}

function referencePrompts(a: Analysis, o: BuildOptions): ToolPrompt[] {
  const ratio = nearestRatio(a.aspect);
  const palette = a.palette.map((p) => `${p.name} ${p.hex}`).join(", ");
  const keep = a.parts.filter((p) => p.include && p.kind === "artwork").map((p) => p.name.toLowerCase()).join(", ");
  const change = o.changes.trim();
  const changeLine = change ? `Change only this: ${change}.` : "Keep everything else the same.";
  const text = a.parts.filter((p) => p.include && p.kind === "text");
  const wording = o.withText && text.length ? `Wording to use: ${text.map((p) => p.prompt).join("; ")}.` : change ? "Apart from any wording named below, leave the text areas empty so wording can be added later." : "Leave the text areas empty so wording can be added later.";
  const short = `${a.orientation} certificate, ${a.style}, ${a.parts.filter((p) => p.include && p.kind === "artwork").map((p) => p.prompt).join(", ")}, palette ${a.palette.map((p) => p.name).join(", ")}`;
  return [
    {
      tool: "chatgpt",
      label: "ChatGPT / DALL·E",
      prompt: `Use the attached certificate image as the exact design reference. Recreate the same certificate as a flat, front-facing ${a.orientation} design (${ratio}) that fills the whole image — not a photo or mockup.\n\nMatch it closely: the same layout and proportions, the same ${keep || "border and ornaments"}, the same colours (${palette}) and the same style of lettering.\n\n${wording}\n\n${changeLine}`,
      settings: ["Attach the original image (or the blank template below) in the same message.", "If details drift, reply: “closer to the reference — same border thickness and corner ornaments”."],
    },
    {
      tool: "midjourney",
      label: "Midjourney",
      prompt: `<paste image URL> ${short}, ${o.withText ? "with the original layout of text" : "blank, no text"}${change ? `, ${change}` : ""}, flat front view, print-ready --ar ${mjRatio(a.aspect)} --iw 2 --sref <paste image URL> --sw 300 --style raw`,
      settings: ["Upload the reference image to Midjourney and copy its URL into both <paste image URL> places.", "--iw 2 follows the layout strongly; --sw 300 copies colours and ornament style.", "Use Vary (Subtle) on the best result to refine."],
    },
    {
      tool: "sd",
      label: "Stable Diffusion",
      prompt: `${short}, ${o.withText ? "" : "blank certificate, no text, "}${change ? change + ", " : ""}ornate engraving detail, sharp lines, high detail`,
      negative: "photo mockup, perspective, hands, desk, watermark, blurry, deformed ornaments, asymmetrical, misspelled text",
      settings: [
        "img2img: use the original (or blank template) as the init image, denoising 0.35–0.55 (lower = closer to the original).",
        "ControlNet: add the line-art image below as the control image, model Canny or Lineart, weight 0.8–1.0.",
        `Size ${a.orientation === "landscape" ? "1456×1024" : "1024×1456"} · Steps 30 · CFG 6–7.`,
      ],
    },
    {
      tool: "ideogram",
      label: "Ideogram",
      prompt: `Recreate this certificate design: ${short}. ${wording} ${changeLine}`,
      settings: ["Use Remix with the reference image uploaded; image weight 70–85 keeps the design close.", `Aspect ratio ${ratio}`, "Magic Prompt: Off"],
    },
    {
      tool: "flux",
      label: "Flux",
      prompt: `Keep this certificate's layout, border, ornaments, colours and typography exactly as they are. ${o.withText ? wording : "Remove all the wording, leaving the text areas empty."} ${change ? `Then: ${change}.` : ""}`.trim(),
      settings: ["Use Flux Kontext (image editing) with the original image as input.", "For a fresh variant instead, use Flux Redux with the image + the Flux prompt from the text-only tab."],
    },
    {
      tool: "gemini",
      label: "Gemini / Imagen",
      prompt: `Edit the attached certificate image. Keep the same layout, border, corner ornaments, colours (${palette}) and lettering style. ${o.withText ? wording : "Remove all the wording and leave the text areas clean and empty."} ${changeLine} Output a flat, front-facing ${a.orientation} image.`,
      settings: ["Attach the original image in the same message.", "Ask for small follow-up edits one at a time."],
    },
    codePrompt(a, o),
  ];
}

export function buildPrompts(a: Analysis, o: BuildOptions): ToolPrompt[] {
  if (o.reference) return referencePrompts(a, o);
  return [...textOnlyPrompts(a, o), codePrompt(a, o)];
}
