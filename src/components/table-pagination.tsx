import Link from "next/link";

export function TablePagination({
  ariaLabel,
  currentPage,
  pageSize,
  totalRows,
  hrefForPage,
}: {
  ariaLabel: string;
  currentPage: number;
  pageSize: number;
  totalRows: number;
  hrefForPage: (page: number) => string;
}) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const firstRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, totalRows);

  return (
    <nav aria-label={ariaLabel} className="print:hidden flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-sm text-slate-600">
        Showing {firstRow}–{lastRow} of {totalRows} · Page {currentPage} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={hrefForPage(Math.max(1, currentPage - 1))}
          aria-disabled={currentPage <= 1}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            currentPage <= 1
              ? "pointer-events-none border-slate-100 text-slate-400"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Previous
        </Link>
        <Link
          href={hrefForPage(Math.min(pageCount, currentPage + 1))}
          aria-disabled={currentPage >= pageCount}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            currentPage >= pageCount
              ? "pointer-events-none border-slate-100 text-slate-400"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}
