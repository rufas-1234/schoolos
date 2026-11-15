"use client";

import { printCurrentPage } from "@/components/print-button";

export function ReceiptActions() {
  return (
    <button
      type="button"
      onClick={() => printCurrentPage({ title: "Payment receipt" })}
      className="print:hidden rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
    >
      Print receipt
    </button>
  );
}
