"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pdfjs, Document, Page } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { useResizeObserver } from "@wojtekmaj/react-hooks";

// v4 worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// Minimal pdf.js types
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

export default function InlinePdfPreview({ file }: { file: File }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>();
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackErr, setFallbackErr] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  // Create a blob URL for react-pdf (avoids ArrayBuffer detachment)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    setUseFallback(false);
    setFallbackErr(null);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Track width for Page sizing
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
    console.warn("react-pdf failed; using raw pdf.js fallback:", e);
    setUseFallback(true);
  }

  // Fallback renderer (raw pdf.js -> canvas)
  useEffect(() => {
    if (!useFallback) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    let cancelled = false;

    (async () => {
      try {
        setFallbackErr(null);

        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab.slice(0));

        const pdfMod = (await import("pdfjs-dist/build/pdf")) as unknown as PdfJsBuild;
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
    <div ref={setContainerRef} className="w-full h-full p-3">
      {/* Primary: react-pdf */}
      {blobUrl && !useFallback && (
        <Document
          file={blobUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<p className="text-sm opacity-70 p-3">Loading PDF…</p>}
          error={<p className="text-sm text-red-500 p-3">Failed to load PDF. Switching to fallback…</p>}
          noData={<p className="text-sm opacity-70 p-3">No PDF file.</p>}
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

      {/* Fallback: raw pdf.js -> canvas */}
      <div ref={canvasWrapRef} />
      {useFallback && fallbackErr && (
        <p className="text-sm text-red-500 mt-2">{fallbackErr}</p>
      )}
    </div>
  );
}
