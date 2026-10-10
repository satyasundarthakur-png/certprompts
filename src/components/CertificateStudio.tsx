import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Copy from "@/components/Copy";
import { analyseReference, type RefResult } from "@/lib/reference";
import { localAnalysis } from "@/lib/local";
import { analyseWithAI, DEFAULT_MODELS, type Provider } from "@/lib/ai";
import { INSTRUCTION, parseAnalysis, type Analysis, type Part } from "@/lib/analysis";
import { blankTemplate, lineArt } from "@/lib/refimage";
import { buildPrompts, exportText, partPrompt, TOOLS, type Tool } from "@/lib/prompts";

type Method = "local" | "chatbot" | "gemini" | "groq" | "server";

const ENDPOINT = (import.meta.env["VITE_DESCRIBE_ENDPOINT"] as string | undefined) || "";
const ANON = (import.meta.env["VITE_DESCRIBE_ANON_KEY"] as string | undefined) || "";

const load = (k: string, d = "") => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const save = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
};

function downloadBlob(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function imageRatio(src: string): Promise<number> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i.width / i.height);
    i.onerror = () => res(1.414);
    i.src = src;
  });
}

export default function CertificateStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState<RefResult | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [method, setMethod] = useState<Method>(ENDPOINT ? "server" : "local");
  const [keys, setKeys] = useState({ gemini: load("cps:key:gemini"), groq: load("cps:key:groq") });
  const [models, setModels] = useState({ gemini: load("cps:model:gemini", DEFAULT_MODELS.gemini), groq: load("cps:model:groq", DEFAULT_MODELS.groq) });
  const [remember, setRemember] = useState(!!(load("cps:key:gemini") || load("cps:key:groq")));
  const [pasted, setPasted] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [withText, setWithText] = useState(false);
  const [reference, setReference] = useState(true);
  const [changes, setChanges] = useState("");
  const [refImgs, setRefImgs] = useState<{ blank: string; lines: string } | null>(null);
  const [tool, setTool] = useState<Tool>("midjourney");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const prompts = useMemo(() => (analysis ? buildPrompts(analysis, { withText, reference: reference && !!ref?.bg, changes }) : []), [analysis, withText, reference, changes, ref]);
  const cur = prompts.find((p) => p.tool === tool) ?? prompts[0];

  useEffect(() => {
    let live = true;
    setRefImgs(null);
    if (!ref?.bg) return;
    (async () => {
      try {
        const [blank, lines] = await Promise.all([blankTemplate(ref), lineArt(ref.bg)]);
        if (live) setRefImgs({ blank, lines });
      } catch {
        /* reference images are optional */
      }
    })();
    return () => {
      live = false;
    };
  }, [ref]);

  const dl = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  };
  const hint = ref?.text.lines.join("\n") ?? "";

  async function onFile(f?: File | null) {
    if (!f) return;
    setErr("");
    setAnalysis(null);
    setBusy("Reading file…");
    try {
      const r = await analyseReference(f);
      setFile(f);
      setRef(r);
      setRatio(r.bg ? await imageRatio(r.bg) : r.paper === "letter" ? 11 / 8.5 : 1.414);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }

  async function analyse() {
    if (!ref) return;
    setErr("");
    if (method === "local") {
      setAnalysis(localAnalysis(ref, ratio));
      return;
    }
    if (method === "chatbot") {
      try {
        setAnalysis(parseAnalysis(pasted, "pasted"));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not read the reply.");
      }
      return;
    }
    if (!ref.bg) {
      setErr("This file has no picture to send to the AI (a text-only Word file). Use Quick scan, or upload a PDF/PNG of it.");
      return;
    }
    const provider: Provider = method;
    const key = provider === "server" ? ANON : keys[provider as "gemini" | "groq"];
    if (provider !== "server" && !key) {
      setErr("Enter an API key first.");
      return;
    }
    if (remember && provider !== "server") {
      save(`cps:key:${provider}`, key);
    }
    if (provider !== "server") save(`cps:model:${provider}`, models[provider as "gemini" | "groq"]);
    setBusy("Asking the AI to study the design…");
    try {
      const a = await analyseWithAI({ provider, key, model: provider === "server" ? "" : models[provider as "gemini" | "groq"], image: ref.bg, hint, endpoint: ENDPOINT });
      if (!a.parts.length) throw new Error("The AI reply had no components. Try again or use another model.");
      setAnalysis(a);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/Failed to fetch|NetworkError/i.test(m) ? "Couldn't reach the AI service (network or browser blocked the request). Try the chatbot copy/paste method instead." : m);
    } finally {
      setBusy("");
    }
  }

  function updatePart(id: string, patch: Partial<Part>) {
    setAnalysis((a) => (a ? { ...a, parts: a.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : a));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void onFile(e.dataTransfer.files?.[0]);
  }

  const METHODS: { id: Method; label: string; hint: string; show: boolean }[] = [
    { id: "server", label: "Built-in AI", hint: "Uses this site's AI service.", show: !!ENDPOINT },
    { id: "local", label: "Quick scan (no AI)", hint: "Instant, private. Detects colours, frames, bands and corners; other parts are typical guesses.", show: true },
    { id: "chatbot", label: "Any chatbot (copy & paste)", hint: "Free, best detail. Paste our instruction + your image into ChatGPT, Gemini or Claude, then paste its reply back.", show: true },
    { id: "gemini", label: "Gemini (your API key)", hint: "Fully automatic. Key from aistudio.google.com.", show: true },
    { id: "groq", label: "Groq (your API key)", hint: "Fully automatic and fast. Key from console.groq.com.", show: true },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <div>
            <h1 className="font-display text-xl leading-none">Certificate Prompt Studio</h1>
            <p className="mt-1 text-xs text-muted-foreground">Upload a certificate · get every component described · paste the prompts into any AI image tool</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[400px_1fr]">
        <div className="grid content-start gap-4">
          <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="s1">
            <h2 id="s1" className="mb-3 font-display text-lg">1 · Upload</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition ${over ? "border-brand bg-brand/5" : "border-line"}`}
            >
              {ref?.thumb ? (
                <img src={ref.thumb} alt="Uploaded certificate" className="mx-auto mb-3 max-h-48 rounded border border-line" />
              ) : (
                <p className="text-sm">Drop a certificate image, PDF or Word file</p>
              )}
              {file && <p className="mb-2 truncate text-xs text-muted-foreground">{file.name}</p>}
              <Button variant="studio" size="studio" type="button"  disabled={!!busy} onClick={() => input.current?.click()}>{file ? "Choose another" : "Choose file"}</Button>
              <input ref={input} type="file" className="sr-only" aria-label="Upload a certificate" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
              <p className="mt-2 text-xs text-muted-foreground">PNG · JPG · PDF (page 1) · DOCX</p>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="s2">
            <h2 id="s2" className="mb-3 font-display text-lg">2 · How to analyse</h2>
            <div role="radiogroup" aria-label="Analysis method" className="grid gap-2">
              {METHODS.filter((m) => m.show).map((m) => (
                <label key={m.id} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${method === m.id ? "border-brand bg-brand/5" : "border-line"}`}>
                  <input type="radio" name="method" className="mt-1 accent-brand" checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <span><b>{m.label}</b><span className="block text-xs text-muted-foreground">{m.hint}</span></span>
                </label>
              ))}
            </div>

            {(method === "gemini" || method === "groq") && (
              <div className="mt-4 grid gap-3">
                <div>
                  <label htmlFor="key" className="label">{method === "gemini" ? "Gemini" : "Groq"} API key</label>
                  <input id="key" type="password" autoComplete="off" className="field" value={keys[method]} onChange={(e) => setKeys({ ...keys, [method]: e.target.value })} placeholder="Paste your key" />
                </div>
                <div>
                  <label htmlFor="model" className="label">Vision model</label>
                  <input id="model" className="field font-mono text-xs" value={models[method]} onChange={(e) => setModels({ ...models, [method]: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">Change this if the provider has renamed or retired the model.</p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="accent-brand" checked={remember} onChange={(e) => { setRemember(e.target.checked); if (!e.target.checked) { save("cps:key:gemini", ""); save("cps:key:groq", ""); } }} />
                  Remember my key on this device
                </label>
                <p className="text-xs text-muted-foreground">Your key and image go straight from your browser to {method === "gemini" ? "Google" : "Groq"} — never to us.</p>
              </div>
            )}

            {method === "chatbot" && (
              <div className="mt-4 grid gap-3 text-sm">
                <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>Copy the instruction below.</li>
                  <li>Open ChatGPT, Gemini or Claude, attach your certificate image and paste the instruction.</li>
                  <li>Copy the whole reply and paste it in the second box.</li>
                </ol>
                <textarea readOnly rows={4} className="field font-mono text-[11px]" value={hint ? `${INSTRUCTION}\n\nText found in the file (for reference only):\n${hint.slice(0, 1500)}` : INSTRUCTION} aria-label="Instruction for the chatbot" />
                <Copy text={hint ? `${INSTRUCTION}\n\nText found in the file (for reference only):\n${hint.slice(0, 1500)}` : INSTRUCTION} label="Copy instruction" />
                <label htmlFor="paste" className="label !mb-0">Chatbot reply</label>
                <textarea id="paste" rows={5} className="field font-mono text-[11px]" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{ "summary": … }' />
              </div>
            )}

            <Button variant="studioPrimary" size="studio" type="button" className="mt-4 w-full" disabled={!!busy || (!ref && method !== "chatbot") || (method === "chatbot" && !pasted.trim())} onClick={analyse}>
              {busy || (method === "chatbot" ? "Build prompts from reply" : "Analyse certificate")}
            </Button>
            {err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
          </section>
          <p className="px-1 text-xs text-muted-foreground">
            For recreating a <i>design</i>. Names, signatures, seals and ID numbers are turned into placeholders — please don’t use this to copy certificates issued by real institutions.
          </p>
        </div>

        <div className="grid content-start gap-5">
          {!analysis ? (
            <div className="grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-line bg-card p-8 text-center text-sm text-muted-foreground">
              {ref ? "Choose a method and press Analyse." : "Upload a certificate to begin."}
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="s3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="s3" className="font-display text-lg">Design summary</h2>
                    <p className="text-xs text-muted-foreground">
                      {analysis.source === "local" ? "Quick scan — parts marked “assumed” are typical guesses; untick what isn't there." : "AI analysis"} · {analysis.orientation} · {analysis.style}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="studio" size="studio" type="button"  onClick={() => downloadBlob(exportText(analysis, prompts), "certificate-prompts.txt", "text/plain")}>Download .txt</Button>
                    <Button variant="studio" size="studio" type="button"  onClick={() => downloadBlob(JSON.stringify(analysis, null, 2), "certificate-analysis.json", "application/json")}>.json</Button>
                  </div>
                </div>
                {analysis.summary && <p className="mt-3 text-sm">{analysis.summary}</p>}
                <div className="mt-4 flex flex-wrap gap-3">
                  {analysis.palette.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-xs">
                      <span className="h-6 w-6 rounded-full border border-line" style={{ background: p.hex }} />
                      <span><b>{p.name}</b> {p.hex}{p.role ? ` · ${p.role}` : ""}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="s4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 id="s4" className="font-display text-lg">Full-page prompt</h2>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-brand" checked={withText} onChange={(e) => setWithText(e.target.checked)} />
                    Put the wording in the image
                  </label>
                </div>

                <div role="radiogroup" aria-label="Prompt mode" className="mb-4 grid gap-2 sm:grid-cols-2">
                  <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${reference && ref?.bg ? "border-brand bg-brand/5" : "border-line"} ${!ref?.bg ? "opacity-50" : ""}`}>
                    <input type="radio" name="mode" className="mt-1 accent-brand" disabled={!ref?.bg} checked={reference && !!ref?.bg} onChange={() => setReference(true)} />
                    <span><b>Inspire from the original image</b><span className="block text-xs text-muted-foreground">Most accurate. You attach the original (or blank template) to the AI along with the prompt.</span></span>
                  </label>
                  <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${!reference || !ref?.bg ? "border-brand bg-brand/5" : "border-line"}`}>
                    <input type="radio" name="mode" className="mt-1 accent-brand" checked={!reference || !ref?.bg} onChange={() => setReference(false)} />
                    <span><b>Text prompt only</b><span className="block text-xs text-muted-foreground">No image needed — similar style, details will vary.</span></span>
                  </label>
                </div>

                {reference && ref?.bg && (
                  <div className="mb-4 grid gap-3 rounded-xl border border-line bg-paper p-4">
                    <p className="label !mb-0">Reference images to attach</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { src: ref.bg, name: "reference-original.jpg", title: "Original", tip: "Closest copy" },
                        { src: refImgs?.blank, name: "reference-blank-template.png", title: "Blank template", tip: "Wording removed" },
                        { src: refImgs?.lines, name: "reference-lineart.png", title: "Line art", tip: "For ControlNet" },
                      ].map((r) => (
                        <div key={r.title} className="grid gap-1.5 text-center">
                          <div className="grid aspect-[1.414] place-items-center overflow-hidden rounded border border-line bg-card">
                            {r.src ? <img src={r.src} alt={r.title} className="h-full w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">Preparing…</span>}
                          </div>
                          <span className="text-xs font-semibold">{r.title}</span>
                          <span className="text-[10px] text-muted-foreground">{r.tip}</span>
                          <Button variant="studio" size="studio" type="button" className="px-2 py-1 text-xs" disabled={!r.src} onClick={() => r.src && dl(r.src, r.name)}>Download</Button>
                        </div>
                      ))}
                    </div>
                    <div>
                      <label htmlFor="changes" className="label">What should be different? (optional)</label>
                      <textarea id="changes" rows={2} className="field text-sm" value={changes} onChange={(e) => setChanges(e.target.value)} placeholder="e.g. title “Certificate of Merit”, change gold to silver, add a laurel wreath above the title" />
                    </div>
                  </div>
                )}

                <div role="tablist" aria-label="AI tool" className="mb-3 flex flex-wrap gap-2">
                  {TOOLS.map((t) => (
                    <Button variant="studioChip" size="studio" key={t.id} role="tab" type="button" aria-selected={tool === t.id} onClick={() => setTool(t.id)}>{t.label}</Button>
                  ))}
                </div>
                {cur && (
                  <div className="grid gap-3" role="tabpanel">
                    <p className="text-xs text-muted-foreground">{TOOLS.find((t) => t.id === tool)?.note}</p>
                    <textarea readOnly rows={9} className="field font-mono text-xs leading-relaxed" value={cur.prompt} aria-label={`${cur.label} prompt`} />
                    <div><Copy text={cur.prompt} label={`Copy ${cur.label} prompt`} className="btn btn-primary" /></div>
                    {cur.negative && (
                      <>
                        <label className="label !mb-0" htmlFor="neg">Negative prompt</label>
                        <textarea id="neg" readOnly rows={3} className="field font-mono text-xs" value={cur.negative} />
                        <div><Copy text={cur.negative} label="Copy negative prompt" /></div>
                      </>
                    )}
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {cur.settings.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </section>

              <section aria-labelledby="s5" className="grid gap-3">
                <div>
                  <h2 id="s5" className="font-display text-lg">Components ({analysis.parts.filter((p) => p.include).length}/{analysis.parts.length})</h2>
                  <p className="text-xs text-muted-foreground">Edit any prompt — the full-page prompt updates. Untick a part to leave it out. “Stand-alone” makes that part on its own (e.g. a seal to place yourself).</p>
                </div>
                <ul className="grid gap-3 md:grid-cols-2">
                  {analysis.parts.map((p) => (
                    <li key={p.id} className={`grid gap-2 rounded-xl border bg-card p-4 ${p.include ? "border-line" : "border-dashed border-line opacity-60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" className="accent-brand" checked={p.include} onChange={(e) => updatePart(p.id, { include: e.target.checked })} />
                          {p.name}
                        </label>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.confidence === "seen" ? "bg-detected text-detected-foreground" : "bg-assumed text-assumed-foreground"}`}>
                          {p.kind === "text" ? "text · " : ""}{p.confidence === "seen" ? "detected" : "assumed"}
                        </span>
                      </div>
                      {p.position && <p className="text-xs text-muted-foreground"><b>Where:</b> {p.position}</p>}
                      {p.description && p.description !== p.prompt && <p className="text-xs">{p.description}</p>}
                      <textarea rows={3} className="field text-xs" value={p.prompt} onChange={(e) => updatePart(p.id, { prompt: e.target.value })} aria-label={`Prompt for ${p.name}`} />
                      <div className="flex flex-wrap gap-2">
                        <Copy text={p.prompt} label="Copy" />
                        <Copy text={partPrompt(analysis, p)} label="Copy stand-alone" />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
