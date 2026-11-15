"use client";

import { useActionState } from "react";
import { RequiredMark } from "@/components/required-mark";
import { SearchableSelect } from "@/components/searchable-select";
import {
  saveStudentCategory,
  type StudentCategoryActionState,
} from "./category-actions";

type BranchOption = { id: number; label: string };
type CategoryRecord = { publicId: string; branchId: number; name: string };

export function StudentCategoryForm({
  branches,
  record,
}: {
  branches: BranchOption[];
  record?: CategoryRecord;
}) {
  const [state, formAction, pending] = useActionState<StudentCategoryActionState, FormData>(
    saveStudentCategory,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      {record && <input type="hidden" name="publicId" value={record.publicId} />}
      <p className="text-xs text-slate-500">
        <RequiredMark /> Required fields
      </p>
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        required
        defaultValue={record ? String(record.branchId) : ""}
        placeholder="Search branches..."
        disabled={!branches.length}
      />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Category <RequiredMark />
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={record?.name ?? ""}
          placeholder="For example, Learning support"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
        />
      </label>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && (
        <p role="status" className="text-sm text-emerald-700">
          Category {record ? "updated" : "created"} successfully.
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : record ? "Save changes" : "Add category"}
        </button>
      </div>
    </form>
  );
}
