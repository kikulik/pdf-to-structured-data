"use client";

import { useCallback, useState } from "react";
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

// ✅ Load the pdf.js worker via Turbopack/webpack worker URL
//    This avoids alias hacks and works in Next 15.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// Remove external CMaps/standard fonts to avoid 404s.
// If you *really* need them, add those folders under /public and set URLs back.
const options = {
  // cMapUrl: "/cmaps/",
  // standardFontDataUrl: "/standard_fonts/",
};

export default function PdfViewer({ file }: { file: File }) {
  const [numPages, setNumPages] = useState<number>();
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onResize = useCallback<ResizeObserverCallback>((entries) => {
    const [entry] = entries;
    if (entry) setContainerWidth(entry.contentRect.width);
  }, []);

  useResizeObserver(containerRef, {}, onResize);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
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
          <Document
            file={file}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
