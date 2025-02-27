"use client";

import { Button } from "@/components/ui/button";
import { Braces, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
interface ResultDisplayProps {
  result: string;
  schema: string;
  onReset: () => void;
}

export function ResultDisplay({ result, schema, onReset }: ResultDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleSchemaCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    setSchemaCopied(true);
    setTimeout(() => setSchemaCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Extracted Data</h2>
        <div className="space-x-2">
          <Popover>
            <PopoverTrigger>
              <Button variant="outline" size="sm">
                <Braces className="w-4 h-4 mr-2" />
                Schema
              </Button>
            </PopoverTrigger>
            <PopoverContent className="max-h-[500px] max-w-[700px] w-full overflow-y-auto">
              <div className="relative p-4 rounded-lg bg-muted">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSchemaCopy}
                  className="absolute top-2 right-2"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {schemaCopied ? "Copied!" : "Copy"}
                </Button>
                <pre className="overflow-auto">
                  <code className="text-xs">
                    {JSON.stringify(schema, null, 2)}
                  </code>
                </pre>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Process Another PDF
          </Button>
        </div>
      </div>
      <pre className="p-4 rounded-lg bg-muted overflow-auto">
        <code className="text-sm">{JSON.stringify(result, null, 2)}</code>
      </pre>
    </div>
  );
}
