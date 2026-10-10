import type { Analysis, Part, TextBlock } from "@/lib/analysis";

/**
 * Turns an analysis into a printable, editable certificate (plain HTML + CSS) with {{tokens}}
 * for the placeholders ("[Recipient Name]" -> {{recipient_name}}), then fills it from CSV rows.
 * Everything runs in the browser; nothing is uploaded.
 */

export const MAX_BATCH = 500;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

export type Row = Record<string, string>;

export interface Template {
  css: string;
  page: string; // one certificate, with {{tokens}}
  tokens: string[]; // in reading order
  fontsHref: string; // "" when web fonts are off
  mm: [number, number];
}

/* ---------- tokens ---------- */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** "Recipient Name" -> "recipient_name". Used for both placeholders and CSV headers so they match. */
export function tokenKey(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "field"
  );
}

/** "[Recipient Name]" -> "{{recipient_name}}" */
export function tokenise(text: string): string {
  return text.replace(/\[([^\]\n]{1,40})\]/g, (_m, label: string) => `{{${tokenKey(label)}}}`);
}

function tokensIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{([a-z0-9_]+)\}\}/g))
    if (m[1] && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Single pass, so a value that itself contains "{{x}}" is never expanded again. Values are HTML-escaped. */
export function fill(html: string, row: Row | null): string {
  if (!row) return html;
  return html.replace(/\{\{([a-z0-9_]+)\}\}/g, (_m, k: string) => esc(row[k] ?? ""));
}

export const labelOf = (key: string) =>
  key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/* ---------- colours ---------- */

const HEX = /^#[0-9a-f]{6}$/i;

function hsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: 0, s, l };
}

interface Colours {
  bg: string;
  ink: string;
  accent: string;
}

function pickColours(a: Analysis): Colours {
  const sw = a.palette.filter((p) => HEX.test(p.hex));
  const byRole = (re: RegExp) => sw.find((p) => re.test(`${p.role} ${p.name}`.toLowerCase()))?.hex;
  const lightest = [...sw].sort((x, y) => hsl(y.hex).l - hsl(x.hex).l)[0]?.hex;
  const darkest = [...sw].sort((x, y) => hsl(x.hex).l - hsl(y.hex).l)[0]?.hex;
  const vivid = [...sw]
    .filter((p) => hsl(p.hex).l > 0.2 && hsl(p.hex).l < 0.85)
    .sort((x, y) => hsl(y.hex).s - hsl(x.hex).s)[0]?.hex;
  return {
    bg: byRole(/background|paper/) ?? lightest ?? "#fffdf7",
    ink: byRole(/\btext\b|\bink\b|body/) ?? darkest ?? "#1f2937",
    accent: byRole(/border|accent|gold|seal|frame|ribbon/) ?? vivid ?? "#b8860b",
  };
}

/* ---------- fonts ---------- */

const KNOWN_FONTS = [
  "Great Vibes",
  "Playfair Display",
  "Cinzel",
  "Montserrat",
  "Cormorant Garamond",
  "Libre Baskerville",
  "Lora",
  "Dancing Script",
  "Pinyon Script",
  "Allura",
  "Merriweather",
  "Poppins",
  "Inter",
  "EB Garamond",
  "Alex Brush",
  "Parisienne",
  "Tangerine",
  "Raleway",
  "Open Sans",
];

function pickFont(style: string, fallback: string): string {
  const s = style.toLowerCase();
  const hit = KNOWN_FONTS.find((f) => s.includes(f.toLowerCase()));
  if (hit) return hit;
  if (/script|cursive|calligraph|handwrit/.test(s)) return "Great Vibes";
  if (/\bsans\b|geometric|modern/.test(s)) return "Montserrat";
  return fallback;
}

const GENERIC: Record<string, string> = {
  "Great Vibes": "cursive",
  "Dancing Script": "cursive",
  "Pinyon Script": "cursive",
  Allura: "cursive",
  "Alex Brush": "cursive",
  Parisienne: "cursive",
  Tangerine: "cursive",
  Montserrat: "sans-serif",
  Poppins: "sans-serif",
  Inter: "sans-serif",
  Raleway: "sans-serif",
  "Open Sans": "sans-serif",
};
const stack = (f: string) => `'${f}', ${GENERIC[f] ?? "Georgia, 'Times New Roman', serif"}`;

/* ---------- layout ---------- */

type Role = "title" | "intro" | "org" | "name" | "body" | "sig" | "meta";

