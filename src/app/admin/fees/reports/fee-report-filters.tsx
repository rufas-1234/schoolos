"use client";

import type { ChangeEvent } from "react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";

export function FeeReportFilters({
  from,
  to,
  branches,
  classes,
  sections,
  statuses,
  selectedBranch,
  selectedClass,
  selectedSection,
  selectedStatus,
}: {
  from: string;
  to: string;
  branches: SearchableSelectOption[];
  classes: SearchableSelectOption[];
  sections: SearchableSelectOption[];
  statuses: SearchableSelectOption[];
  selectedBranch: string;
  selectedClass: string;
  selectedSection: string;
  selectedStatus: string;
}) {
  function submitOnChange(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form method="get" className="print:hidden grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-sm font-medium text-slate-700">From
        <input type="date" name="from" defaultValue={from} onChange={submitOnChange} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input type="date" name="to" defaultValue={to} onChange={submitOnChange} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
      </label>
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches}
        defaultValue={selectedBranch}
        placeholder="Search branches..."
        autoSubmit
      />
      <SearchableSelect
        label="Class"
        name="classLevelId"
        options={classes}
        defaultValue={selectedClass}
        placeholder="Search classes..."
        autoSubmit
      />
      <SearchableSelect
        label="Section"
        name="sectionId"
        options={sections}
        defaultValue={selectedSection}
        placeholder="Search sections..."
        autoSubmit
      />
      <SearchableSelect
        label="Payment status"
        name="status"
        options={statuses}
        defaultValue={selectedStatus}
        placeholder="Search statuses..."
        autoSubmit
      />
    </form>
  );
}
