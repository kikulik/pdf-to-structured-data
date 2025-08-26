// lib/pdfParseCJS.ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Shape of the result we care about
type PdfParseResult = {
  text: string;
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  version: string;
};

// Import the library file directly (skips the debug/ENOENT path in index.js)
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer,
  opts?: { max?: number; version?: string }
) => Promise<PdfParseResult>;

export default pdfParse;