function roleOf(el: string, hasName: boolean, hasTitle: boolean): Role {
  const e = el.toLowerCase();
  if (/sign|authori|director|president|chair|principal|dean|\bceo\b|secretary|registrar/.test(e))
    return "sig";
  if (/\borg|organi[sz]ation|institution|issuer|company|academy|university|college/.test(e))
    return "org";
  if (/recipient|awardee|receiver|student|participant|\bname\b/.test(e)) return "name";
  if (/\bdate\b|number|serial|\bid\b|reference|issued|footer|caption/.test(e)) return "meta";
  if (/sub.?title|presented|presentation|this certif/.test(e)) return "intro";
  if (/title|heading|header/.test(e) && !hasTitle) return "title";
  return hasName ? "body" : "intro";
}

const html = (s: string) => esc(tokenise(s)).replace(/\n/g, "<br>");

function has(parts: Part[], re: RegExp): boolean {
  return parts.some((p) => p.include && re.test(`${p.id} ${p.name}`.toLowerCase()));
}

export function buildTemplate(a: Analysis, opts: { webFonts?: boolean } = {}): Template {
  const { bg, ink, accent } = pickColours(a);
  const ratio = Math.min(3.5, Math.max(0.3, a.aspect[0] / a.aspect[1] || 1.414)); // keep a sane page shape
  const landscape = ratio >= 1;
  const mm: [number, number] = landscape
    ? [297, Math.round(297 / ratio)]
    : [Math.round(297 * ratio), 297];
  const k = landscape ? 1 : 1.35; // scale type up on narrow portrait pages

  const blocks: TextBlock[] = a.text.length
    ? a.text
    : [{ element: "title", content: "Certificate of Achievement", style: "" }];
  const main: { role: Role; text: string; style: string }[] = [];
  const foot: { role: Role; text: string; style: string }[] = [];
  let hasName = false;
  let hasTitle = false;
  for (const b of blocks) {
    const role = roleOf(b.element, hasName, hasTitle);
    if (role === "name") hasName = true;
    if (role === "title") hasTitle = true;
    (role === "sig" || role === "meta" ? foot : main).push({
      role,
      text: b.content,
      style: b.style,
    });
  }
  if (!hasName) {
    const at = Math.max(main.findIndex((m) => m.role === "title") + 1, 0);
    main.splice(at, 0, { role: "name", text: "[Recipient Name]", style: "" });
  }
  if (!foot.some((f) => f.role === "meta"))
    foot.unshift({ role: "meta", text: "[Date]", style: "" });
  if (!foot.some((f) => f.role === "sig"))
    foot.push({ role: "sig", text: "Authorised signature", style: "" });

  const titleFont = pickFont(main.find((m) => m.role === "title")?.style ?? "", "Cinzel");
  const nameFont = pickFont(main.find((m) => m.role === "name")?.style ?? "", "Great Vibes");
  const bodyFont = pickFont(main.find((m) => m.role === "body")?.style ?? "", "Lora");
  const fonts = [...new Set([titleFont, nameFont, bodyFont])];
  const fontsHref =
    opts.webFonts === false
      ? ""
      : `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=swap`;

  const border = has(a.parts, /border|frame/);
  const corners = has(a.parts, /corner/);
  const band = has(a.parts, /\bband\b|stripe|strip/);
  const seal = has(a.parts, /seal|rosette|medal|badge/);

  const footHtml = foot.map(
    (f) => `<div class="${f.role === "sig" ? "sig" : "meta"}">${html(f.text)}</div>`,
  );
  if (seal)
    footHtml.splice(
      Math.ceil(footHtml.length / 2),
      0,
      `<div class="seal" aria-hidden="true">★</div>`,
    );

  const deco = [
    border ? `<div class="frame"></div><div class="frame2"></div>` : "",
    corners ? ["tl", "tr", "bl", "br"].map((c) => `<i class="corner ${c}"></i>`).join("") : "",
    band ? `<div class="band"></div>` : "",
  ].join("");

  const mainHtml = main.map((m) => `<p class="t-${m.role}">${html(m.text)}</p>`).join("");
  const page = `<section class="page">${deco}<div class="body"><div class="main">${mainHtml}</div><div class="foot">${footHtml.join("")}</div></div></section>`;

  const left = band ? 13 : 7;
  const css = `
@page{size:${mm[0]}mm ${mm[1]}mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#e5e7eb}
.page{container-type:inline-size;position:relative;width:100%;aspect-ratio:${mm[0]}/${mm[1]};margin:0 auto 12px;overflow:hidden;background:${bg};color:${ink};font-family:${stack(bodyFont)};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.frame{position:absolute;inset:2.2cqw;border:.35cqw solid ${accent}}
.frame2{position:absolute;inset:3cqw;border:.12cqw solid ${accent}}
.corner{position:absolute;width:${4 * k}cqw;height:${4 * k}cqw;border:0 solid ${accent}}
.corner.tl{top:3.8cqw;left:3.8cqw;border-top-width:.45cqw;border-left-width:.45cqw}
.corner.tr{top:3.8cqw;right:3.8cqw;border-top-width:.45cqw;border-right-width:.45cqw}
.corner.bl{bottom:3.8cqw;left:3.8cqw;border-bottom-width:.45cqw;border-left-width:.45cqw}
.corner.br{bottom:3.8cqw;right:3.8cqw;border-bottom-width:.45cqw;border-right-width:.45cqw}
.band{position:absolute;top:0;bottom:0;left:0;width:6cqw;background:${accent}}
.body{position:absolute;inset:${7 * k}cqw 9cqw ${6 * k}cqw ${left + 2}cqw;display:flex;flex-direction:column;align-items:center;text-align:center}
.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${1.5 * k}cqw;width:100%}
.main p{margin:0}
.t-title{font-family:${stack(titleFont)};font-size:${5.4 * k}cqw;letter-spacing:.1em;text-transform:uppercase;line-height:1.15}
.t-intro,.t-org{font-size:${1.7 * k}cqw;letter-spacing:.2em;text-transform:uppercase;opacity:.8}
.t-org{color:${accent};font-weight:700;opacity:1}
.t-name{font-family:${stack(nameFont)};font-size:${5.2 * k}cqw;line-height:1.15;color:${accent};padding:0 4cqw .5cqw;border-bottom:.12cqw solid ${accent};min-width:40cqw}
.t-body{font-size:${1.8 * k}cqw;line-height:1.55;max-width:${landscape ? 70 : 62}cqw}
.foot{width:100%;display:flex;justify-content:space-between;align-items:flex-end;gap:3cqw}
.meta{flex:1;text-align:left;font-size:${1.4 * k}cqw;line-height:1.5;opacity:.85}
.sig{flex:1;text-align:center;font-size:${1.3 * k}cqw;border-top:.1cqw solid ${ink};padding-top:.6cqw}
.seal{width:${9 * k}cqw;height:${9 * k}cqw;flex:none;border-radius:50%;display:grid;place-items:center;font-size:${4 * k}cqw;color:${bg};background:radial-gradient(circle at 35% 30%,${accent},${ink} 160%);box-shadow:0 0 0 .5cqw ${bg},0 0 0 .7cqw ${accent}}
@media print{html,body{background:none}.page{width:${mm[0]}mm;height:${mm[1]}mm;aspect-ratio:auto;margin:0;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}
`.trim();

  const tokens = tokensIn(page);
  return { css, page, tokens, fontsHref, mm };
}

