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
    const e = err as {
      message?: string;
      name?: string;
      status?: number;
      code?: string;
      cause?: unknown;
      stack?: string;
    };
  
    // Log everything server-side
    console.error("Error extracting data:", e);
  
    // Try to map status; otherwise infer from message
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
