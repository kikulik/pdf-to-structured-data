import { NextResponse } from "next/server";
import { extractFromPdf } from "@/lib/priceExtractor";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const supplier = String(form.get("supplier") ?? "").trim();
    const manufacturer = String(form.get("manufacturer") ?? "").trim();
    const validityDate = String(form.get("validityDate") ?? "").trim();

    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const items = await extractFromPdf(arrayBuffer, {
      supplier,
      manufacturer,
      validityDate,
      fileName: file.name, // source filename
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    console.error("parse route error:", e);
    const msg = e instanceof Error ? e.message : "Parse failed";
    const stack = e instanceof Error ? e.stack : undefined;
    return NextResponse.json({ error: msg, stack }, { status: 500 });
  }
}
