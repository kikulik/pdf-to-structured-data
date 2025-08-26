// lib/priceExtractor.ts
import { Buffer } from "node:buffer";
import pdfParse from "@/lib/pdfParseCJS";

/**
 * Output row schema (target structure)
 */
export type PriceRow = {
  Supplier: string;
  Manufacturer: string;
  ModelCode: string;
  ModelDescription: string;
  T1List: number;
  T1Cost: number;
  T2List: number;
  T2Cost: number;
  ISOCurrency: "EUR" | "USD" | "GBP";
  ValidityDate: string; // ISO or ""
  T1orT2: "T1" | "T2";
  MaterialID: string;
  SAPNumber: string;
  ModelDescriptionEnglish: string;
  ModelDescriptionLanguage2: string;
  ModelDescriptionLanguage3: string;
  ModelDescriptionLanguage4: string;
  QuoteOrPriceList: "Price List" | "Quote";
  WeightKg: number;
  HeightMm: number;
  LengthMm: number;
  WidthMm: number;
  PowerWatts: number;
  FileName: string; // source PDF name
};

type Meta = {
  supplier: string;
  manufacturer: string;
  validityDate: string; // ISO or ""
  fileName: string;
};

/* ----------------------- helpers ----------------------- */

const MODEL_RX = /([A-Z0-9][A-Z0-9._/-]{2,})/gi;
// be generous, we’ll filter after
const PRICE_RX = /([€$£]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\b(?:EUR|USD|GBP)\s*\d+(?:[.,]\d{2})?\b)/g;

const isBoilerplate = (l: string): boolean =>
  /\b(page\s*\d+|terms|validity|prepared for|price list|trade price|copyright)\b/i.test(l) ||
  /^\s*(?:$|\d+\s*\/\s*\d+)$/.test(l);

const isLikelyPrice = (t: string): boolean => {
  const s = t.trim();
  const dec = /[.,]\d{2}\b/.test(s);
  const sym = /[€$£]/.test(s) || /\b(?:EUR|USD|GBP)\b/i.test(s);
  const year = /\b20\d{2}\b/.test(s);
  const pageish = /page\s*\d+/i.test(s) || /\b\d+\s*\/\s*\d+\b/.test(s);
  return (sym || dec) && !year && !pageish;
};

// keep cents; normalize to 2 decimals
const parseMoney = (s: string): number => {
  let x = s.replace(/[^\d.,-]/g, "").trim();
  if (!x) return 0;
  const negative = x.startsWith("-");
  x = x.replace(/^-/, "");

  if (x.includes(",") && x.includes(".")) {
    const lastComma = x.lastIndexOf(",");
    const lastDot = x.lastIndexOf(".");
    if (lastComma > lastDot) x = x.replace(/\./g, "");
    else x = x.replace(/,/g, "");
  }
  x = x.replace(",", ".");
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  const v = negative ? -n : n;
  return Math.round(v * 100) / 100;
};

const currencyFromText = (txt: string): "EUR" | "USD" | "GBP" => {
  if (/[€]|EUR\b/i.test(txt)) return "EUR";
  if (/[$]|USD\b/i.test(txt)) return "USD";
  if (/[£]|GBP\b/i.test(txt)) return "GBP";
  const m = txt.match(/[€$£]/);
  if (m?.[0] === "€") return "EUR";
  if (m?.[0] === "$") return "USD";
  if (m?.[0] === "£") return "GBP";
  return "EUR";
};

// very light meta guess if user leaves inputs empty
function guessMetaFromText(text: string): Partial<Meta> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const top = lines.slice(0, 50).join("\n");

  let mfg = "";
  const capLines = top
    .split("\n")
    .filter((l) => /^[A-Z0-9 ()&.,/-]{6,}$/.test(l) && !/PRICE\s*LIST/i.test(l));
  if (capLines.length) {
    mfg = capLines
      .sort((a, b) => b.length - a.length)[0]
      .replace(/\s*[.,:;-]+$/, "")
      .trim();
  }

  let validity = "";
  const dateMatch =
    top.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/) ||
    top.match(/\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b/) ||
    top.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}\b/i);
  if (dateMatch) validity = dateMatch[0];

  return {
    supplier: mfg || undefined,
    manufacturer: mfg || undefined,
    validityDate: validity || undefined,
  };
}

