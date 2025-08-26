import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  type GenerateContentResult,
  type ResponseSchema,
} from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing required env var: GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

/* ---------- Unicode + JSON cleanup helpers ---------- */

// Normalize Unicode quotes & spaces the model sometimes uses
function normalizeUnicode(s: string): string {
  return s
    // curly double quotes → "
    .replace(/[\u201C\u201D\u2033]/g, '"')
    // curly single quotes → '
    .replace(/[\u2018\u2019\u2032]/g, "'")
    // various spaces → normal space
    .replace(/[\u00A0\u2000-\u200D\u202F\u205F\u3000\uFEFF]/g, " ")
    // line/paragraph separators
    .replace(/[\u2028\u2029]/g, "\n");
}

// Escape raw control chars inside quoted strings (illegal in JSON)
function escapeControlCharsInStrings(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);

    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }

    if (inStr && code < 0x20) {
      // map common controls
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      if (ch === "\b") { out += "\\b"; continue; }
      if (ch === "\f") { out += "\\f"; continue; }
      // other controls → \u00XX
      out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out;
}

function sanitizeJsonString(text: string): string {
  let s = (text ?? "").trim();

  // Strip ``` fences
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }

  // Remove chatty preambles
  s = s.replace(/^\s*(?:here(?:'s| is)\s+)?(?:the\s+)?(?:json|output|result|response)\s*:?\s*/i, "");

  // Kill JS-style comments
  s = s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // Normalize weird Unicode
  s = normalizeUnicode(s);

  // Trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // bare items: [...] → wrap
  if (!s.startsWith("{") && /^\s*items\s*:\s*\[/.test(s)) s = `{${s}}`;

  // Escape illegal controls inside strings
  s = escapeControlCharsInStrings(s);

  return s;
}

// Bracket-aware scan to find the first JSON array that looks like items
function extractLikelyItemsArray(raw: string): string | null {
  const s = raw;
  let inStr = false, esc = false, depth = 0, start = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        const slice = s.slice(start, i + 1);
        if (/"ModelCode"\s*:/.test(slice) || /"ModelDescription"\s*:/.test(slice)) {
          return slice;
        }
        start = -1;
      }
    }
  }
  return null;
}

function tryParseJSON(raw: string): unknown | undefined {
  const clean = sanitizeJsonString(raw);

  // 1) direct
  try { return JSON.parse(clean); } catch {}

  // 2) salvage first {...}
  const so = clean.indexOf("{"), eo = clean.lastIndexOf("}");
  if (so !== -1 && eo > so) {
    const slice = clean.slice(so, eo + 1);
    try { return JSON.parse(slice); } catch {}
  }

  // 3) salvage first [...]
  const sa = clean.indexOf("["), ea = clean.lastIndexOf("]");
  if (sa !== -1 && ea > sa) {
    const slice = clean.slice(sa, ea + 1);
    try { return JSON.parse(slice); } catch {}
  }

  // 4) bracket-aware items array → wrap as { items: [...] }
  const items = extractLikelyItemsArray(clean);
  if (items) {
    try {
      const arr = JSON.parse(items);
      return { items: arr };
    } catch {}
  }

  return undefined;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/* ---------- Route ---------- */

export async function POST(request: Request) {
  try {
    const genAI = getGenAI();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const schemaRaw = formData.get("schema") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
    if (!schemaRaw) return NextResponse.json({ error: "No schema provided." }, { status: 400 });

    const MAX_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large." }, { status: 413 });

    // Parse schema
    let schemaParsed: unknown;
    try { schemaParsed = JSON.parse(schemaRaw); }
    catch { return NextResponse.json({ error: "Invalid JSON schema." }, { status: 400 }); }
    if (!isPlainObject(schemaParsed)) {
      return NextResponse.json({ error: "Schema must be a JSON object." }, { status: 400 });
    }
    const responseSchema: ResponseSchema = schemaParsed as ResponseSchema;

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema,
      },
      systemInstruction:
        "You convert a PDF into structured data. Return ONLY valid JSON that matches the provided schema. " +
        "Do not include markdown code fences, comments, or extra fields. " +
        "If a table cell lists multiple model codes separated by '/', output them as separate items with identical fields except ModelCode. " +
        "Fill numeric fields with 0 when missing. Use ISO currency like EUR, USD, GBP.",
    });

    const basePrompt =
      "Extract the structured data from the following PDF file. Return only JSON conforming to the provided schema.";

    let result: GenerateContentResult;

    const INLINE_LIMIT = 18 * 1024 * 1024;
    if (file.size <= INLINE_LIMIT) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      result = await model.generateContent([
        { text: basePrompt },
        { inlineData: { mimeType: "application/pdf", data: base64 } },
      ]);
    } else {
      return NextResponse.json(
        { error: "PDF is too large for inline processing (> ~18MB)." },
        { status: 413 }
      );
    }

    const response = await result.response;
    const raw = response.text();

    const parsed = tryParseJSON(raw);
    if (parsed === undefined) {
      console.error("Model returned non-JSON (first 2k):", raw.slice(0, 2000));
      return NextResponse.json(
        { error: "Model returned non-JSON.", detail: raw.slice(0, 2000) },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const e = err as { message?: string; name?: string; status?: number; code?: string };

    let status = typeof e?.status === "number" ? e.status : 500;
    const msg = (e?.message || "").toLowerCase();
    if (status === 500) {
      if (msg.includes("model") && msg.includes("not found")) status = 404;
      else if (msg.includes("invalid") && msg.includes("schema")) status = 400;
      else if (msg.includes("permission") || msg.includes("unauthorized")) status = 401;
      else if (msg.includes("rate limit") || msg.includes("quota")) status = 429;
      else if (msg.includes("too large") || msg.includes("content length") || msg.includes("payload too large")) status = 413;
    }

    return NextResponse.json(
      { error: "Extraction failed.", detail: e?.message ?? "Unknown error", code: e?.code ?? undefined, name: e?.name ?? undefined },
      { status }
    );
  }
}
