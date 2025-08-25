// app/api/parse/route.ts
import { NextResponse } from "next/server";
import { extractFromPdf } from "@/lib/priceExtractor";

export const runtime = "nodejs";
export const maxDuration = 300; // plenty for large PDFs

export async function POST(req: Request) {
  const form = await req.formData();

  const supplier = String(form.get("supplier") || "Supplier");
  const manufacturer = String(form.get("manufacturer") || "Manufacturer");
  const validityDate = String(form.get("validityDate") || "2154-12-31T00:00:00");

  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const items = await extractFromPdf(arrayBuffer, {
    supplier,
    manufacturer,
    validityDate,
    fileName: file.name,
  });

  return NextResponse.json({ items });
}
