"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import MetaForm from "@/components/MetaForm";
import ResultDisplay from "@/components/ResultDisplay";
import InlinePdfPreview from "@/components/InlinePdfPreview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PriceRow } from "@/lib/priceExtractor";

/* ---------------- types & helpers ---------------- */

type Meta = {
  supplier: string;
  manufacturer: string;
  validityDate: string; // ISO 8601 or ""
};

type ItemsPayload = {
  items?: PriceRow[] | Record<string, PriceRow>;
};

type AIContainer = { items?: unknown };

// tiny runtime helpers to keep TS strict & eslint happy
const toStr = (v: unknown) => (v == null ? "" : String(v));
const toNum = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const toQuoteType = (v: unknown): "Price List" | "Quote" => {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.includes("quote") || s === "q" || s === "quotation") return "Quote";
  return "Price List";
};
const toISO3 = (v: unknown): "EUR" | "USD" | "GBP" => {
  const s = String(v ?? "").toUpperCase();
  if (s === "EUR" || s === "USD" || s === "GBP") return s as "EUR" | "USD" | "GBP";
  return "EUR";
};

function hasItems(x: unknown): x is AIContainer {
  return typeof x === "object" && x !== null && "items" in x;
}

// JSON Schema for AI route (inlined so this file is self-contained)
function buildPriceRowSchema() {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Extract product rows from the PDF.",
        items: {
          type: "object",
          properties: {
            Supplier: { type: "string", description: "Company selling the goods (distributor/dealer/integrator)." },
            Manufacturer: { type: "string", description: "Company that makes the product." },
            ModelCode: { type: "string", description: "Vendor SKU / model identifier, letters+digits as shown in the doc." },
            ModelDescription: { type: "string", description: "Human description of the model row." },
            T1List: { type: "number", description: "List/MSRP price if present; else 0." },
            T1Cost: { type: "number", description: "Cost at T1 if present; else 0." },
            T2List: { type: "number", description: "Dealer/Net price if present; else 0." },
            T2Cost: { type: "number", description: "Cost at T2 if present; else 0." },
            ISOCurrency: { type: "string", description: "ISO currency code like EUR, USD, GBP." },
            ValidityDate: { type: "string", description: "Validity or issue date (ISO if possible) or empty." },
            T1orT2: { type: "string", description: "Best label for the extracted price (T1 or T2)." },
            MaterialID: { type: "string" },
            SAPNumber: { type: "string" },
            ModelDescriptionEnglish: { type: "string" },
            ModelDescriptionLanguage2: { type: "string" },
            ModelDescriptionLanguage3: { type: "string" },
            ModelDescriptionLanguage4: { type: "string" },
            QuoteOrPriceList: { type: "string" },
            WeightKg: { type: "number" },
            HeightMm: { type: "number" },
            LengthMm: { type: "number" },
            WidthMm: { type: "number" },
            PowerWatts: { type: "number" },
            FileName: { type: "string" }
          },
          required: ["ModelCode", "ModelDescription"]
        }
      }
    },
    required: ["items"]
  };
}

