"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
    >
      {label}
    </button>
  );
}
