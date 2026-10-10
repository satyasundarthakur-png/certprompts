import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Analysis } from "@/lib/analysis";
import { downloadText } from "@/lib/download";
import {
  MAX_BATCH,
  MAX_CSV_BYTES,
  buildTemplate,
  labelOf,
  printHtml,
  readCsv,
  renderDocument,
  sampleCsv,
  type CsvData,
} from "@/lib/template";

/** Printable certificate built from the analysis, with {{tokens}} that a CSV can fill — one page per row. */
export default function TemplatePanel({ analysis }: { analysis: Analysis }) {
  const [webFonts, setWebFonts] = useState(true);
  const [csv, setCsv] = useState<CsvData | null>(null);
  const [csvName, setCsvName] = useState("");
  const [csvErr, setCsvErr] = useState("");
  const [pick, setPick] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  const tpl = useMemo(() => buildTemplate(analysis, { webFonts }), [analysis, webFonts]);
  const rows = csv?.rows ?? [];
  const row = rows[Math.min(pick, Math.max(rows.length - 1, 0))] ?? null;
  const missing = csv ? tpl.tokens.filter((t) => !csv.columns.includes(t)) : [];
  const unused = csv ? csv.columns.filter((c) => !tpl.tokens.includes(c)) : [];

  const preview = useMemo(() => renderDocument(tpl, [row]), [tpl, row]);
  const batch = () =>
    renderDocument(
      tpl,
      rows.length ? rows : [Object.fromEntries(tpl.tokens.map((t) => [t, ""]))],
      "Certificates",
    );

  async function onCsv(f?: File | null) {
    if (!f) return;
    setCsvErr("");
    try {
      if (f.size > MAX_CSV_BYTES)
        throw new Error("That file is over 2 MB. Split it into smaller lists.");
      const data = readCsv(await f.text());
      if (!data.rows.length)
        throw new Error(
          "No rows found. The first line must be the column names, followed by one line per person.",
        );
      setCsv(data);
      setCsvName(f.name);
      setPick(0);
    } catch (e) {
      setCsv(null);
      setCsvName("");
      setCsvErr(e instanceof Error ? e.message : "Could not read that CSV.");
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  return (
    <section className="panel" data-tone="violet" aria-labelledby="s-tpl">
      <h2 id="s-tpl" className="panel-title">
        Printable template &amp; batch
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Rebuilds the design as an editable page (HTML) using the colours, frame, seal and wording
        found above. Placeholders become fields you can fill from a spreadsheet — one certificate
        per row. It's an approximation of the layout, not a pixel copy.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="label !mb-0">Fields</span>
        {tpl.tokens.map((t) => (
          <code
            key={t}
            className="rounded-full border border-line bg-card px-2 py-0.5 text-xs"
          >{`{{${t}}}`}</code>
        ))}
      </div>

      <div
        className="mb-3 overflow-hidden rounded-xl border border-line bg-card"
        style={{ aspectRatio: `${tpl.mm[0]} / ${tpl.mm[1]}` }}
      >
        <iframe
          title="Certificate preview"
          sandbox=""
          srcDoc={preview}
          className="h-full w-full border-0"
        />
      </div>

      <label className="mb-4 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="accent-brand"
          checked={webFonts}
          onChange={(e) => setWebFonts(e.target.checked)}
        />
        Load fonts from Google Fonts (needs internet; untick to keep everything offline with system
        fonts)
      </label>

      <div className="grid gap-3 rounded-xl border border-line bg-paper p-4">
        <p className="label !mb-0">Fill from a spreadsheet (CSV)</p>
        <p className="text-xs text-muted-foreground">
          First row = column names that match the fields above (e.g. <code>recipient_name</code>,{" "}
          <code>date</code>). Export CSV from Excel or Google Sheets. Up to {MAX_BATCH} rows. The
          file is read in your browser only.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="studio"
            size="studio"
            type="button"
            onClick={() => file.current?.click()}
          >
            {csv ? "Choose another CSV" : "Choose CSV"}
          </Button>
          <Button
            variant="studio"
            size="studio"
            type="button"
            onClick={() =>
              downloadText(sampleCsv(tpl.tokens), "certificates-sample.csv", "text/csv")
            }
          >
            Download sample CSV
          </Button>
          <input
            ref={file}
            type="file"
            className="sr-only"
            aria-label="Upload a CSV of recipients"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => void onCsv(e.target.files?.[0])}
          />
        </div>
        {csvErr && (
          <p role="alert" className="text-sm text-destructive">
            {csvErr}
          </p>
        )}
        {csv && (
          <div className="grid gap-2 text-xs">
            <p>
              <b>{csvName}</b> · {rows.length} {rows.length === 1 ? "row" : "rows"}
              {csv.truncated ? ` (only the first ${MAX_BATCH} are used)` : ""}
            </p>
            {missing.length > 0 && (
              <p role="status" className="text-assumed-foreground">
                No column for: {missing.map(labelOf).join(", ")} — these will print blank. Rename a
                column or edit the CSV.
              </p>
            )}
            {unused.length > 0 && (
              <p className="text-muted-foreground">Ignored columns: {unused.join(", ")}</p>
            )}
            <label className="flex items-center gap-2">
              Preview row
              <select
                className="field !w-auto py-1 text-xs"
                value={Math.min(pick, rows.length - 1)}
                onChange={(e) => setPick(Number(e.target.value))}
              >
                {rows.slice(0, 100).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {r["recipient_name"] || r["name"] || Object.values(r)[0] || "(empty)"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="studioPrimary"
          size="studio"
          type="button"
          onClick={() => printHtml(batch())}
        >
          {rows.length > 1 ? `Print / save ${rows.length} as PDF` : "Print / save as PDF"}
        </Button>
        <Button
          variant="studio"
          size="studio"
          type="button"
          onClick={() =>
            downloadText(
              batch(),
              rows.length ? "certificates.html" : "certificate-blank.html",
              "text/html",
            )
          }
        >
          {rows.length ? "Download filled pages (.html)" : "Download blank form (.html)"}
        </Button>
        <Button
          variant="studio"
          size="studio"
          type="button"
          onClick={() =>
            downloadText(
              renderDocument(tpl, [null], "Certificate template"),
              "certificate-template.html",
              "text/html",
            )
          }
        >
          Download template with {"{{fields}}"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        In the print window choose "Save as PDF", paper size as shown, margins "None", and tick
        "Background graphics" so colours print.
      </p>
    </section>
  );
}
