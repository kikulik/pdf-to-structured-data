import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  type GenerateContentResult,
  type ResponseSchema,
} from "@google/generative-ai";

export const dynamic = "force-dynamic";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing required env var: GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

const MODEL_ID = "gemini-2.0-flash";

/** Strip code fences, BOM/nbsp, trailing commas; then salvage the first top-level {...} JSON block if needed. */
function sanitizeJsonString(text: string): string {
  let s = text.trim();

  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }

  s = s.replace(/^\uFEFF/, "").replace(/\u00A0/g, " ");
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

function tryParseJSON(raw: string): unknown | undefined {
  const clean = sanitizeJsonString(raw);
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = clean.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {}
    }
  }
  return undefined;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

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

    // Parse and validate schema
    let schemaParsed: unknown;
    try {
      schemaParsed = JSON.parse(schemaRaw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON schema." }, { status: 400 });
    }
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
      // steer the model to produce clean JSON and split multi-codes
      systemInstruction:
        "You convert a PDF into structured data. Return ONLY valid JSON that matches the provided schema. " +
        "Do not include markdown code fences, comments, or extra fields. " +
        "If a table cell lists multiple model codes separated by '/', output them as separate items with identical fields except ModelCode. " +
        "Fill numeric fields with 0 when missing. Use ISO currency like EUR, USD, GBP.",
    });

    const basePrompt =
      "Extract the structured data from the following PDF file. Return only JSON conforming to the provided schema.";

    let result: GenerateContentResult;

    const INLINE_LIMIT = 18 * 1024 * 1024; // ~18MB inline
    if (file.size <= INLINE_LIMIT) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      result = await model.generateContent([
        { text: basePrompt },
        { inlineData: { mimeType: "application/pdf", data: base64 } },
      ]);
    } else {
      return NextResponse.json(
        { error: "PDF is too large for inline processing (> ~18MB). Please upload a smaller file or compress the PDF." },
        { status: 413 }
      );
    }

    const response = await result.response;
    const raw = response.text();

    const parsed = tryParseJSON(raw);
    if (parsed === undefined) {
      return NextResponse.json(
        { error: "Model returned non-JSON.", detail: raw.slice(0, 2000) },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const e = err as {
      message?: string;
      name?: string;
      status?: number;
      code?: string;
      stack?: string;
    };

    console.error("Error extracting data:", e);

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
      {
        error: "Extraction failed.",
        detail: e?.message ?? "Unknown error",
        code: e?.code ?? undefined,
        name: e?.name ?? undefined,
      },
      { status }
    );
  }
}