/** One full HTML document: one page per row (or a single page when `rows` is [null] to keep the {{tokens}} visible). */
export function renderDocument(t: Template, rows: (Row | null)[], title = "Certificates"): string {
  const font = t.fontsHref
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="${t.fontsHref}">`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${font}<style>${t.css}</style></head><body>${rows.map((r) => fill(t.page, r)).join("")}</body></html>`;
}

/* ---------- CSV ---------- */

/** RFC-4180-style parser: quotes, escaped quotes, newlines inside quotes, BOM, and comma / semicolon / tab delimiters. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // drop a byte-order mark
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim =
    ([",", ";", "\t"] as const)
      .map((d) => [d, firstLine.split(d).length] as const)
      .sort((x, y) => y[1] - x[1])[0]?.[0] ?? ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) endCell();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

export interface CsvData {
  columns: string[]; // normalised header keys
  rows: Row[];
  truncated: boolean;
}

export function readCsv(input: string): CsvData {
  const all = parseCsv(input);
  const head = all[0] ?? [];
  const columns = head.map(tokenKey);
  const rows = all.slice(1, MAX_BATCH + 1).map((cells) => {
    const r: Row = {};
    columns.forEach((c, i) => {
      r[c] = (cells[i] ?? "").trim();
    });
    return r;
  });
  return { columns, rows, truncated: all.length - 1 > MAX_BATCH };
}

const csvCell = (s: string) => (/[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** A starter CSV with one column per token and one example row. */
export function sampleCsv(tokens: string[]): string {
  return `${tokens.map(csvCell).join(",")}\n${tokens.map((t) => csvCell(`Example ${labelOf(t).toLowerCase()}`)).join(",")}\n`;
}

/* ---------- browser helpers ---------- */

/** Opens the print dialog for a document (choose "Save as PDF"). Uses a hidden iframe so no pop-up is blocked. */
export function printHtml(doc: string): void {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.onload = () => {
    const w = f.contentWindow;
    if (!w) return;
    void Promise.resolve(w.document.fonts?.ready)
      .catch(() => undefined)
      .then(() => {
        w.focus();
        w.print();
        setTimeout(() => f.remove(), 60_000);
      });
  };
  f.srcdoc = doc;
  document.body.appendChild(f);
}
