"use client";

import { useState } from "react";
import { CatalogEntryForm } from "./catalog-forms";
import { SearchableSelect } from "@/components/searchable-select";
import type { HrCatalogKind } from "./catalog-actions";

type CatalogEntry = {
  id: number;
  name: string;
  branchId: number | null;
  branchName: string | null;
  branchCode: string | null;
  staffCount: number;
};

export function CatalogDirectory({
  kind,
  entries,
}: {
  kind: HrCatalogKind;
  entries: CatalogEntry[];
}) {
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const branchOptions = [...new Map(entries.map((entry) => [
    entry.branchId === null ? "__legacy__" : String(entry.branchId),
    entry.branchName ? `${entry.branchName}${entry.branchCode ? ` (${entry.branchCode})` : ""}` : "All branches · legacy",
  ])).entries()].map(([value, label]) => ({ value, label }));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEntries = entries.filter((entry) => {
    const matchesBranch = !branchFilter ||
      (branchFilter === "__legacy__" ? entry.branchId === null : String(entry.branchId) === branchFilter);
    const matchesQuery = !normalizedQuery ||
      `${entry.name} ${entry.branchName ?? ""} ${entry.branchCode ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    return matchesBranch && matchesQuery;
  });
  const label = kind === "department" ? "department" : "designation";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">{label === "department" ? "Departments" : "Designations"} directory</h2>
          <p className="mt-1 text-sm text-slate-500">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            Search by name or branch
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label}s...`}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
            />
          </label>
          <SearchableSelect
            label="Branch"
            name="branchFilter"
            options={[
              { value: "", label: "All branches" },
              ...branchOptions,
            ]}
            defaultValue={branchFilter}
            placeholder="Search branches..."
            onValueChange={setBranchFilter}
          />
        </div>
      </div>
      {filteredEntries.length === 0 ? (
        <p className="p-7 text-center text-sm text-slate-500">
          {entries.length === 0 ? `No ${label} entries yet.` : `No ${label} entries match these filters.`}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filteredEntries.map((entry) => (
            <CatalogEntryForm
              key={entry.id}
              id={entry.id}
              kind={kind}
              name={entry.name}
              branchName={entry.branchName}
              branchCode={entry.branchCode}
              staffCount={entry.staffCount}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
