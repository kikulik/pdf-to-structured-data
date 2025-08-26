"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pdfjs, Document, Page } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { useResizeObserver } from "@wojtekmaj/react-hooks";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

// Webpack/Next-friendly worker URL for react-pdf path
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

// Keep options minimal (no external CMaps/fonts fetches)
const options = {};

// --- Minimal pdf.js types for the fallback path (no `any`) ---
type PDFPageViewport = { width: number; height: number };
type PDFPageProxy = {
  getViewport: (o: { scale: number }) => PDFPageViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PDFPageViewport }) => {
    promise: Promise<void>;
  };
};
type PDFDocProxy = {
  numPages: number;
  getPage: (n: number) => Promise<PDFPageProxy>;
};
type GetDocumentReturn = { promise: Promise<PDFDocProxy> };
type GetDocumentFn = (src: { data: Uint8Array }) => GetDocumentReturn;

export default function PdfViewer({ file }: { file: File }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState<number>();
  const [useFallback, setUseFallback] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [isReading, setIsReading] = useState<boolean>(false);

  // Fallback canvas container
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  // Read File -> Uint8Array (works for both react-pdf and raw pdf.js)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsReading(true);
        setErrMsg(null);
        setUseFallback(false);
        const ab = await file.arrayBuffer();
        if (!cancelled) setBytes(new Uint8Array(ab));
      } catch (e) {
        console.error("PDF preview: failed to read file", e);
        if (!cancelled) setErrMsg("Could not read PDF file.");
      } finally {
        if (!cancelled) setIsReading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Track width for Page sizing
  const onResize = useCallback<ResizeObserverCallback>((entries) => {
    const [entry] = entries;
    if (entry) setContainerWidth(entry.contentRect.width);
  }, []);
  useResizeObserver(containerRef, {}, onResize);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setErrMsg(null);
    setNumPages(numPages);
  }

  async function onDocumentLoadError(e: unknown) {
    // react-pdf failed (worker/version/URL/etc). Fall back to raw pdf.js render.
    console.warn("react-pdf failed; falling back to raw pdf.js:", e);
    setErrMsg("Failed to load PDF with viewer, switching to fallback…");
    setUseFallback(true);
  }

  // --- Fallback renderer using pdfjs-dist directly (canvas) ---
  useEffect(() => {
    if (!useFallback || !bytes) return;

    const wrap = canvasWrapRef.current; // capture ref to satisfy hooks rule
    if (!wrap) return;

    let cancelled = false;

    (async () => {
      try {
        const pdfMod = (await import("pdfjs-dist/build/pdf.mjs")) as unknown as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: GetDocumentFn;
        };

        // worker for fallback path as well
        pdfMod.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.js",
          import.meta.url
        ).toString();

        const task = pdfMod.getDocument({ data: bytes });
        const pdf = await task.promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);
        wrap.innerHTML = "";

        // Scale canvas to container width if possible
        const targetWidth = (containerRef?.clientWidth ?? 800);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport0 = page.getViewport({ scale: 1.0 });
          const scale = targetWidth / viewport0.width;
          const viewport = page.getViewport({ scale: scale || 1.2 });

          const canvas = document.createElement("canvas");
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 12px auto";
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            if (!cancelled) wrap.appendChild(canvas);
          }
        }

        setErrMsg(null);
      } catch (err) {
        console.error("Fallback pdf.js render failed:", err);
        setErrMsg("Failed to render PDF.");
      }
    })();

    return () => {
      cancelled = true;
      // cleanup using captured variable (not the ref directly)
      wrap.innerHTML = "";
    };
  }, [useFallback, bytes, containerRef]);

  return (
    <Sheet>
      <SheetTrigger className="h-10 rounded-lg px-4 py-2 border-input bg-background border-2 hover:bg-accent hover:text-accent-foreground">
        Preview
      </SheetTrigger>

      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{file.name}</SheetTitle>
        </SheetHeader>

        <div
          ref={setContainerRef}
          className="max-w-2xl mx-auto mt-2 max-h-[calc(100vh-10rem)] overflow-y-auto"
        >
          {!bytes && !errMsg && (
            <p className="text-sm opacity-70">
              {isReading ? "Preparing preview…" : "No PDF data yet."}
            </p>
          )}

          {/* First try react-pdf */}
          {bytes && !useFallback && (
            <Document
              file={{ data: bytes }}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              options={options}
              loading={<p className="text-sm opacity-70">Loading PDF…</p>}
              error={<p className="text-sm text-red-500">Failed to load PDF. Switching to fallback…</p>}
              noData={<p className="text-sm opacity-70">No PDF file.</p>}
            >
              {Array.from(new Array(numPages || 0), (_el, index) => (
                <Page
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  width={containerWidth}
                />
              ))}
            </Document>
          )}

          {/* If react-pdf fails, draw with raw pdf.js */}
          <div ref={canvasWrapRef} />
          {useFallback && errMsg && (
            <p className="text-sm text-red-500 mt-2">{errMsg}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
