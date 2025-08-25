"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { PromptInput } from "@/components/PromptInput";
import { ResultDisplay } from "@/components/ResultDisplay";
import { FileIcon, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  // Use broad types here to avoid fighting JSON shapes coming back from the API
  const [schema, setSchema] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

      // 1) Get the JSON schema
      const schemaResponse = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!schemaResponse.ok) {
        const err = await safeJson(schemaResponse);
        const msg = (err?.error || "Failed to generate schema.") + (err?.detail ? `\n${err.detail}` : "");
        throw new Error(msg);
      }

      const schemaPayload = await schemaResponse.json();
      setSchema(schemaPayload?.schema);

      // 2) Process the PDF with the schema
      const formData = new FormData();
      formData.append("file", file);
      formData.append("schema", JSON.stringify(schemaPayload?.schema));

      const extractResponse = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!extractResponse.ok) {
        const err = await safeJson(extractResponse);
        const msg =
          (err?.error || "Failed to extract data.") +
          (err?.detail ? `\n${err.detail}` : "") +
          (err?.code ? `\nCode: ${err.code}` : "") +
          (err?.name ? `\nName: ${err.name}` : "");
        throw new Error(msg);
      }

      const data = await extractResponse.json();
      setResult(data);
    } catch (error: unknown) {
      const e = error as { message?: string };
      alert(e?.message || "Unexpected error.");
      console.error("Error processing request:", error);
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
              <FileIcon className="w-10 h-10 text-gray-200 dark:text-muted-foreground" />
              <span className="pl-4 font-mono font-xs text-muted-foreground">
                Processing...
              </span>
            </div>
          ) : (
            <ResultDisplay
              // ResultDisplay stringifies whatever it receives, so passing objects is fine
              result={result || ""}
              schema={schema || ""}
              onReset={handleReset}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Safely read a JSON error payload. If it isn't JSON, return an object with a generic message.
 */
async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    return { error: text || `HTTP ${res.status}` };
  }
}
