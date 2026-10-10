import type { RefResult } from "./reference";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Could not load the image."));
    i.src = src;
  });
}

/**
 * Original artwork with the wording area painted over in the background colour:
 * keeps the frame and corner ornaments so an AI can copy the design without copying the text.
 */
export async function blankTemplate(r: RefResult): Promise<string> {
  const img = await loadImage(r.bg);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext("2d");
  if (!x) throw new Error("Canvas processing is unavailable in this browser.");
  x.drawImage(img, 0, 0);
  const u = c.width / 1000; // reference.ts reports insets in 1000-unit page width
  const st = r.style;
  const last = st.frames[st.frames.length - 1];
  const inner = (last ? last.inset + last.width + 3 : 30) * u;
  const left = st.band ? (st.band + 6) * u : inner;
  const keep = (st.corners ? 72 : 0) * u;
  x.fillStyle = st.bg;
  x.fillRect(left + keep, inner, c.width - left - inner - 2 * keep, c.height - 2 * inner);
  x.fillRect(left, inner + keep, c.width - left - inner, c.height - 2 * inner - 2 * keep);
  return c.toDataURL("image/png");
}

/** White-on-black edge map (Sobel) — the "canny / lineart" control image for Stable Diffusion ControlNet. */
export async function lineArt(src: string, maxW = 1536): Promise<string> {
  const img = await loadImage(src);
  const s = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * s);
  const h = Math.round(img.height * s);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw new Error("Canvas processing is unavailable in this browser.");
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const out = x.createImageData(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let xx = 1; xx < w - 1; xx++) {
      const i = y * w + xx;
      const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      const m = Math.min(255, Math.hypot(gx, gy) * 0.9);
      const v = m > 40 ? 255 : m > 18 ? m * 2 : 0;
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
  }
  x.putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}
