declare module "pdf-parse" {
  export interface PDFParseOptions {
    pagerender?(pageData: unknown): Promise<string> | string;
    max?: number;
    version?: string;
  }

  export interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }

  const pdfParse: (
    data: Buffer | Uint8Array | ArrayBuffer,
    options?: PDFParseOptions
  ) => Promise<PDFParseResult>;

  export default pdfParse;
}
