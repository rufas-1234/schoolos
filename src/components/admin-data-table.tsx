"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { printCurrentPage } from "@/components/print-button";
import { PAGE_SIZE_OPTIONS } from "@/components/pagination-utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Plus,
  Pencil,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";

export type AdminTableColumn = {
  key: string;
  label: string;
};

export type AdminTableFilter = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

export type AdminTableRow = {
  id: string | number;
  values: Record<string, string>;
  searchableText?: string;
  clickableColumns?: string[];
  actions?: ReactNode;
};

export function AdminActionDialog({
  label,
  title,
  children,
  initialOpen = false,
}: {
  label: string;
  title: string;
  children: ReactNode;
  initialOpen?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (initialOpen) dialogRef.current?.showModal();
  }, [initialOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={label}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        <Plus size={16} aria-hidden="true" />
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="admin-record-dialog m-auto max-h-[90vh] w-[min(94vw,48rem)] max-w-none overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 id={titleId} className="font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
      </dialog>
    </>
  );
}

export function AdminRecordDialog({
  title,
  mode = "edit",
  wide = false,
  showLabel = false,
  triggerLabel,
  initialOpen = false,
  children,
}: {
  title: string;
  mode?: "view" | "edit";
  wide?: boolean;
  showLabel?: boolean;
  triggerLabel?: string;
  initialOpen?: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const Icon = mode === "view" ? Eye : Pencil;
  const actionLabel = mode === "view" ? "View" : "Edit";

  useEffect(() => {
    if (initialOpen) dialogRef.current?.showModal();
  }, [initialOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`${actionLabel} ${title}`}
        title={`${actionLabel} ${title}`}
        className={triggerLabel
          ? "cursor-pointer text-left text-slate-700 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          : `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${showLabel ? "px-2.5" : "w-9"}`}
      >
        {triggerLabel ? triggerLabel : (
          <>
            <Icon size={16} aria-hidden="true" />
            <span className={showLabel ? "" : "sr-only"}>{actionLabel}</span>
          </>
        )}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className={`admin-record-dialog m-auto max-h-[90vh] ${
          wide ? "w-[min(96vw,72rem)]" : "w-[min(94vw,48rem)]"
        } max-w-none overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 id={titleId} className="font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label={`Close ${mode} dialog`}
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
      </dialog>
    </>
  );
}

export function AdminDeleteButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(`${label}? This action cannot be undone.`)) {
          event.preventDefault();
        }
      }}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2 size={16} aria-hidden="true" />
    </button>
  );
}

function RecordDetails({
  columns,
  values,
}: {
  columns: AdminTableColumn[];
  values: Record<string, string>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {columns.map((column) => (
        <div key={column.key} className="min-w-0 border-b border-slate-100 pb-3 last:border-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {column.label}
          </dt>
          <dd className="mt-1 break-words text-sm text-slate-900">
            {values[column.key] || "Not provided"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminDataTable({
  title,
  columns,
  rows,
  filters = [],
  toolbarActions,
  requireSearchCriteria = false,
  searchCriteriaSelected,
  showAllRecordsLabel,
  initialQuery = "",
  emptyMessage,
  hideDefaultView = false,
  showRowNumber = true,
  showActionLabels = false,
  printButtonLabel = "Print",
}: {
  title: string;
  columns: AdminTableColumn[];
  rows: AdminTableRow[];
  filters?: AdminTableFilter[];
  toolbarActions?: ReactNode;
  requireSearchCriteria?: boolean;
  searchCriteriaSelected?: boolean;
  showAllRecordsLabel?: string;
  initialQuery?: string;
  emptyMessage: string;
  hideDefaultView?: boolean;
  showRowNumber?: boolean;
  showActionLabels?: boolean;
  printButtonLabel?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [printAll, setPrintAll] = useState(false);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const hasActions = rows.length > 0;
  const hasActiveFilters = filters.some((filter) => Boolean(filterValues[filter.key]));
  const criteriaReady =
    !requireSearchCriteria ||
    rows.length === 0 ||
    showAllRecords ||
    (searchCriteriaSelected ?? (hasActiveFilters || Boolean(query.trim())));

  useEffect(() => {
    if (!printAll) return;
    const resetPrint = () => setPrintAll(false);
    window.addEventListener("afterprint", resetPrint);
    const timer = window.setTimeout(() => printCurrentPage(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", resetPrint);
    };
  }, [printAll]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matches = normalizedQuery
      ? rows.filter((row) =>
          row.searchableText?.toLocaleLowerCase().includes(normalizedQuery) ||
          columns.some((column) =>
            row.values[column.key]?.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
      : rows;
    const categoryMatches = matches.filter((row) =>
      filters.every((filter) => {
        const selectedValue = filterValues[filter.key];
        const rowValues = row.values[filter.key]?.split("|") ?? [];
        return !selectedValue || rowValues.includes(selectedValue);
      }),
    );

    if (!sortKey) return categoryMatches;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...categoryMatches].sort((first, second) => {
      const comparison = collator.compare(first.values[sortKey] ?? "", second.values[sortKey] ?? "");
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [columns, filterValues, filters, query, rows, sortDirection, sortKey]);
  const visibleRows = criteriaReady ? filteredRows : [];

  const pageCount = Math.ceil(filteredRows.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const firstRowNumber = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRowNumber = Math.min(currentPage * pageSize, filteredRows.length);
  const pageRows = visibleRows.slice(firstRowNumber - 1, lastRowNumber);
  const pageRangeStart = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const pageRangeEnd = Math.min(pageCount, pageRangeStart + 4);
  const pageNumbers = Array.from(
    { length: Math.max(0, pageRangeEnd - pageRangeStart + 1) },
    (_, index) => pageRangeStart + index,
  );

  function changeSort(key: string) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function downloadCsv() {
    const escapeCell = (value: string) => {
      const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };
    const csvRows = [
      [...(showRowNumber ? ["No."] : []), ...columns.map((column) => column.label)],
      ...filteredRows.map((row, index) => [
        ...(showRowNumber ? [String(index + 1)] : []),
        ...columns.map((column) => row.values[column.key] ?? ""),
      ]),
    ];
    const csv = csvRows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="admin-data-table min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="admin-table-print-title">{title}</h2>
      <div className="print:hidden flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {criteriaReady
              ? `${filteredRows.length} ${filteredRows.length === 1 ? "record" : "records"}`
              : "Select search criteria to display records"}
            {query.trim() ? ` matching “${query.trim()}”` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative">
            <span className="sr-only">Search {title.toLocaleLowerCase()}</span>
            <Search
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowAllRecords(false);
                setPage(1);
              }}
              placeholder="Search records..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white sm:w-56"
            />
          </label>
          {filters.map((filter) => (
              <SearchableSelect
                key={filter.key}
                label={`Filter by ${filter.label.toLocaleLowerCase()}`}
                name={`filter-${filter.key}`}
                options={[
                  { value: "", label: `All ${filter.label.toLocaleLowerCase()}` },
                  ...filter.options,
                ]}
                defaultValue={filterValues[filter.key] ?? ""}
                placeholder={`Search ${filter.label.toLocaleLowerCase()}...`}
                onValueChange={(value) => {
                  setFilterValues((current) => ({ ...current, [filter.key]: value }));
                  setShowAllRecords(false);
                  setPage(1);
                }}
              />
          ))}
          {showAllRecordsLabel && (
            <button
              type="button"
              aria-pressed={showAllRecords}
              onClick={() => {
                setShowAllRecords((current) => !current);
                setFilterValues({});
                setQuery("");
                setPage(1);
              }}
              className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-medium text-violet-800 transition hover:bg-violet-100"
            >
              {showAllRecords ? "Showing all sections" : showAllRecordsLabel}
            </button>
          )}
          {toolbarActions}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visibleRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setPrintAll(true)}
            disabled={visibleRows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={16} aria-hidden="true" />
            {printButtonLabel}
          </button>
        </div>
      </div>

      {!criteriaReady ? (
        <p className="border-t border-slate-100 px-5 py-10 text-center text-sm text-slate-500">
          Select at least one search filter above to display records.
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          {query.trim() || hasActiveFilters ? "No records match your search and filters." : emptyMessage}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {showRowNumber && (
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">No.</th>
                  )}
                  {columns.map((column) => (
                    <th scope="col" key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => changeSort(column.key)}
                        className="inline-flex items-center gap-1 text-left hover:text-violet-700"
                        aria-label={`Sort by ${column.label}${sortKey === column.key ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}
                      >
                        {column.label}
                        {sortKey === column.key && <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                      </button>
                    </th>
                  ))}
                  {hasActions && (
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold print:hidden">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(printAll ? visibleRows : pageRows).map((row, index) => (
                  <tr key={row.id} className="align-top text-slate-700 hover:bg-violet-50/40">
                    {showRowNumber && (
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-500">
                        {(printAll ? 0 : firstRowNumber - 1) + index + 1}
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3">
                        {row.values[column.key] ? (
                          row.clickableColumns?.includes(column.key) ? (
                            <AdminRecordDialog
                              mode="view"
                              title={row.values[column.key]}
                              triggerLabel={row.values[column.key]}
                            >
                              <RecordDetails columns={columns} values={row.values} />
                            </AdminRecordDialog>
                          ) : row.values[column.key]
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-4 py-3 print:hidden">
                        <div className="flex min-w-max items-center gap-2">
                          {!hideDefaultView && (
                            <AdminRecordDialog mode="view" showLabel={showActionLabels} title={`View ${title.toLocaleLowerCase()} record`}>
                              <RecordDetails columns={columns} values={row.values} />
                            </AdminRecordDialog>
                          )}
                          {row.actions}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="print:hidden flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>
                Showing <span className="font-medium text-slate-700">{firstRowNumber}–{lastRowNumber}</span> of{" "}
                <span className="font-medium text-slate-700">{filteredRows.length}</span>
              </span>
              <label className="inline-flex items-center gap-2">
                Rows per page
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>
            {pageCount > 1 && (
              <nav aria-label={`${title} pages`} className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                {pageRangeStart > 1 && (
                  <>
                    <PageButton number={1} currentPage={currentPage} onSelect={setPage} />
                    {pageRangeStart > 2 && <span className="px-1 text-slate-400">…</span>}
                  </>
                )}
                {pageNumbers.map((number) => (
                  <PageButton key={number} number={number} currentPage={currentPage} onSelect={setPage} />
                ))}
                {pageRangeEnd < pageCount && (
                  <>
                    {pageRangeEnd < pageCount - 1 && <span className="px-1 text-slate-400">…</span>}
                    <PageButton number={pageCount} currentPage={currentPage} onSelect={setPage} />
                  </>
                )}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PageButton({
  number,
  currentPage,
  onSelect,
}: {
  number: number;
  currentPage: number;
  onSelect: (page: number) => void;
}) {
  return (
    <button
      type="button"
      aria-current={currentPage === number ? "page" : undefined}
      onClick={() => onSelect(number)}
      className={`min-w-9 rounded-lg border px-2.5 py-2 text-sm font-medium ${
        currentPage === number
          ? "border-violet-700 bg-violet-700 text-white"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {number}
    </button>
  );
}
