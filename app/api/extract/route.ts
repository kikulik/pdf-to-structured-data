// app/api/extract/route.ts
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

// Allow overriding via env if you want to switch models without redeploying
const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

/** Strip code fences, BOM/NBSP, comments, trailing commas; tolerate bare `items: [...]`. */
function sanitizeJsonString(text: string): string {
  let s = text.trim();

  // Remove markdown code fences if present
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }

  // Remove common lead-ins the model may add
  s = s.replace(/^\s*(?:here(?:'s| is)\s+)?(?:the\s+)?(?:json|output|result|response)\s*:?\s*/i, "");

  // Strip JS-style comments just in case
  s = s.replace(/^\s*\/\/.*$/gm, ""); // // line comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, ""); // /* block comments */

  // Remove BOM and non-breaking spaces
  s = s.replace(/^\uFEFF/, "").replace(/\u00A0/g, " ");

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // If it's a bare items: [...] payload without surrounding braces, wrap it
  if (!s.startsWith("{") && /^\s*items\s*:\s*\[/.test(s)) {
    s = `{${s}}`;
  }

  return s;
}

function tryParseJSON(raw: string): unknown | undefined {
  const clean = sanitizeJsonString(raw);
  try {
    return JSON.parse(clean);
  } catch {
    // Try to salvage the first top-level {...} or [...] block
    const startObj = clean.indexOf("{");
    const endObj = clean.lastIndexOf("}");
    if (startObj !== -1 && endObj > startObj) {
      const slice = clean.slice(startObj, endObj + 1);
      try {
        return JSON.parse(slice);
      } catch {
        /* fall through */
      }
    }
    const startArr = clean.indexOf("[");
    const endArr = clean.lastIndexOf("]");
    if (startArr !== -1 && endArr > startArr) {
      const slice = clean.slice(startArr, endArr + 1);
      try {
        return JSON.parse(slice);
      } catch {
        /* fall through */
      }
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

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!schemaRaw) {
      return NextResponse.json({ error: "No schema provided." }, { status: 400 });
    }

    const MAX_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large." }, { status: 413 });
    }

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
      systemInstruction:
        "You convert a PDF into structured data. Return ONLY valid JSON that matches the provided schema. " +
        "Do not include markdown code fences, comments, or extra fields. " +
        "If a table cell lists multiple model codes separated by '/', output them as separate items with identical fields except ModelCode. " +
        "Fill numeric fields with 0 when missing. Use ISO currency like EUR, USD, GBP.",
    });

    const basePrompt =
      "Extract the structured data from the following PDF file. Return only JSON conforming to the provided schema.";

    let result: GenerateContentResult;

    // Send the PDF inline (Gemini inline input size is limited; we gate bigger files)
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
        {
          error:
            "PDF is too large for inline processing (> ~18MB). Please upload a smaller file or compress the PDF.",
        },
        { status: 413 }
      );
    }

    const response = await result.response;
    const raw = response.text();

    const parsed = tryParseJSON(raw);
    if (parsed === undefined) {
      // Log full (or truncated) raw output for debugging in server logs
      console.error("Model returned non-JSON (first 2k):", raw.slice(0, 2000));
      return NextResponse.json(
        {
          error: "Model returned non-JSON.",
          detail: raw.slice(0, 2000),
        },
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
    };

    // Map some common cases to clearer HTTP statuses
    let status = typeof e?.status === "number" ? e.status : 500;
    const msg = (e?.message || "").toLowerCase();

    if (status === 500) {
      if (msg.includes("model") && msg.includes("not found")) status = 404;
      else if (msg.includes("invalid") && msg.includes("schema")) status = 400;
      else if (msg.includes("permission") || msg.includes("unauthorized")) status = 401;
      else if (msg.includes("rate limit") || msg.includes("quota")) status = 429;
      else if (
        msg.includes("too large") ||
        msg.includes("content length") ||
        msg.includes("payload too large")
      )
        status = 413;
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
