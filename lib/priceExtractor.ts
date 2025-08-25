// lib/priceExtractor.ts

// --- schema your app emits (matches your “3D BULLET RIG” example) ---
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
  ValidityDate: string; // ISO 8601 or ""
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
  FileName: string; // we use source PDF name here
};

type Meta = {
  supplier: string;
  manufacturer: string;
  validityDate: string; // ISO or ""
  fileName: string;
};

const currencyFromText = (txt: string): "EUR" | "USD" | "GBP" => {
  if (txt.includes("€") || /\bEUR\b/i.test(txt)) return "EUR";
  if (txt.includes("$") || /\bUSD\b/i.test(txt)) return "USD";
  if (txt.includes("£") || /\bGBP\b/i.test(txt)) return "GBP";
  return "EUR";
};

// normalize number strings like “4.377,00” or “4,377.00” or “4395”
const parseMoney = (s: string): number => {
  let x = s.replace(/[^\d.,]/g, "").trim();
  if (!x) return 0;
  if (x.includes(",") && x.includes(".")) {
    const lastComma = x.lastIndexOf(",");
    const lastDot = x.lastIndexOf(".");
    if (lastComma > lastDot) x = x.replace(/\./g, "");
    else x = x.replace(/,/g, "");
  }
  x = x.replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const MODEL_RX = /([A-Z0-9][A-Z0-9._/-]{2,})/gi;
const PRICE_RX = /([€$£]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;

// very light heuristics to guess meta if user left them blank
function guessMetaFromText(text: string): Partial<Meta> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const top = lines.slice(0, 50).join("\n");

  // Manufacturer/Supplier: pick the longest ALL-CAPS word group near the top that isn't “PRICE LIST”
  let mfg = "";
  const capLines = top.split("\n").filter(l =>
    /^[A-Z0-9 ()&.,/-]{6,}$/.test(l) && !/PRICE\s*LIST/i.test(l)
  );
  if (capLines.length) {
    mfg = capLines.sort((a,b)=>b.length-a.length)[0];
    // strip trailing punctuation
    mfg = mfg.replace(/\s*[.,:;-]+$/, "").trim();
  }

  // Validity date: try YYYY-MM-DD or DD/MM/YYYY or Month YYYY
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

const makeRow = (
  meta: Meta,
  currency: PriceRow["ISOCurrency"],
  modelCode: string,
  desc: string,
  priceToken: string
): PriceRow => {
  const price = parseMoney(priceToken);
  const description = desc.trim() || modelCode;
  return {
    Supplier: meta.supplier || "",
    Manufacturer: meta.manufacturer || "",
    ModelCode: modelCode,
    ModelDescription: description,
    T1List: 0,
    T1Cost: 0,
    T2List: price,
    T2Cost: price,
    ISOCurrency: currency,
    ValidityDate: meta.validityDate || "",
    T1orT2: "T2",
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
};

export async function extractFromPdf(
  file: ArrayBuffer,
  meta: Meta
): Promise<PriceRow[]> {
  // lazy-load to avoid build-time analysis; only load when the route is called
  const { default: pdfParse } = await import("pdf-parse");

  const buf = Buffer.from(file);
  const parsed = await pdfParse(buf);
  const text = parsed.text || "";
  const currency = currencyFromText(text);

  // Merge user-provided (optional) meta with guesses
  const guessed = guessMetaFromText(text);
  const mergedMeta: Meta = {
    supplier: meta.supplier || guessed.supplier || "",
    manufacturer: meta.manufacturer || guessed.manufacturer || "",
    validityDate: meta.validityDate || guessed.validityDate || "",
    fileName: meta.fileName,
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const rows: PriceRow[] = [];
  let contextCodes: string[] = [];
  const contextDesc: string[] = [];

  const pushContext = (line: string) => {
    const codes = Array.from(line.matchAll(MODEL_RX))
      .map((m) => m[1])
      .filter((c) => /[A-Za-z]/.test(c) && /\d/.test(c));
    if (codes.length) contextCodes = codes.slice(-6);

    const cleaned = line.replace(PRICE_RX, "").trim();
    if (cleaned) {
      contextDesc.push(cleaned);
      if (contextDesc.length > 4) contextDesc.shift();
    }
  };

  for (const line of lines) {
    pushContext(line);

    const priceMatches = Array.from(line.matchAll(PRICE_RX))
      .map((m) => m[1])
      .filter(Boolean);
    if (!priceMatches.length) continue;

    for (const priceToken of priceMatches) {
      const model = contextCodes[contextCodes.length - 1] || `ITEM_${rows.length + 1}`;
      const desc = contextDesc.slice(-2).join(" ") || "Price Item";
      rows.push(makeRow(mergedMeta, currency, model, desc, priceToken));
    }
  }

  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const key = `${r.ModelCode}|${r.T2List}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped;
}
