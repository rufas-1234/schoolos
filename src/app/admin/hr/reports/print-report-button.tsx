"use client";

import { Printer } from "lucide-react";
import { printCurrentPage } from "@/components/print-button";

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => printCurrentPage({ title: "Staff attendance report" })}
      className="print:hidden inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      <Printer size={16} />
      Print report
    </button>
  );
}
