// lib/priceRowSchema.ts
export function buildPriceRowSchema() {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Extract product rows from the PDF.",
        items: {
          type: "object",
          properties: {
            Supplier: { type: "string", description: "Company selling the goods (distributor/dealer/integrator)." },
            Manufacturer: { type: "string", description: "Company that makes the product." },
            ModelCode: { type: "string", description: "Vendor SKU / model identifier, letters+digits as shown in the doc." },
            ModelDescription: { type: "string", description: "Human description of the model row." },
            T1List: { type: "number", description: "List/MSRP price if present; else 0." },
            T1Cost: { type: "number", description: "Cost at T1 if present; else 0." },
            T2List: { type: "number", description: "Dealer/Net price if present; else 0." },
            T2Cost: { type: "number", description: "Cost at T2 if present; else 0." },
            ISOCurrency: { type: "string", description: "ISO currency code like EUR, USD, GBP." },
            ValidityDate: { type: "string", description: "Validity or issue date (ISO if possible) or empty." },
            T1orT2: { type: "string", description: "Best label for the extracted price (T1 or T2)." },
            MaterialID: { type: "string" },
            SAPNumber: { type: "string" },
            ModelDescriptionEnglish: { type: "string" },
            ModelDescriptionLanguage2: { type: "string" },
            ModelDescriptionLanguage3: { type: "string" },
            ModelDescriptionLanguage4: { type: "string" },
            QuoteOrPriceList: { type: "string" },
            WeightKg: { type: "number" },
            HeightMm: { type: "number" },
            LengthMm: { type: "number" },
            WidthMm: { type: "number" },
            PowerWatts: { type: "number" },
            FileName: { type: "string" }
          },
          required: ["ModelCode", "ModelDescription"]
        }
      }
    },
    required: ["items"]
  };
}
