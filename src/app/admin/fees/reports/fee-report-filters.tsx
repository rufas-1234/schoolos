"use client";

import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";

export function FeeReportFilters({
  from,
  to,
  branches,
  classes,
  sections,
  feeTypes,
  statuses,
  currencies,
  selectedBranch,
  selectedClass,
  selectedSection,
  selectedFeeType,
  selectedStatus,
  selectedCurrency,
}: {
  from: string;
  to: string;
  branches: SearchableSelectOption[];
  classes: SearchableSelectOption[];
  sections: SearchableSelectOption[];
  feeTypes: SearchableSelectOption[];
  statuses: SearchableSelectOption[];
  currencies: SearchableSelectOption[];
  selectedBranch: string;
  selectedClass: string;
  selectedSection: string;
  selectedFeeType: string;
  selectedStatus: string;
  selectedCurrency: string;
}) {
  return (
    <SmartFilterForm method="get" className="print:hidden grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-medium text-slate-700">From
        <input type="date" name="from" defaultValue={from} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input type="date" name="to" defaultValue={to} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
      </label>
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches}
        defaultValue={selectedBranch}
        placeholder="Search branches..."
      />
      <SearchableSelect
        label="Class"
        name="classLevelId"
        options={classes}
        defaultValue={selectedClass}
        placeholder="Search classes..."
      />
      <SearchableSelect
        label="Section"
        name="sectionId"
        options={sections}
        defaultValue={selectedSection}
        placeholder="Search sections..."
      />
      <SearchableSelect
        label="Fee type"
        name="feeTypeId"
        options={feeTypes}
        defaultValue={selectedFeeType}
        placeholder="Search fee types..."
      />
      <SearchableSelect
        label="Payment status"
        name="status"
        options={statuses}
        defaultValue={selectedStatus}
        placeholder="Search statuses..."
      />
      <SearchableSelect
        label="Currency"
        name="currency"
        options={currencies}
        defaultValue={selectedCurrency}
        placeholder="Search currencies..."
      />
      <div className="flex items-end">
        <a
          href="/admin/fees/reports"
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reset
        </a>
      </div>
    </SmartFilterForm>
  );
}
