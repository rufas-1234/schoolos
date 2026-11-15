"use client";

export function DownloadAnalyticsCsv({
  headers,
  rows,
  fileName,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
  fileName: string;
}) {
  function download() {
    const escapeCell = (value: string | number) => {
      let text = String(value);
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const content = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={!rows.length}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
    >
      Download spreadsheet (CSV)
    </button>
  );
}
