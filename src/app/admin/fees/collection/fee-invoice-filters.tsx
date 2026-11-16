"use client";

import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";

export function FeeInvoiceFilters({
  search,
  branches,
  classes,
  sections,
  selectedBranch,
  selectedClass,
  selectedSection,
  selectedStatus,
}: {
  search: string;
  branches: SearchableSelectOption[];
  classes: SearchableSelectOption[];
  sections: SearchableSelectOption[];
  selectedBranch: string;
  selectedClass: string;
  selectedSection: string;
  selectedStatus: string;
}) {
  return (
    <SmartFilterForm method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Search student
        <input
          name="search"
          type="search"
          defaultValue={search}
          autoComplete="off"
          placeholder="Type a name, admission or roll number..."
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">Results update as you type.</span>
      </label>
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches}
        defaultValue={selectedBranch}
        placeholder="Search branches..."
        emptyLabel="No branches found."
        autoSubmit
      />
      <SearchableSelect
        label="Class"
        name="classLevelId"
        options={classes}
        defaultValue={selectedClass}
        placeholder="Search classes..."
        emptyLabel="No classes found."
        autoSubmit
      />
      <SearchableSelect
        label="Section"
        name="sectionId"
        options={sections}
        defaultValue={selectedSection}
        placeholder="Search sections..."
        emptyLabel="No sections found."
        autoSubmit
      />
      <SearchableSelect
        label="Payment status"
        name="status"
        options={[
          { value: "", label: "All statuses" },
          { value: "unpaid", label: "Unpaid" },
          { value: "partial", label: "Partial" },
          { value: "paid", label: "Paid" },
        ]}
        defaultValue={selectedStatus}
        placeholder="Search statuses..."
        autoSubmit
      />
      <div className="sm:col-span-2 xl:col-span-6">
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
          Search invoices
        </button>
      </div>
    </SmartFilterForm>
  );
}
