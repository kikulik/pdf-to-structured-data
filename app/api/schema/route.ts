import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing required env var: GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

// You can override via env if needed
const MODEL_ID = process.env.GEMINI_SCHEMA_MODEL || "gemini-2.0-flash";

const META_PROMPT = `
You are a JSON Schema expert. Create a JSON schema based on the user input. The schema will be used to extract data.

Rules:
- Return a single valid JSON object only (no markdown code fences).
- All object fields must be under "properties".
- Use "required" to list required fields.
- Each "type" must be a single string (e.g., "string", not ["string","null"]).
- Do not use $schema, $defs, or $ref.
- The top-level may include an optional "description" but not "title".
- No examples or default values (mention examples only inside descriptions if needed).
- If the user prompt is short, infer a minimal reasonable schema.
- If the user prompt is detailed, include only requested fields.

Examples:

Input: Cookie Recipes
Output:
{
  "description": "Schema for a cookie recipe, including ingredients, quantities, and ordered instructions.",
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "The name of the cookie recipe." },
    "description": { "type": "string", "description": "Flavor/texture summary." },
    "ingredients": {
      "type": "array",
      "description": "List of ingredients with quantity and unit.",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Ingredient name." },
          "quantity": { "type": "number", "description": "Amount needed." },
          "unit": { "type": "string", "description": "Measurement unit (e.g., g, ml, tsp, tbsp)." }
        },
        "required": ["name", "quantity", "unit"]
      }
    },
    "instructions": {
      "type": "array",
      "description": "Ordered steps to prepare the recipe.",
      "items": { "type": "string", "description": "A single step." }
    }
  },
  "required": ["name", "description", "ingredients", "instructions"]
}

Input: Book with title, author, and publication year.
Output:
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "description": "Book title." },
    "author": { "type": "string", "description": "Book author." },
    "publicationYear": { "type": "integer", "description": "Year published." }
  },
  "required": ["title", "author", "publicationYear"]
}

User input: {USER_PROMPT}
`.trim();

function sanitizeJsonString(text: string): string {
  let s = text.trim();

  // Strip markdown fences if model ignored instructions
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }

  // Remove BOM and non-breaking spaces that can sneak in
  s = s.replace(/^\uFEFF/, "").replace(/\u00A0/g, " ");

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  return s;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function validateSchemaObject(schema: Record<string, unknown>) {
  // Disallow $schema / $defs / $ref
  const sc = schema as { [k: string]: unknown };
  for (const bad of ["$schema", "$defs", "$ref"]) {
    if (Object.prototype.hasOwnProperty.call(sc, bad)) {
      delete sc[bad];
    }
  }
  // type must be a string if present
  if ("type" in sc && typeof sc.type !== "string") {
    throw new Error(`Invalid schema: "type" must be a string`);
  }
}

function extractErrorInfo(err: unknown): { status?: number; message?: string } {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    return {
      status: typeof o.status === "number" ? o.status : undefined,
      message: typeof o.message === "string" ? o.message : undefined,
    };
  }
  return {};
}

function isRateLimit(err: unknown): boolean {
  const { status, message } = extractErrorInfo(err);
  if (status === 429) return true;
  if (message && /rate limit|quota/i.test(message)) return true;
  return false;
}

async function generateSchemaWithRetry(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string
) {
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await model.generateContent(prompt);
      return res;
    } catch (err: unknown) {
      lastErr = err;
      if (attempt < maxAttempts && isRateLimit(err)) {
        const ms = 300 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, ms));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

export async function POST(request: Request) {
  try {
    const genAI = getGenAI();

    const { prompt } = (await request.json()) as { prompt?: string };
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        temperature: 0, // deterministic JSON
        responseMimeType: "application/json",
      },
    });

    const merged = META_PROMPT.replace("{USER_PROMPT}", prompt.trim());

    // Retry wrapper (helps with transient 429s)
    const result = await generateSchemaWithRetry(model, merged);
    const response = await result.response;

    const text = sanitizeJsonString(response.text());
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON.", detail: text.slice(0, 2000) },
        { status: 502 }
      );
    }

    if (!isPlainObject(parsed)) {
      return NextResponse.json(
        { error: "Schema must be a JSON object.", detail: JSON.stringify(parsed).slice(0, 2000) },
        { status: 400 }
      );
    }

    validateSchemaObject(parsed);

    return NextResponse.json({ schema: parsed });
  } catch (error: unknown) {
    const { status, message } = extractErrorInfo(error);
    console.error("Error generating schema:", error);
    return NextResponse.json(
      {
        error: "Failed to generate schema. This could be a rate limit or output formatting issue.",
        detail: message,
      },
      { status: typeof status === "number" ? status : 500 }
    );
  }
}
