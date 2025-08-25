import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Fail fast if the key is missing (otherwise you only see a generic 500)
function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));
const MODEL_ID = "gemini-2.0-flash";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const schemaRaw = formData.get("schema") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!schemaRaw) {
      return NextResponse.json({ error: "No schema provided." }, { status: 400 });
    }

    // Guard: limit max size to something sane to avoid blowing requests up
    const MAX_BYTES = 100 * 1024 * 1024; // 100MB UI limit
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large." }, { status: 413 });
    }

    const schema = JSON.parse(schemaRaw);

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const prompt = "Extract the structured data from the following PDF file.";

    // Decide inline vs files API
    const INLINE_LIMIT = 18 * 1024 * 1024; // stay below typical inline caps
    let result;

    if (file.size <= INLINE_LIMIT) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64,
          },
        },
      ]);
    } else {
      // Use Files API for larger PDFs
      const upload = await genAI.files.upload({
        file: {
          data: Buffer.from(await file.arrayBuffer()),
          mimeType: "application/pdf",
          name: file.name,
        },
        displayName: file.name,
      });

      result = await model.generateContent([
        { text: prompt },
        {
          fileData: {
            mimeType: upload.file.mimeType!,
            fileUri: upload.file.uri!,
          },
        },
      ]);
    }

    const response = await result.response;

    // Be defensive: sometimes models return text that looks like JSON but isn’t
    const raw = response.text().trim();
    let extractedData: unknown;

    try {
      extractedData = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON.", detail: raw.slice(0, 2000) },
        { status: 502 }
      );
    }

    return NextResponse.json(extractedData);
  } catch (err: unknown) {
    // Narrow the unknown error to a safe shape for logging
    const e = err as {
      message?: string;
      name?: string;
      status?: number;
      code?: string;
      stack?: string;
    };

    console.error("Error extracting data:", {
      message: e?.message,
      name: e?.name,
      status: e?.status,
      code: e?.code,
      stack: e?.stack,
    });

    const status =
      typeof e?.status === "number" && Number.isInteger(e.status)
        ? e.status
        : 500;

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