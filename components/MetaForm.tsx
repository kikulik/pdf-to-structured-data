// components/MetaForm.tsx
"use client";
import { useState, useEffect } from "react";

type Props = {
  onChange: (meta: { supplier: string; manufacturer: string; validityDate: string }) => void;
};

export default function MetaForm({ onChange }: Props) {
  const [supplier, setSupplier] = useState("UAB TVC Solutions");
  const [manufacturer, setManufacturer] = useState("Unknown");
  const [validityDate, setValidityDate] = useState("2154-12-31T00:00:00");

  useEffect(() => {
    onChange({ supplier, manufacturer, validityDate });
  }, [supplier, manufacturer, validityDate, onChange]);

  return (
    <div className="grid gap-2 md:grid-cols-3">
      <input className="border px-3 py-2 rounded" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier" />
      <input className="border px-3 py-2 rounded" value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="Manufacturer" />
      <input className="border px-3 py-2 rounded" value={validityDate} onChange={e => setValidityDate(e.target.value)} placeholder="Validity ISO date" />
    </div>
  );
}
