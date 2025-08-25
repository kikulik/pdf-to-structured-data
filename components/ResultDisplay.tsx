// components/ResultDisplay.tsx
"use client";
import * as XLSX from "xlsx";

type Row = Record<string, any>;

export default function ResultDisplay({ rows }: { rows: Row[] }) {
  if (!rows?.length) return null;

  const keys = Object.keys(rows[0]);

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
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prices.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button className="border px-3 py-2 rounded" onClick={downloadJSON}>Download JSON</button>
        <button className="border px-3 py-2 rounded" onClick={downloadXLSX}>Download XLSX</button>
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {keys.map(k => (
                <th key={k} className="text-left px-3 py-2 whitespace-nowrap">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {keys.map(k => (
                  <td key={k} className="px-3 py-2 whitespace-nowrap">{String(r[k] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 500 && <p className="text-xs opacity-70">Showing first 500 rows (download to see all).</p>}
    </div>
  );
}
