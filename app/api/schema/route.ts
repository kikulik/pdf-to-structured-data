import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing required env var: GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

const MODEL_ID = "gemini-2.0-flash";

const META_PROMPT = `
You are a JSON Schema expert. Create a JSON schema based on the user input. The schema will be used to extract data.

Rules:
- Return a **single valid JSON object** only.
- Do **not** wrap in markdown backticks.
- All fields in an object must be listed under "properties".
- Use "required" to list all fields that must be present.
- The "type" must be a **single value** (no arrays of types).
- Do **not** use $schema, $defs, or $ref.
- The top-level object may include an optional "description" but **not** "title".
- No examples or default values (if helpful, mention in "description" text instead).
- If the user prompt is short, infer a reasonable minimal schema.
- If the user prompt is detailed, only include fields the user asked for.

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

export async function POST(request: Request) {
  try {
    const genAI = getGenAI();

    const { prompt } = await request.json();
    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    const result = await model.generateContent(
      META_PROMPT.replace("{USER_PROMPT}", prompt)
    );

    const response = await result.response;
    let text = response.text().trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    }

    return NextResponse.json({ schema: JSON.parse(text) });
  } catch (error) {
    console.error("Error generating schema:", error);
    return NextResponse.json(
      { error: "Failed to generate schema. This could be a rate limit or output formatting issue." },
      { status: 500 }
    );
  }
}