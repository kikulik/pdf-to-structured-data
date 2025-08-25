// lib/xlsx.ts
import * as XLSX from "xlsx";
import { PriceRow } from "./priceExtractor";

export function rowsToXlsxBlob(rows: PriceRow[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prices");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