const labelFromContext = (context: string): "T1" | "T2" => {
  if (/\b(MSRP|list|retail)\b/i.test(context)) return "T1";
  if (/\b(net|dealer|trade|discount|offer)\b/i.test(context)) return "T2";
  return "T2";
};

const makeRow = (
  meta: Meta,
  currency: PriceRow["ISOCurrency"],
  modelCode: string,
  desc: string,
  priceValue: number,
  tier: "T1" | "T2"
): PriceRow => {
  const description = desc.trim() || modelCode;
  const base: PriceRow = {
    Supplier: meta.supplier || "",
    Manufacturer: meta.manufacturer || "",
    ModelCode: modelCode,
    ModelDescription: description,
    T1List: 0,
    T1Cost: 0,
    T2List: 0,
    T2Cost: 0,
    ISOCurrency: currency,
    ValidityDate: meta.validityDate || "",
    T1orT2: tier,
    MaterialID: modelCode,
    SAPNumber: modelCode,
    ModelDescriptionEnglish: description,
    ModelDescriptionLanguage2: "LANGUAGE 2",
    ModelDescriptionLanguage3: "LANGUAGE 3",
    ModelDescriptionLanguage4: "LANGUAGE 4",
    QuoteOrPriceList: "Price List",
    WeightKg: 0,
    HeightMm: 0,
    LengthMm: 0,
    WidthMm: 0,
    PowerWatts: 0,
    FileName: meta.fileName,
  };
  if (tier === "T1") {
    base.T1List = priceValue;
    base.T1Cost = priceValue;
  } else {
    base.T2List = priceValue;
    base.T2Cost = priceValue;
  }
  return base;
};

function toBuffer(input: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u8.byteLength === 0) {
    throw new Error("Uploaded PDF is empty (0 bytes).");
  }
  return Buffer.from(u8);
}

/* ----------------------- main API ----------------------- */

export async function extractFromPdf(
  file: ArrayBuffer | Uint8Array | Buffer,
  meta: Meta
): Promise<PriceRow[]> {
  // parse PDF text using the safe CJS wrapper (avoids pdf-parse debug ENOENT)
  const buf = toBuffer(file);
  const parsed = await pdfParse(buf);
  const fullText = parsed.text || "";
  const currency = currencyFromText(fullText);

  // Merge optional user meta with guesses
  const guessed = guessMetaFromText(fullText);
  const mergedMeta: Meta = {
    supplier: meta.supplier || guessed.supplier || "",
    manufacturer: meta.manufacturer || guessed.manufacturer || "",
    validityDate: meta.validityDate || guessed.validityDate || "",
    fileName: meta.fileName,
  };

  // break into lines, remove obvious header/footer noise
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !isBoilerplate(l));

  const rows: PriceRow[] = [];
  let contextCodes: string[] = [];
  const contextDesc: string[] = [];

  const pushContext = (line: string) => {
    const codes = Array.from(line.matchAll(MODEL_RX))
      .map((m) => m[1])
      .filter((c) => /[A-Za-z]/.test(c) && /\d/.test(c));
    if (codes.length) contextCodes = codes.slice(-6);

    // description context without numbers that look like prices
    const cleaned = line.replace(PRICE_RX, "").trim();
    if (cleaned) {
      contextDesc.push(cleaned);
      if (contextDesc.length > 6) contextDesc.shift();
    }
  };

  for (const line of lines) {
    pushContext(line);

    const rawPrices = Array.from(line.matchAll(PRICE_RX))
      .map((m) => m[1])
      .filter(isLikelyPrice);
    if (!rawPrices.length) continue;

    for (const token of rawPrices) {
      const model = contextCodes[contextCodes.length - 1] || `ITEM_${rows.length + 1}`;
      const desc = contextDesc.slice(-3).join(" ") || "Price Item";
      const tier = labelFromContext(contextDesc.slice(-4).join(" ") + " " + line);
      const price = parseMoney(token);

      if (price === 0) continue; // skip junk like "0,00" padding

      rows.push(makeRow(mergedMeta, currency, model, desc, price, tier));
    }
  }

  // de-dup: include description fragment & currency to avoid over-collapsing
  const dedupKey = (r: PriceRow) =>
    [
      r.ModelCode.trim(),
      r.ModelDescription.replace(/\s+/g, " ").trim().slice(0, 80),
      r.T1orT2,
      r.T1List || r.T2List,
      r.ISOCurrency,
    ].join("|");

  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const key = dedupKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped;
}
