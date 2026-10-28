"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-secondary no-print">
      <Printer className="h-4 w-4" aria-hidden />
      Print this screen
    </button>
  );
}
