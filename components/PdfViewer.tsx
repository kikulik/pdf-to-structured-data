"use client";

import { useCallback, useEffect, useState } from "react";
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

// ✔ Webpack/Next-friendly worker URL (bundled to a static file in prod)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

// Keep options minimal to avoid fetching non-existent assets
const options = {
  // If you copy assets to /public, you can re-enable these:
  // cMapUrl: "/cmaps/",
  // standardFontDataUrl: "/standard_fonts/",
};

export default function PdfViewer({ file }: { file: File }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState<number>();
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [isReading, setIsReading] = useState<boolean>(false);

  // Read File -> Uint8Array so pdf.js uses bytes (no blob/objectURL fetch)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsReading(true);
        setErrMsg(null);
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

  const onResize = useCallback<ResizeObserverCallback>((entries) => {
    const [entry] = entries;
    if (entry) setContainerWidth(entry.contentRect.width);
  }, []);
  useResizeObserver(containerRef, {}, onResize);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setErrMsg(null);
    setNumPages(numPages);
  }

  function onDocumentLoadError(e: unknown) {
    console.error("PDF preview load error:", e);
    setErrMsg("Failed to load PDF file.");
  }

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

          {bytes && (
            <Document
              file={{ data: bytes }}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              options={options}
              loading={<p className="text-sm opacity-70">Loading PDF…</p>}
              error={<p className="text-sm text-red-500">{errMsg ?? "Failed to load PDF file."}</p>}
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

          {errMsg && (
            <p className="text-sm text-red-500 mt-2">{errMsg}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
