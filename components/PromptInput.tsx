"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  file: File | null;
}

export function PromptInput({ onSubmit, file }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Describe the structure and type of data you want to extract from the
          PDF.
        </p>
      </div>

      <Textarea
        id="prompt"
        className="min-h-[100px] border-secondary resize-none "
        placeholder="Example: Extract all invoice details including invoice number, date, items, prices, and total amount..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <Button
        type="submit"
        disabled={!prompt.trim() || file === null}
        className="w-full bg-primary hover:bg-primary/90"
      >
        <Wand2 className="w-4 h-4 mr-2" />
        Extract Data
      </Button>
    </form>
  );
}
