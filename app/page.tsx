"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import MetaForm from "@/components/MetaForm";
import ResultDisplay from "@/components/ResultDisplay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({
    supplier: "UAB TVC Solutions",
    manufacturer: "Unknown",
    validityDate: "2154-12-31T00:00:00",
  });
  const [rows, setRows] = useState<any[]>([]);
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
      const res = await fetch("/api/parse", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to parse PDF.");
      }
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        setRows(data.items);
      } else if (data && data.items) {
        // if items is an object, convert to array
        setRows(Object.values(data.items));
      } else {
        setRows([]);
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Unexpected error while extracting data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-8">
      <Card className="w-full max-w-3xl border-0 bg-card shadow-none">
        <CardHeader className="flex flex-col items-center justify-center space-y-2">
          <CardTitle className="flex items-center gap-2 text-foreground">
            PDF to Structured Data
          </CardTitle>
          <span className="text-sm font-mono text-muted-foreground">
            Vendor‑agnostic PDF price parser
          </span>
        </CardHeader>
        <CardContent className="space-y-6 pt-6 w-full">
          <FileUpload onFileSelect={handleFileSelect} />
          <MetaForm onChange={setMeta} />
          <button
            className="border px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
            onClick={handleExtract}
            disabled={!file || loading}
          >
            {loading ? "Processing..." : "Extract Data"}
          </button>
          {rows.length > 0 && <ResultDisplay rows={rows} />}
        </CardContent>
      </Card>
    </main>
  );
}
