import type { Analysis, Part, TextBlock } from "./analysis";
import type { RefResult } from "./reference";
import { colorName } from "./colornames";

/** Build a structured description from the in-browser scan (no AI). Undetectable parts are marked "assumed". */
export function localAnalysis(r: RefResult, ratio: number): Analysis {
  const st = r.style;
  const bgName = colorName(st.bg);
  const accName = colorName(st.accent);
  const inkName = colorName(st.ink);
  const landscape = ratio >= 1;
  const parts: Part[] = [];
  const add = (p: Omit<Part, "include">) => parts.push({ ...p, include: true });

  add({
    id: "background",
    name: "Background / paper",
    kind: "artwork",
    position: "full page",
    description: `Flat ${bgName} (${st.bg}) background.`,
    prompt: `smooth ${bgName} (${st.bg}) premium paper background, subtle fine paper grain`,
    confidence: "seen",
  });
  const firstFrame = st.frames[0];
  if (firstFrame) {
    const double = st.frames.length > 1;
    const thick = firstFrame.width > 3;
    add({
      id: "border",
      name: "Border frame",
      kind: "artwork",
      position: `rectangular, inset about ${(firstFrame.inset / 10).toFixed(1)}% from each edge`,
      description: `${double ? "Double" : "Single"} ${accName} (${st.accent}) rule frame${double ? ": a thicker outer line and a thin inner line" : ""}.`,
      prompt: `${double ? "elegant double-line" : "single-line"} ${thick ? "bold" : "fine"} ${accName} (${st.accent}) rectangular border frame inset from the page edge${double ? ", thick outer rule and thin inner rule" : ""}`,
      confidence: "seen",
    });
  }
  if (st.corners) {
    add({
      id: "corners",
      name: "Corner ornaments",
      kind: "artwork",
      position: "inside the frame at all four corners",
      description: `Decorative ${accName} ornaments in each corner.`,
      prompt: `matching ${accName} filigree corner ornaments in all four corners, symmetrical`,
      confidence: "seen",
    });
  }
  if (st.band) {
    add({
      id: "band",
      name: "Side colour band",
      kind: "artwork",
      position: "full-height strip down the left edge",
      description: `Solid ${accName} (${st.accent}) vertical band, about ${(st.band / 10).toFixed(0)}% of the page width.`,
      prompt: `solid ${accName} (${st.accent}) vertical colour band running down the left edge`,
      confidence: "seen",
    });
  }
  add({
    id: "emblem",
    name: "Header emblem / logo area",
    kind: "artwork",
    position: "top centre",
    description: "Space for an organisation emblem (not detected — optional).",
    prompt: `small simple ${accName} emblem placeholder at top centre`,
    confidence: "assumed",
  });
  add({
    id: "seal",
    name: "Seal / rosette",
    kind: "artwork",
    position: "bottom centre between the signature lines",
    description: "Typical award seal (not detected — optional).",
    prompt: `${accName} foil rosette seal with scalloped edge and two ribbon tails at bottom centre`,
    confidence: "assumed",
  });
  add({
    id: "signatures",
    name: "Signature lines",
    kind: "artwork",
    position: "bottom left and bottom right",
    description: "Two thin signature lines with small captions beneath.",
    prompt: `two thin ${inkName} signature lines at bottom left and bottom right`,
    confidence: "assumed",
  });

  const serif = r.fontSet === "classic" || r.fontSet === "elegant";
  const text: TextBlock[] = [];
  const t = r.text;
  text.push({ element: "organisation", content: "[Organisation Name]", style: "small letter-spaced capitals" });
  text.push({ element: "title", content: t.title || "Certificate of Achievement", style: `${st.caps ? "spaced capitals" : "title case"}, ${serif ? "high-contrast serif like Playfair Display" : "bold geometric sans like Montserrat"}, ${inkName}` });
  text.push({ element: "presentation line", content: "This certificate is proudly presented to", style: "small italic serif" });
  text.push({ element: "recipient", content: "[Recipient Name]", style: `${r.fontSet === "elegant" ? "flowing script like Great Vibes" : serif ? "large serif" : "large bold sans"}, ${accName}` });
  text.push({ element: "body", content: t.body ? "[Description of the achievement]" : "for outstanding performance and dedication", style: "centred serif body text" });
  text.push({ element: "footer", content: "[Date] · [Certificate ID]", style: "small muted caption" });

  for (const tb of text) {
    parts.push({
      id: `text-${tb.element.replace(/\s+/g, "-")}`,
      name: `Text: ${tb.element}`,
      kind: "text",
      position: tb.element === "organisation" || tb.element === "title" ? "upper centre" : tb.element === "footer" ? "bottom centre" : "centre",
      description: tb.style,
      prompt: `${tb.style} reading "${tb.content}"`,
      include: true,
      confidence: tb.element === "title" && t.title ? "seen" : "assumed",
    });
  }

  return {
    source: "local",
    summary: `A ${landscape ? "landscape" : "portrait"} certificate on a ${bgName} background${st.frames.length ? ` with a ${st.frames.length > 1 ? "double" : "single"} ${accName} frame` : ""}${st.corners ? " and ornamented corners" : ""}${st.band ? ` and a ${accName} band on the left` : ""}, ${inkName} lettering, centred classic layout.`,
    orientation: landscape ? "landscape" : "portrait",
    aspect: landscape ? [297, 210] : [210, 297],
    style: st.frames.length ? "classic formal certificate" : st.band ? "modern corporate certificate" : "clean minimal certificate",
    mood: st.frames.length ? ["formal", "prestigious"] : ["modern", "clean"],
    palette: [
      { name: bgName, hex: st.bg, role: "background" },
      { name: accName, hex: st.accent, role: "border, ornaments, seal" },
      { name: inkName, hex: st.ink, role: "text" },
    ],
    parts,
    text,
  };
}
