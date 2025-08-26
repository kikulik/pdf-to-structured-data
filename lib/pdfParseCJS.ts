// lib/pdfParseCJS.ts
import { createRequire } from "node:module";
import type { Buffer } from "node:buffer";

const require = createRequire(import.meta.url);

export type PdfParseResult = {
  text: string;
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  version: string;
};

type PdfParseOptions = {
  max?: number;
  version?: string;
};

type PdfParseFn = (data: Buffer, opts?: PdfParseOptions) => Promise<PdfParseResult>;

// Import pdf-parse's internal library file (bypasses index.js debug path)
const base: PdfParseFn = require("pdf-parse/lib/pdf-parse.js");

/**
 * Pick a pdfjs-dist build folder that actually exists.
 * - Prefer 'legacy/build/pdf.js' if available (present in many versions).
 * - Otherwise let pdf-parse use its default 'build/pdf.js'.
 */
function pickVersion(): PdfParseOptions | undefined {
  try {
    require.resolve("pdfjs-dist/legacy/build/pdf.js");
    return { version: "legacy" };
  } catch {
    return undefined; // default path: pdfjs-dist/build/pdf.js
  }
}

export default function pdfParse(buf: Buffer): Promise<PdfParseResult> {
  const opts = pickVersion();
  return base(buf, opts);
}
