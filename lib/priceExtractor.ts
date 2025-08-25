// --- schema your app emits (matches your “3D BULLET RIG” example) ---
export async function extractFromPdf(
  file: ArrayBuffer,
  meta: Meta
): Promise<PriceRow[]> {
  const { default: pdfParse } = await import("pdf-parse"); // <-- lazy import

  const buf = Buffer.from(file);
  const parsed = await pdfParse(buf);
  const text = parsed.text || "";

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
  ValidityDate: string; // ISO 8601
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
  FileName: string;
};

type Meta = {
  supplier: string;
  manufacturer: string;
  validityDate: string; // ISO
  fileName: string;
};

const currencyFromText = (txt: string): "EUR" | "USD" | "GBP" => {
  if (txt.includes("€") || /\bEUR\b/i.test(txt)) return "EUR";
  if (txt.includes("$") || /\bUSD\b/i.test(txt)) return "USD";
  if (txt.includes("£") || /\bGBP\b/i.test(txt)) return "GBP";
  // fallback
  return "EUR";
};

// normalize number strings like “4.377,00” or “4,377.00” or “4395”
const parseMoney = (s: string): number => {
  let x = s.replace(/[^\d.,]/g, "").trim();
  if (!x) return 0;
  // if both , and . exist, assume last two digits are cents, remove the thousands sep
  // “4.377,00” -> “4377,00”; “4,377.00” -> “4377.00”
  if (x.includes(",") && x.includes(".")) {
    const lastComma = x.lastIndexOf(",");
    const lastDot = x.lastIndexOf(".");
    if (lastComma > lastDot) x = x.replace(/\./g, ""); // 1.234,56
    else x = x.replace(/,/g, ""); // 1,234.56
  }
  // now there’s at most one separator
  x = x.replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n) : 0; // emit whole units like your sample
};

// very permissive model-code matcher (letters/digits/slashes/dots/dashes/underscores)
const MODEL_RX = /([A-Z0-9][A-Z0-9._/-]{2,})/gi;

// price token with or without currency sign
const PRICE_RX = /([€$£]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;

// Heuristic: walk lines; when we see a price, use recent tokens above/left as code+desc
const makeRow = (meta: Meta, currency: PriceRow["ISOCurrency"], modelCode: string, desc: string, priceToken: string): PriceRow => {
  const price = parseMoney(priceToken);
  const description = desc.trim() || modelCode;
  return {
    Supplier: meta.supplier,
    Manufacturer: meta.manufacturer,
    ModelCode: modelCode,
    ModelDescription: description,
    T1List: 0,
    T1Cost: 0,
    T2List: price,
    T2Cost: price,
    ISOCurrency: currency,
    ValidityDate: meta.validityDate,
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
  const buf = Buffer.from(file);
  const parsed = await pdfParse(buf);
  const text = parsed.text || "";
  const currency = currencyFromText(text);

  // split into lines and do a rolling window
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const rows: PriceRow[] = [];
  // keep a sliding buffer of recent “context” tokens
  let contextCodes: string[] = [];
  const contextDesc: string[] = [];

  const pushContext = (line: string) => {
    // accumulate potential model codes
    const codes = Array.from(line.matchAll(MODEL_RX))
      .map(m => m[1])
      .filter(c => /[A-Za-z]/.test(c) && /\d/.test(c)); // require alnum mix
    if (codes.length) contextCodes = codes.slice(-6);

    // description candidates: words minus raw currency tokens
    const cleaned = line.replace(PRICE_RX, "").trim();
    if (cleaned) {
      // keep last few description lines
      contextDesc.push(cleaned);
      if (contextDesc.length > 4) contextDesc.shift();
    }
  };

  for (const line of lines) {
    // collect context first
    pushContext(line);

    // find one or more prices in this line
    const priceMatches = Array.from(line.matchAll(PRICE_RX)).map(m => m[1]).filter(Boolean);
    if (!priceMatches.length) continue;

    // for each price, emit a row. try to pair with the last seen model code, else synthesize one
    for (const priceToken of priceMatches) {
      const model = contextCodes[contextCodes.length - 1] || `ITEM_${rows.length + 1}`;
      const desc = contextDesc.slice(-2).join(" ") || "Price Item";
      rows.push(makeRow(meta, currency, model, desc, priceToken));
    }
  }

  // simple de-dup: model+price
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    const key = `${r.ModelCode}|${r.T2List}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped;
}
