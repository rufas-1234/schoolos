"use client";

export function printElementById(
  elementId: string,
  title: string,
  pageOrientation?: "portrait" | "landscape",
  pageSize?: "A4",
) {
  const target = document.getElementById(elementId);
  if (!target) {
    window.alert("The selected report content could not be found. Refresh the page and try again.");
    return;
  }

  const printWindow = window.open("", "_blank", "popup,width=1000,height=800");
  if (!printWindow) {
    window.alert("Your browser blocked the print window. Allow pop-ups for this site, then try again.");
    return;
  }

  const copiedStyles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
    'link[rel="stylesheet"], style',
  )).map((style) => style.outerHTML).join("\n");
  const safeTitle = title.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
  const pageSizeRule = pageSize
    ? `size: ${pageSize} ${pageOrientation ?? "portrait"};`
    : pageOrientation ? `size: ${pageOrientation};` : "";

  printWindow.addEventListener("load", () => {
    void printWindow.document.fonts.ready.then(() => {
      printWindow.focus();
      printWindow.print();
    });
  }, { once: true });
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <base href="${window.location.origin}/">
        <title>${safeTitle}</title>
        ${copiedStyles}
        <style>
          @page { margin: ${pageSize ? "9mm" : "14mm"}; ${pageSizeRule} }
          html, body { min-height: 100%; background: white; color: #172033; }
          body { margin: 0; padding: 0; font: 10pt Arial, sans-serif; }
          [class~="print:hidden"], dialog { display: none !important; }
          .print-report-content { display: block !important; width: 100%; color: #172033; }
          .a4-report-card { min-height: 270mm; margin: 0 !important; break-inside: avoid; page-break-inside: avoid; break-after: page; page-break-after: always; }
          .a4-report-card-last { break-after: auto; page-break-after: auto; }
          .exam-report-heading { margin-bottom: 3mm; border-bottom: 4px solid #7f2524; padding-bottom: 3mm; }
          .exam-report-heading h2 { color: #7f2524; }
          .exam-report-heading p { color: #30495f; }
          .print-report-heading { margin-bottom: 5mm; border-bottom: 2px solid #6d28d9; padding-bottom: 4mm; }
          .print-report-panel { overflow: visible !important; border: 1px solid #d8deea; box-shadow: none !important; }
          .print-report-content table, .print-report-table { width: 100% !important; min-width: 0 !important; border-collapse: collapse; }
          .print-report-content th, .print-report-content td, .print-report-table th, .print-report-table td {
            border: 1px solid #d8deea; padding: 2.2mm 2mm; text-align: left; vertical-align: top;
          }
          .print-report-content thead th, .a4-report-card > table thead th { background: #7f2524 !important; color: white !important; }
          .payroll-record-print { display: block !important; width: 100%; color: #172033; }
          .payroll-record-print dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 24px 0; }
          .payroll-record-print dl div { border-bottom: 1px solid #d8deea; padding-bottom: 8px; }
          .payroll-record-print dt, .payroll-record-print-kicker {
            color: #6d28d9; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
          }
          .payroll-record-print dd { margin: 4px 0 0; font-size: 11pt; font-weight: 600; }
          .payroll-record-print h1 { margin: 8px 0; font-size: 22pt; }
          .payroll-record-print table { width: 100%; border-collapse: collapse; }
          .payroll-record-print th, .payroll-record-print td { border: 1px solid #d8deea; padding: 10px 12px; text-align: left; }
          .payroll-record-print td { text-align: right; }
          .payroll-record-print footer { display: flex; justify-content: space-between; margin-top: 64px; }
          @media print {
            html, body { width: 100%; }
            tr, section, article { break-inside: avoid; }
          }
        </style>
      </head>
      <body><main>${target.outerHTML}</main></body>
    </html>`);
  printWindow.document.close();
}

export function PrintButton({
  label = "Print",
  targetId,
  pageOrientation,
  pageSize,
}: {
  label?: string;
  targetId?: string;
  pageOrientation?: "portrait" | "landscape";
  pageSize?: "A4";
}) {
  return (
    <button
      type="button"
      onClick={() => targetId ? printElementById(targetId, label, pageOrientation, pageSize) : window.print()}
      className="print:hidden rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
    >
      {label}
    </button>
  );
}