/* ---------------- page ---------------- */

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>({
    supplier: "",
    manufacturer: "",
    validityDate: "",
  });
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setRows([]);
  };

  // Fast regex-based extractor (your /api/parse)
  const handleExtractFast = async () => {
    if (!file) {
      alert("Please upload a PDF before extracting.");
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("supplier", meta.supplier);
    fd.append("manufacturer", meta.manufacturer);
    fd.append("validityDate", meta.validityDate);

    try {
      setLoading(true);

      const res = await fetch("/api/parse", { method: "POST", body: fd });
      if (!res.ok) {
        let msg = "Failed to parse PDF.";
        try {
          const j = await res.json();
          if (j?.error) msg = `Parse error: ${j.error}`;
        } catch {}
        throw new Error(msg);
      }

      const data: unknown = await res.json();
      const payload = data as ItemsPayload;

      if (payload.items) {
        setRows(
          Array.isArray(payload.items)
            ? payload.items
            : Object.values(payload.items)
        );
      } else {
        setRows([]);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message
          : "Unexpected error while extracting data.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  // AI extraction using your /api/extract (Gemini + JSON schema)
  const handleExtractAI = async () => {
    if (!file) {
      alert("Please upload a PDF before extracting.");
      return;
    }

    // Safe JSON parse helper
    const parseJSON = <T = unknown>(s: string): T | null => {
      try {
        return JSON.parse(s) as T;
      } catch {
        return null;
      }
    };

    // Normalize unknown[] → PriceRow[]
    const normalizeRows = (itemsUnknown: unknown[]): PriceRow[] => {
      return itemsUnknown.map((rUnknown) => {
        const r = rUnknown as Record<string, unknown>;

        const currency = toISO3(r.ISOCurrency);
        const modelDesc = toStr(
          r.ModelDescription ?? r.Description ?? r["Description EN"]
        );

        const modelCode = toStr(r.ModelCode);
        const t = toStr(r.T1orT2);
        const tier: "T1" | "T2" =
          t === "T1" ? "T1" : t === "T2" ? "T2" : toNum(r.T2List) ? "T2" : "T1";

        const base: PriceRow = {
          Supplier: toStr(r.Supplier) || meta.supplier || "",
          Manufacturer: toStr(r.Manufacturer) || meta.manufacturer || "",
          ModelCode: modelCode,
          ModelDescription: modelDesc || modelCode || "",
          T1List: toNum(r.T1List),
          T1Cost: toNum(r.T1Cost),
          T2List: toNum(r.T2List),
          T2Cost: toNum(r.T2Cost),
          ISOCurrency: currency,
          ValidityDate: toStr(r.ValidityDate) || meta.validityDate || "",
          T1orT2: tier,
          MaterialID: toStr(r.MaterialID) || modelCode,
          SAPNumber: toStr(r.SAPNumber) || modelCode,
          ModelDescriptionEnglish: toStr(r.ModelDescriptionEnglish) || modelDesc,
          ModelDescriptionLanguage2: toStr(r.ModelDescriptionLanguage2),
          ModelDescriptionLanguage3: toStr(r.ModelDescriptionLanguage3),
          ModelDescriptionLanguage4: toStr(r.ModelDescriptionLanguage4),
          QuoteOrPriceList: toQuoteType(r.QuoteOrPriceList),
          WeightKg: toNum(r.WeightKg),
          HeightMm: toNum(r.HeightMm),
          LengthMm: toNum(r.LengthMm),
          WidthMm: toNum(r.WidthMm),
          PowerWatts: toNum(r.PowerWatts),
          FileName: toStr(r.FileName) || file.name,
        };

        // If model gave only one of T1/T2 prices, mirror into the selected tier for convenience
        if (tier === "T1" && base.T1List === 0 && base.T2List > 0) {
          base.T1List = base.T2List;
          base.T1Cost = base.T2Cost;
        } else if (tier === "T2" && base.T2List === 0 && base.T1List > 0) {
          base.T2List = base.T1List;
          base.T2Cost = base.T1Cost;
        }

        return base;
      });
    };

    try {
      setLoading(true);
      const schema = buildPriceRowSchema();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("schema", JSON.stringify(schema));

      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const bodyText = await res.text(); // read once

      // ---- Error path: try to salvage ----
      if (!res.ok) {
        type ExtractErr = { error?: string; detail?: string };
        const errObj = parseJSON<ExtractErr>(bodyText);

        // If server included raw model output in `detail`, try parsing it
        const detailText = typeof errObj?.detail === "string" ? errObj.detail : "";
        const detailJSON = detailText ? parseJSON<unknown>(detailText) : null;

        // Accept either { items: [...] } or a bare array
        let itemsUnknown: unknown[] = [];
        if (Array.isArray(detailJSON)) {
          itemsUnknown = detailJSON;
        } else if (
          detailJSON &&
          typeof detailJSON === "object" &&
          "items" in detailJSON &&
          Array.isArray((detailJSON as { items: unknown[] }).items)
        ) {
          itemsUnknown = (detailJSON as { items: unknown[] }).items;
        }

        if (itemsUnknown.length > 0) {
          setRows(normalizeRows(itemsUnknown));
          return;
        }

        const msg =
          (errObj?.error && String(errObj.error)) ||
          (detailText && String(detailText)) ||
          "AI extraction failed.";
        throw new Error(msg);
      }

      // ---- Success path ----
      const dataUnknown = parseJSON<unknown>(bodyText);
      if (dataUnknown == null) throw new Error("AI returned invalid JSON.");

      const candidate: unknown = hasItems(dataUnknown)
        ? (dataUnknown as AIContainer).items
        : dataUnknown;

      const itemsUnknown: unknown[] = Array.isArray(candidate) ? candidate : [];
      setRows(normalizeRows(itemsUnknown));
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "AI extraction failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6">
      {/* Wide workspace container */}
      <div className="mx-auto max-w-[1600px] grid gap-6 lg:grid-cols-2 xl:grid-cols-[520px_1fr]">
        {/* Left: inputs & actions */}
        <Card className="border bg-card">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">PDF to Structured Data</CardTitle>
            <span className="text-xs font-mono text-muted-foreground">
              AI powered Extractor
            </span>
          </CardHeader>

          <CardContent className="space-y-6">
            <FileUpload onFileSelect={handleFileSelect} />
            <MetaForm onChange={setMeta} />

            <div className="flex flex-wrap gap-3">
              <button
                className="border px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
                onClick={handleExtractFast}
                disabled={!file || loading}
                title="Fast heuristic parser (no AI)."
              >
                {loading ? "Processing..." : "Extract Data (fast)"}
              </button>

              <button
                className="border px-4 py-2 rounded bg-foreground text-background disabled:opacity-50"
                onClick={handleExtractAI}
                disabled={!file || loading}
                title="Use Gemini with a JSON Schema to reason about Supplier/Manufacturer/ModelCode."
              >
                {loading ? "Thinking…" : "Smart Extract (AI)"}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Right: live preview + results */}
        <Card className="border bg-card overflow-hidden">
          <CardHeader className="py-4">
            <CardTitle className="text-lg">Preview & Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview panel fills height and scrolls */}
            <div className="h-[58vh] min-h-[360px] w-full overflow-auto rounded border">
              {file ? (
                <InlinePdfPreview file={file} />
              ) : (
                <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">
                  Upload a PDF to preview it here.
                </div>
              )}
            </div>

            {/* Results table */}
            {rows.length > 0 && <ResultDisplay rows={rows} />}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
