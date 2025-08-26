// components/ResultDisplay.tsx
"use client";
import * as XLSX from "xlsx";
import type { PriceRow } from "@/lib/priceExtractor";

export default function ResultDisplay({ rows }: { rows: PriceRow[] }) {
  if (!rows?.length) return null;

  const keys = Object.keys(rows[0]) as (keyof PriceRow)[];

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prices.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prices");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prices.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          Showing {Math.min(rows.length, 500)} of {rows.length} rows
        </div>
        <div className="flex gap-2">
          <button className="border px-3 py-2 rounded" onClick={downloadJSON}>
            Download JSON
          </button>
          <button className="border px-3 py-2 rounded" onClick={downloadXLSX}>
            Download XLSX
          </button>
        </div>
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-muted text-slate-900 dark:text-foreground">
              {keys.map((k) => (
                <th key={String(k)} className="text-left px-3 py-2 whitespace-nowrap">
                  {String(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-900 dark:text-foreground">
            {rows.slice(0, 500).map((r, i) => (
              <tr
                key={i}
                className="odd:bg-slate-50 even:bg-slate-100 dark:odd:bg-slate-900/40 dark:even:bg-slate-900/20"
              >
                {keys.map((k) => (
                  <td key={String(k)} className="px-3 py-2 whitespace-nowrap">
                    {String(r[k] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 500 && (
        <p className="text-xs opacity-70">Showing first 500 rows (download to see all).</p>
      )}
    </div>
  );
}
