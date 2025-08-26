---
title: PDF Extractor
emoji: 🧾
colorFrom: purple
colorTo: gray
sdk: docker
header: mini
app_port: 3000
pinned: false
license: apache-2.0
short_description: Extract structured product/price data from PDFs using a fast parser or Gemini 2.0; export JSON/XLSX.
---

# PDF Extractor — PDF → Structured Data

This Space turns **PDF price lists / quotes** into a clean table of items you can **download as JSON or XLSX**.

It has two extractors:

- **Extract Data (fast)** — a heuristic/regex parser. No AI, very quick.
- **Smart Extract (AI)** — uses **Google DeepMind Gemini 2.0** with a strict **JSON Schema** for robust, vendor‑agnostic extraction. Includes a defensive sanitizer for JSON-ish model output.

> **Heads‑up:** You must provide a valid **`GEMINI_API_KEY`** (see below).

---

## ✨ Features

- Upload PDF (≤ 100 MB) with live inline preview
- Two extraction modes: fast (no AI) and AI (Gemini 2.0)
- Auto‑fill of Supplier/Manufacturer/Validity when possible
- Clean **results table** with **JSON/XLSX** export
- Defensive AI route that repairs common non‑JSON responses
- Optional `?debug=1` to see sanitizer details in the response

---

## 🧱 Tech stack

- **Next.js 15** (React 19), Tailwind, shadcn/ui, lucide-react
- **PDF preview**: `react-pdf` 9 + `pdfjs-dist` 4 (with a canvas fallback)
- **Fast parser**: `pdf-parse` with a CJS wrapper to avoid path issues
- **AI**: `@google/generative-ai` (Gemini 2.0 Flash by default)
- **Export**: `xlsx`
- Output: `standalone` (see `Dockerfile` & `next.config.ts`)

---

## 🚀 Run this Space on Hugging Face

This Space is configured with `sdk: docker`, so it builds from the included `Dockerfile`.

1. **Add your API key**: go to **Settings → Variables and secrets**, add a secret
   - **Name**: `GEMINI_API_KEY`
   - **Value**: your Google AI Studio key
2. (Optional) add `GEMINI_MODEL` to override the default (`gemini-2.0-flash`).
3. Save & **Restart** the Space.

> If you see “Model returned non‑JSON”, use `?debug=1` once (the route will include a cleaned preview and parse stages to help diagnose).

---

## 🛠️ Local development

Use Node or Docker. Full instructions live in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Quick start (Node):

```bash
npm ci
echo "GEMINI_API_KEY=YOUR_KEY" > .env.local
npm run dev
# open http://localhost:3000
```

Quick start (Docker):

```bash
docker build -t pdf-extractor .
docker run --rm -e GEMINI_API_KEY=YOUR_KEY -p 3000:3000 pdf-extractor
```

---

## 📡 API routes

### `POST /api/parse` — fast extractor (no AI)

**Form fields (multipart):**

- `file`: the PDF
- `supplier` (optional)
- `manufacturer` (optional)
- `validityDate` (optional)

**Response:**

```json
{ "items": [ /* PriceRow[] */ ] }
```

### `POST /api/extract[?debug=1]` — AI extractor (Gemini + JSON Schema)

**Form fields (multipart):**

- `file`: the PDF (≤ ~18 MB inline; larger is rejected)
- `schema`: a JSON Schema (we build one on the client for the PriceRow shape)

**Notes:**

- Returns **either** `{ "items": [...] }` **or** a bare JSON array. The UI normalizes both.
- With `?debug=1`, a non‑200 error includes `detail`, `debug.cleanedFirst2k`, `debug.stagesTried`, and header `x-extract-debug-stage`.

**Minimal PriceRow shape (client‑normalized):**

```ts
type PriceRow = {
  Supplier: string;
  Manufacturer: string;
  ModelCode: string;
  ModelDescription: string;
  T1List: number;
  T1Cost: number;
  T2List: number;
  T2Cost: number;
  ISOCurrency: "EUR" | "USD" | "GBP";
  ValidityDate: string;
  T1orT2: "T1" | "T2";
  MaterialID: string;
  SAPNumber: string;
  ModelDescriptionEnglish: string;
  ModelDescriptionLanguage2: string;
  ModelDescriptionLanguage3: string;
  ModelDescriptionLanguage4: string;
  QuoteOrPriceList: "Price List" | "Quote";
  WeightKg: number;
  HeightMm: number;
  LengthMm: number;
  WidthMm: number;
  PowerWatts: number;
  FileName: string;
}
```

---

## 🧩 Notable implementation details

- **`lib/pdfParseCJS.ts`** calls `pdf-parse/lib/pdf-parse.js` directly (skips index resolution pitfalls and legacy `pdfjs` paths).
- **PDF preview** uses `react-pdf` with worker `pdf.worker.min.mjs` (v4). If the primary renderer fails, a **raw pdf.js** canvas fallback kicks in.
- The AI route aggressively **sanitizes JSON-ish** text (fences/comments/unicode/trailing commas/unquoted keys/single quotes/control chars) and can **wrap a detected items array** into `{ items: [...] }`.

---

## 🔐 Security

- Keep your **`GEMINI_API_KEY`** private (use Space secrets or `.env.local` locally; never commit secrets).
- PDFs are submitted to Gemini for extraction in AI mode—review your data policy and key’s usage limits.

---

## 📄 License

Apache-2.0 — see `LICENSE` (or the Space metadata above).
