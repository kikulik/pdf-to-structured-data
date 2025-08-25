"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { PromptInput } from "@/components/PromptInput";
import { ResultDisplay } from "@/components/ResultDisplay";
import { FileIcon, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MetaForm from "@/components/MetaForm";


/** Narrow an unknown JSON value into a simple error payload shape */
function toErrorPayload(u: unknown): {
  error?: string;
  detail?: string;
  code?: string;
  name?: string;
} {
  if (u && typeof u === "object") {
    const o = u as Record<string, unknown>;
    return {
      error: typeof o.error === "string" ? o.error : undefined,
      detail: typeof o.detail === "string" ? o.detail : undefined,
      code: typeof o.code === "string" ? o.code : undefined,
      name: typeof o.name === "string" ? o.name : undefined,
    };
  }
  return {};
}

/** Safely read JSON; if not JSON, return a basic payload with the raw text */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    return { error: text || `HTTP ${res.status}` };
  }
}

export default function Home() {
  // Use unknown to avoid eslint "any" and to keep flexibility
  const [schema, setSchema] = useState<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({ supplier: "UAB TVC Solutions", manufacturer: "Unknown", validityDate: "2154-12-31T00:00:00" });
  const [parsedRows, setParsedRows] = useState<any[]>([])

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const handlePromptSubmit = async (prompt: string) => {
    if (!file) {
      alert("Please upload a PDF before extracting.");
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      // 1) Generate schema
      const schemaResponse = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!schemaResponse.ok) {
        const raw = await safeJson(schemaResponse);
        const err = toErrorPayload(raw);
        const msg =
          (err.error ?? "Failed to generate schema.") +
          (err.detail ? `\n${err.detail}` : "");
        throw new Error(msg);
      }

      const schemaPayload: unknown = await schemaResponse.json();
      const sObj =
        schemaPayload &&
        typeof schemaPayload === "object" &&
        "schema" in schemaPayload
          ? (schemaPayload as { schema?: unknown }).schema
          : undefined;

      setSchema(sObj ?? null);

      // 2) Extract using the schema
      const formData = new FormData();
      formData.append("file", file);
      if (sObj !== undefined) {
        formData.append("schema", JSON.stringify(sObj));
      }

      const extractResponse = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!extractResponse.ok) {
        const raw = await safeJson(extractResponse);
        const err = toErrorPayload(raw);
        const msg =
          (err.error ?? "Failed to extract data.") +
          (err.detail ? `\n${err.detail}` : "") +
          (err.code ? `\nCode: ${err.code}` : "") +
          (err.name ? `\nName: ${err.name}` : "");
        throw new Error(msg);
      }

      const data: unknown = await extractResponse.json();
      setResult(data);
    } catch (error: unknown) {
      const e = error as { message?: string };
      alert(e?.message ?? "Unexpected error.");
      // Keep a detailed log in console for debugging
      /* eslint-disable no-console */
      console.error("Error processing request:", error);
      /* eslint-enable no-console */
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setSchema(null);
    setLoading(false);
  };

  // Convert unknowns to strings for ResultDisplay (which expects strings)
  const resultForDisplay =
    typeof result === "string"
      ? result
      : JSON.stringify(result ?? "", null, 2);

  const schemaForDisplay =
    typeof schema === "string"
      ? schema
      : JSON.stringify(schema ?? "", null, 2);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-8">
      <Card className="w-full max-w-2xl border-0 bg-card shadow-none">
        <CardHeader className="flex flex-col items-center justify-center space-y-2">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <FileText className="w-8 h-8 text-primary" />
            PDF to Structured Data
          </CardTitle>
          <span className="text-sm font-mono text-muted-foreground">
            powered by Google DeepMind Gemini 2.0 Flash
          </span>
        </CardHeader>

        <CardContent className="space-y-6 pt-6 w-full">
          {!result && !loading ? (
            <>
              <FileUpload onFileSelect={handleFileSelect} />
              <PromptInput onSubmit={handlePromptSubmit} file={file} />
            </>
          ) : loading ? (
            <div
              role="status"
              className="flex items-center mx-auto justify-center h-56 max-w-sm bg-gray-300 rounded-lg animate-pulse dark:bg-secondary"
            >
              <FileIcon className="w-10 h-10 text-gray-2 00 dark:text-muted-foreground" />
              <span className="pl-4 font-mono font-xs text-muted-foreground">
                Processing...
              </span>
            </div>
          ) : (
            <ResultDisplay
              result={resultForDisplay}
              schema={schemaForDisplay}
              onReset={handleReset}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
