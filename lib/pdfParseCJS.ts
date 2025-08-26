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
  // NOTE: we intentionally do NOT set "version" here to avoid bad paths like
  // "./legacy/build/pdf.js" or "./v3.11.174/build/pdf.js".
};

type PdfParseFn = (data: Buffer, opts?: PdfParseOptions) => Promise<PdfParseResult>;

// Import pdf-parse's internal library file (skips the buggy index.js)
const base: PdfParseFn = require("pdf-parse/lib/pdf-parse.js");

/**
 * Call pdf-parse without a version override so it resolves to
 * 'pdfjs-dist/build/pdf.js' by default. This avoids "Cannot find module './legacy/build/pdf.js'".
 */
export default function pdfParse(buf: Buffer): Promise<PdfParseResult> {
  return base(buf); // no version passed
}
