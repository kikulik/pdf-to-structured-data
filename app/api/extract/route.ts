import { NextResponse } from "next/server";
import { GoogleGenerativeAI, type GenerateContentResult } from "@google/generative-ai";

// Optional: prevent any static rendering assumptions
export const dynamic = "force-dynamic";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing required env var: GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

const MODEL_ID = "gemini-2.0-flash";

export async function POST(request: Request) {
  try {
    // ↓↓↓ move creation *here*, after env exists at runtime
    const genAI = getGenAI();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const schemaRaw = formData.get("schema") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
    if (!schemaRaw) return NextResponse.json({ error: "No schema provided." }, { status: 400 });

    const MAX_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large." }, { status: 413 });

    const schema = JSON.parse(schemaRaw);

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const prompt = "Extract the structured data from the following PDF file.";
    const INLINE_LIMIT = 18 * 1024 * 1024; // ~18MB
    let result: GenerateContentResult;

    if (file.size <= INLINE_LIMIT) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      result = await model.generateContent([
        { text: prompt },
        { inlineData: { mimeType: "application/pdf", data: base64 } },
      ]);
    } else {
      return NextResponse.json(
        { error: "PDF is too large for inline processing (> ~18MB). Please upload a smaller file or compress the PDF." },
        { status: 413 }
      );
    }

    const response = await result.response;
    const raw = response.text().trim();

    try {
      const extractedData = JSON.parse(raw);
      return NextResponse.json(extractedData);
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON.", detail: raw.slice(0, 2000) },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const e = err as { message?: string; name?: string; status?: number; code?: string; stack?: string };
    console.error("Error extracting data:", {
      message: e?.message, name: e?.name, status: e?.status, code: e?.code, stack: e?.stack,
    });

    const status = typeof e?.status === "number" && Number.isInteger(e.status) ? e.status : 500;
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Authentication failed. Check GEMINI_API_KEY server-side."
            : status === 429
            ? "Rate limited by the model API. Try again with a smaller file or later."
            : "Failed to extract data.",
      },
      { status }
    );
  }
}
