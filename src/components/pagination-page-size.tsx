"use client";

import { PAGE_SIZE_OPTIONS } from "./pagination-utils";

export function PaginationPageSize({
  currentPageSize,
  firstPageHref,
  pageSizeParam = "pageSize",
  ariaLabel,
}: {
  currentPageSize: number;
  firstPageHref: string;
  pageSizeParam?: string;
  ariaLabel: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      Rows per page
      <select
        aria-label={`${ariaLabel} rows per page`}
        value={currentPageSize}
        onChange={(event) => {
          const target = new URL(firstPageHref, window.location.origin);
          target.searchParams.set(pageSizeParam, event.currentTarget.value);
          window.location.assign(target.toString());
        }}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>
    </label>
  );
}
