// lib/pdfParseCJS.ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

type PdfParseResult = {
  text: string;
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  version: string;
};

// Import pdf-parse's internal library file (bypasses index.js debug path)
const base = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer,
  opts?: { max?: number; version?: string }
) => Promise<PdfParseResult>;

/**
 * Pick a pdfjs-dist build folder that actually exists.
 * - Prefer 'legacy/build/pdf.js' if available (present in many versions).
 * - Otherwise let pdf-parse use its default 'build/pdf.js'.
 */
function pickVersion():
  | { version: "legacy" }
  | undefined {
  try {
    require.resolve("pdfjs-dist/legacy/build/pdf.js");
    return { version: "legacy" };
  } catch {
    return undefined; // default path: pdfjs-dist/build/pdf.js
  }
}

export default function pdfParse(buf: Buffer) {
  const opts = pickVersion();
  return base(buf, opts as any);
}
