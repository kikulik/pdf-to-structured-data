// components/MetaForm.tsx
"use client";
import { useState, useEffect } from "react";

type Props = {
  onChange: (meta: { supplier: string; manufacturer: string; validityDate: string }) => void;
};

export default function MetaForm({ onChange }: Props) {
  const [supplier, setSupplier] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [validityDate, setValidityDate] = useState("");

  useEffect(() => {
    onChange({ supplier, manufacturer, validityDate });
  }, [supplier, manufacturer, validityDate, onChange]);

  return (
    <div className="grid gap-2 md:grid-cols-3">
      <input className="border px-3 py-2 rounded" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier (optional)" />
      <input className="border px-3 py-2 rounded" value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="Manufacturer (optional)" />
      <input className="border px-3 py-2 rounded" value={validityDate} onChange={e => setValidityDate(e.target.value)} placeholder="Validity ISO date (optional)" />
    </div>
  );
}
