"use client";

import { useActionState, useState } from "react";
import {
  AdminDataTable,
  type AdminTableFilter,
  type AdminTableRow,
} from "@/components/admin-data-table";
import { isElectiveSelectionStatus } from "@/lib/elective-selection-policy";
import { saveElectiveSelections, type ElectiveSelectionActionState } from "./elective-actions";

type ElectiveStudent = {
  enrollmentId: number;
  name: string;
  admissionNumber: string | null;
  sectionName: string;
  selectionStatus: "pending" | "selected" | "not_selected";
};

const selectionLabels = {
  pending: "Pending",
  selected: "Taking subject",
  not_selected: "Not taking subject",
} as const;

export function ElectiveSelectionForm({
  classSubjectId,
  academicYearId,
  subjectName,
  students,
  sections,
}: {
  classSubjectId: number;
  academicYearId: number;
  subjectName: string;
  students: ElectiveStudent[];
  sections: AdminTableFilter["options"];
}) {
  const [state, action, pending] = useActionState<ElectiveSelectionActionState, FormData>(
    saveElectiveSelections,
    {},
  );
  const [selections, setSelections] = useState<Record<number, ElectiveStudent["selectionStatus"]>>(
    () => Object.fromEntries(students.map((student) => [student.enrollmentId, student.selectionStatus])),
  );

  const setEveryStudent = (selectionStatus: ElectiveStudent["selectionStatus"]) => {
    setSelections(Object.fromEntries(students.map((student) => [
      student.enrollmentId,
      selectionStatus,
    ])));
  };
  const rows: AdminTableRow[] = students.map((student) => ({
    id: student.enrollmentId,
    values: {
      student: student.name,
      admissionNumber: student.admissionNumber ?? "",
      stream: student.sectionName,
      currentChoice: selectionLabels[selections[student.enrollmentId] ?? "pending"],
    },
    searchableText: `${student.name} ${student.admissionNumber ?? ""} ${student.sectionName}`,
    actions: (
      <label className="block min-w-44">
        <span className="sr-only">Elective choice for {student.name}</span>
        <select
          value={selections[student.enrollmentId] ?? "pending"}
          onChange={(event) => {
            const selectionStatus = event.target.value;
            if (!isElectiveSelectionStatus(selectionStatus)) return;
            setSelections((current) => ({
              ...current,
              [student.enrollmentId]: selectionStatus,
            }));
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800"
        >
          <option value="pending">Pending confirmation</option>
          <option value="selected">Taking subject</option>
          <option value="not_selected">Not taking subject</option>
        </select>
      </label>
    ),
  }));
  const filters: AdminTableFilter[] = [{
    key: "stream",
    label: "Stream",
    options: sections,
  }];
  const toolbarActions = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setEveryStudent("selected")}
        className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
      >
        Set all to taking
      </button>
      <button
        type="button"
        onClick={() => setEveryStudent("not_selected")}
        className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
      >
        Set all to not taking
      </button>
      <button
        type="button"
        onClick={() => setEveryStudent("pending")}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Reset all to pending
      </button>
    </div>
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="classSubjectId" value={classSubjectId} />
      <input type="hidden" name="academicYearId" value={academicYearId} />
      {students.map((student) => (
        <input
          key={student.enrollmentId}
          type="hidden"
          name={`selection_${student.enrollmentId}`}
          value={selections[student.enrollmentId] ?? "pending"}
        />
      ))}
      <p className="text-sm text-slate-600">
        Choices apply to all streams in this class. Bulk actions affect every student, even when the table is filtered or searched.
        Students still marked pending must be confirmed before exam attendance can be saved.
      </p>
      <AdminDataTable
        title={`${subjectName} elective choices`}
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission no." },
          { key: "stream", label: "Stream" },
          { key: "currentChoice", label: "Current choice" },
        ]}
        rows={rows}
        filters={filters}
        toolbarActions={toolbarActions}
        emptyMessage="No enrolled students are available for this class in the active academic year."
        hideDefaultView
        showRowNumber={false}
        mobileCardView
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !students.length}
          className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving choices..." : "Save elective choices"}
        </button>
        {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-emerald-700">Elective choices saved.</p>}
      </div>
    </form>
  );
}
