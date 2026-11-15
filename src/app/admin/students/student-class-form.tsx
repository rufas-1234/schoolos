"use client";

import { useActionState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import {
  addStudentClass,
  updateStudentClass,
  type StudentClassActionState,
} from "./class-actions";

type SectionOption = { id: number; label: string };
type AssignmentRecord = {
  publicId: string;
  classSectionId: number;
  rollNumber: string | null;
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white";

export function StudentClassForm({
  sections,
  studentPublicId,
  branchId,
  academicYearId,
  sourceSectionId,
  record,
  studentLabel,
}: {
  sections: SectionOption[];
  studentPublicId: string;
  studentLabel?: string;
  branchId?: number;
  academicYearId?: number;
  sourceSectionId?: number;
  record?: AssignmentRecord;
}) {
  const [state, formAction, pending] = useActionState<StudentClassActionState, FormData>(
    record ? updateStudentClass : addStudentClass,
    {},
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!record && !window.confirm(
          `Are you sure you want to add ${studentLabel || "this student"} to the selected class and section?`,
        )) {
          event.preventDefault();
        }
      }}
      className="space-y-5"
    >
      {record ? (
        <input type="hidden" name="enrollmentPublicId" value={record.publicId} />
      ) : (
        <>
          <input type="hidden" name="studentPublicId" value={studentPublicId} />
          <input type="hidden" name="branchId" value={branchId ?? ""} />
          <input type="hidden" name="academicYearId" value={academicYearId ?? ""} />
          <input type="hidden" name="sourceSectionId" value={sourceSectionId ?? ""} />
        </>
      )}
      <SearchableSelect
        label="Class and section"
        name="targetSectionId"
        options={sections.map((section) => ({ value: String(section.id), label: section.label }))}
        required
        defaultValue={record ? String(record.classSectionId) : ""}
        placeholder="Search class sections..."
        disabled={!sections.length}
      />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Roll number
        <input
          name="rollNumber"
          maxLength={40}
          defaultValue={record?.rollNumber ?? ""}
          className={inputClass}
        />
      </label>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">Class assignment saved.</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : record ? "Save changes" : "Add class"}
        </button>
      </div>
    </form>
  );
}
