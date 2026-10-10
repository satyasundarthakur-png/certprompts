import { INSTRUCTION, parseAnalysis, type Analysis } from "./analysis";

export type Provider = "gemini" | "groq" | "server";

export const DEFAULT_MODELS: Record<Exclude<Provider, "server">, string> = {
  gemini: "gemini-2.5-flash",
  groq: "meta-llama/llama-4-scout-17b-16e-instruct",
};

/** Downscale a data URL to keep requests small (most vision APIs cap images at a few MB). */
export function shrink(dataUrl: string, maxW = 1280): Promise<string> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => {
      const s = Math.min(1, maxW / i.width);
      const c = document.createElement("canvas");
      c.width = Math.round(i.width * s);
      c.height = Math.round(i.height * s);
      const x = c.getContext("2d");
      // Must reject, not throw: a throw inside onload escapes the Promise and the
      // UI would stay stuck on "Asking the AI…" forever.
      if (!x) return rej(new Error("Canvas processing is unavailable in this browser."));
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(i, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.88));
    };
    i.onerror = () => rej(new Error("Could not prepare the image."));
    i.src = dataUrl;
  });
}

function withHint(hint: string) {
  return hint ? `${INSTRUCTION}\n\nText found in the file (for reference only):\n${hint.slice(0, 1500)}` : INSTRUCTION;
}

export const REQUEST_TIMEOUT_MS = 90_000;

/** fetch with a time limit, so a stalled connection ends in a clear message instead of "Asking the AI…" forever. */
export async function post(url: string, init: RequestInit, who: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(`${who} didn't answer within ${REQUEST_TIMEOUT_MS / 1000} seconds. Try again, or use another method.`);
    }
    throw e;
  }
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Text of a Gemini reply, or a plain-English reason when there is none (blocked, stopped early, empty). */
export function readGeminiText(j: GeminiReply): string {
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (text) return text;
  const finish = j.candidates?.[0]?.finishReason;
  const why = j.promptFeedback?.blockReason ?? (finish && finish !== "STOP" ? finish : "");
  if (why) throw new Error(`Gemini declined this image (${why}). Try another model or the chatbot method.`);
  throw new Error("Gemini returned an empty reply. Try again, or use another model.");
}

async function fail(r: Response, who: string): Promise<never> {
  let msg = `${who} returned ${r.status}`;
  try {
    const j = await r.json();
    msg += `: ${j.error?.message ?? JSON.stringify(j).slice(0, 200)}`;
  } catch {
    /* ignore */
  }
  if (r.status === 401 || r.status === 403) msg += " — check the API key.";
  if (r.status === 404) msg += " — the model name may be out of date; try another in Settings.";
  throw new Error(msg);
}

export async function analyseWithAI(opts: {
  provider: Provider;
  key: string;
  model: string;
  image: string; // data URL
  hint: string;
  endpoint?: string;
}): Promise<Analysis> {
  const img = await shrink(opts.image);
  const b64 = img.split(",")[1];
  const text = withHint(opts.hint);

  if (opts.provider === "gemini") {
    const r = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": opts.key },
        body: JSON.stringify({
          contents: [{ parts: [{ text }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      },
      "Gemini",
    );
    if (!r.ok) await fail(r, "Gemini");
    return parseAnalysis(readGeminiText((await r.json()) as GeminiReply), "ai");
  }

  if (opts.provider === "groq") {
    const r = await post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: img } }] }],
        }),
      },
      "Groq",
    );
    if (!r.ok) await fail(r, "Groq");
    const j = await r.json();
    return parseAnalysis(j.choices?.[0]?.message?.content ?? "", "ai");
  }

  // server: Supabase edge function (or any endpoint) that holds the key
  if (!opts.endpoint) throw new Error("No server endpoint configured.");
  const r = await post(
    opts.endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}) },
      body: JSON.stringify({ image: b64, mime: "image/jpeg", hint: opts.hint }),
    },
    "Server",
  );
  if (!r.ok) await fail(r, "Server");
  const j = await r.json();
  return parseAnalysis(typeof j.text === "string" ? j.text : JSON.stringify(j), "ai");
}
