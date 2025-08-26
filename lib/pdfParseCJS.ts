// lib/pdfParseCJS.ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Import the library file, NOT the package root.
const pdfParse: (buf: Buffer, opts?: { max?: number; version?: string }) => Promise<{
  text: string;
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  version: string;
}> = require("pdf-parse/lib/pdf-parse.js");

export default pdfParse;
