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

// v4 worker (matches react-pdf 9.x + pdfjs-dist v4)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// Keep options minimal to avoid external asset fetches
const options = {};

// ---- Minimal pdf.js types for fallback (no `any`) ----
type PDFPageViewport = { width: number; height: number };
type PDFPageProxy = {
  getViewport: (o: { scale: number }) => PDFPageViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PDFPageViewport }) => {
    promise: Promise<void>;
  };
};
type PDFDocProxy = { numPages: number; getPage: (n: number) => Promise<PDFPageProxy> };
type GetDocumentReturn = { promise: Promise<PDFDocProxy> };
type GetDocumentFn = (src: { data: Uint8Array }) => GetDocumentReturn;
type PdfJsBuild = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: GetDocumentFn;
};

export default function PdfViewer({ file }: { file: File }) {
  // Primary path uses a blob URL (prevents ArrayBuffer detachment issues)
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>();
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackErr, setFallbackErr] = useState<string | null>(null);

  // For sizing
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [isPreparing, setIsPreparing] = useState<boolean>(false);

  // Fallback canvas container
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  // Create a Blob URL from the File for react-pdf
  useEffect(() => {
    setIsPreparing(true);
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    setUseFallback(false);
    setFallbackErr(null);
    setIsPreparing(false);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Width tracking
  const onResize = useCallback<ResizeObserverCallback>((entries) => {
    const [entry] = entries;
    if (entry) setContainerWidth(entry.contentRect.width);
  }, []);
  useResizeObserver(containerRef, {}, onResize);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setFallbackErr(null);
    setNumPages(numPages);
  }

  function onDocumentLoadError(e: unknown) {
    // If react-pdf fails (for any reason), switch to fallback
    console.warn("react-pdf failed; falling back to raw pdf.js:", e);
    setUseFallback(true);
  }

  // --- Fallback rendering using pdfjs-dist directly (canvas) ---
  useEffect(() => {
    if (!useFallback) return;

    const wrap = canvasWrapRef.current; // capture ref for cleanup
    if (!wrap) return;

    let cancelled = false;

    (async () => {
      try {
        setFallbackErr(null);

        // Read the file into a fresh Uint8Array (not shared with react-pdf)
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab.slice(0));

        const pdfMod = (await import("pdfjs-dist/build/pdf")) as unknown as PdfJsBuild;

        // v4 worker for fallback path as well
        pdfMod.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const task = pdfMod.getDocument({ data: bytes });
        const pdf = await task.promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);
        wrap.innerHTML = "";

        const targetWidth = containerRef?.clientWidth ?? 800;
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
      } catch (err) {
        console.error("Fallback pdf.js render failed:", err);
        if (!cancelled) setFallbackErr("Failed to render PDF.");
      }
    })();

    return () => {
      cancelled = true;
      wrap.innerHTML = "";
    };
  }, [useFallback, file, containerRef]);

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
          {!blobUrl && !useFallback && (
            <p className="text-sm opacity-70">
              {isPreparing ? "Preparing preview…" : "No PDF data yet."}
            </p>
          )}

          {/* Primary: react-pdf using a Blob URL (no buffer transfer) */}
          {blobUrl && !useFallback && (
            <Document
              file={blobUrl}
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

          {/* Fallback: raw pdf.js canvas */}
          <div ref={canvasWrapRef} />
          {useFallback && fallbackErr && (
            <p className="text-sm text-red-500 mt-2">{fallbackErr}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
