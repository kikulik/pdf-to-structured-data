"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import MetaForm from "@/components/MetaForm";
import ResultDisplay from "@/components/ResultDisplay";
import InlinePdfPreview from "@/components/InlinePdfPreview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PriceRow } from "@/lib/priceExtractor";

type Meta = {
  supplier: string;
  manufacturer: string;
  validityDate: string; // ISO 8601 or ""
};

type ItemsPayload = {
  items?: PriceRow[] | Record<string, PriceRow>;
};

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

  const handleExtract = async () => {
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

  return (
    <main className="min-h-screen p-6">
      {/* Wide workspace container */}
      <div className="mx-auto max-w-[1600px] grid gap-6 lg:grid-cols-2 xl:grid-cols-[520px_1fr]">
        {/* Left: inputs & actions */}
        <Card className="border bg-card">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">PDF to Structured Data</CardTitle>
            <span className="text-xs font-mono text-muted-foreground">
              Vendor-agnostic PDF price parser
            </span>
          </CardHeader>

          <CardContent className="space-y-6">
            <FileUpload onFileSelect={handleFileSelect} />
            <MetaForm onChange={setMeta} />

            <div className="flex gap-3">
              <button
                className="border px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
                onClick={handleExtract}
                disabled={!file || loading}
              >
                {loading ? "Processing..." : "Extract Data"}
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
            {/* Preview panel takes height and scrolls */}
            <div className="h-[58vh] min-h-[360px] w-full overflow-auto rounded border">
              {file ? (
                <InlinePdfPreview file={file} />
              ) : (
                <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">
                  Upload a PDF to preview it here.
                </div>
              )}
            </div>

            {/* Results table fills the rest */}
            {rows.length > 0 && <ResultDisplay rows={rows} />}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
