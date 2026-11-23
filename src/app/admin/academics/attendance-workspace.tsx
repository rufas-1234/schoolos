"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCheck, Save } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { attendanceStatuses, type AttendanceStatus } from "@/lib/attendance-policy";
import { SearchableSelect } from "@/components/searchable-select";
import { saveAttendance } from "./attendance-actions";
import type { AcademicActionState } from "./actions";

type AttendanceOption = { id: number; label: string };
type AttendanceRecord = {
  studentId: number;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
  status: AttendanceStatus | null;
  note: string | null;
};

const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export function AttendanceWorkspace({
  sections,
  schoolName,
  selectedSectionId,
  attendanceDate,
  roster,
  canManageAttendance,
}: {
  sections: AttendanceOption[];
  schoolName: string;
  selectedSectionId: string;
  attendanceDate: string;
  roster: AttendanceRecord[];
  canManageAttendance: boolean;
}) {
  const initialStatuses = Object.fromEntries(
    roster.map((student) => [student.studentId, student.status ?? ""]),
  ) as Record<number, AttendanceStatus | "">;
  const [statuses, setStatuses] = useState(initialStatuses);
  const [state, formAction, pending] = useActionState<AcademicActionState, FormData>(
    saveAttendance,
    {},
  );
  const setAllStatuses = (status: AttendanceStatus) => {
    setStatuses(Object.fromEntries(
      roster.map((student) => [student.studentId, status]),
    ) as Record<number, AttendanceStatus | "">);
  };
  const totals = useMemo(
    () =>
      attendanceStatuses.reduce(
        (counts, status) => ({
          ...counts,
          [status]: Object.values(statuses).filter((value) => value === status).length,
        }),
        { present: 0, absent: 0, late: 0, excused: 0 },
      ),
    [statuses],
  );

  return (
    <div className="space-y-4">
      <form
        method="get"
        className="print:hidden grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:items-end"
      >
        <input type="hidden" name="section" value="attendance" />
        <SearchableSelect
          label="Class section"
          name="attendanceSectionId"
          options={sections.map((section) => ({ value: String(section.id), label: section.label }))}
          required
          defaultValue={selectedSectionId}
          placeholder="Search class sections..."
          disabled={!sections.length}
        />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Attendance date <span className="text-rose-600" aria-hidden="true">*</span>
          <input
            type="date"
            name="attendanceDate"
            required
            defaultValue={attendanceDate}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800"
        >
          Load roster
        </button>
      </form>

      {!canManageAttendance && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You can view attendance, but your account does not have permission to record or change it.
        </p>
      )}

      {canManageAttendance && !selectedSectionId && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Select an active class section and attendance date, then load the roster.
        </p>
      )}

      {selectedSectionId && roster.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No currently enrolled students were found in this section for the selected date.
        </p>
      )}

      {roster.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Attendance roster</h2>
              <p className="mt-1 text-sm text-slate-500">
                {roster.length} enrolled {roster.length === 1 ? "student" : "students"} · {attendanceDate}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              {attendanceStatuses.map((status) => (
                <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {statusLabels[status]}: {totals[status]}
                </span>
              ))}
            </div>
            <PrintButton label="Print attendance report" targetId="student-attendance-report-output" />
          </div>
          {canManageAttendance ? (
            <form action={formAction}>
              <input type="hidden" name="classSectionId" value={selectedSectionId} />
              <input type="hidden" name="attendanceDate" value={attendanceDate} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">No.</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Admission number</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Note</th>
                    </tr>
                  </thead>
                  <caption className="caption-top px-4 py-3 text-left">
                    <span className="mr-3 text-xs font-medium text-slate-500">Quick mark everyone:</span>
                    <button
                      type="button"
                      onClick={() => setAllStatuses("present")}
                      className="mr-2 inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                    >
                      <CheckCheck size={14} aria-hidden="true" /> All present
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllStatuses("absent")}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50"
                    >
                      <CheckCheck size={14} aria-hidden="true" /> All absent
                    </button>
                  </caption>
                  <tbody className="divide-y divide-slate-100">
                    {roster.map((student, index) => (
                      <tr key={student.studentId}>
                        <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {student.firstName} {student.lastName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.admissionNumber ?? "—"}</td>
                        <td className="px-4 py-3">
                          <select
                            name={`status_${student.studentId}`}
                            value={statuses[student.studentId] ?? ""}
                            onChange={(event) =>
                              setStatuses((current) => ({
                                ...current,
                                [student.studentId]: event.target.value as AttendanceStatus | "",
                              }))
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400"
                          >
                            <option value="">Not marked</option>
                            {attendanceStatuses.map((status) => (
                              <option key={status} value={status}>{statusLabels[status]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            name={`note_${student.studentId}`}
                            defaultValue={student.note ?? ""}
                            maxLength={500}
                            aria-label={`Attendance note for ${student.firstName} ${student.lastName}`}
                            placeholder="Optional note"
                            className="w-full min-w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-sm text-rose-700">
                  {state.error ?? (state.success ? "Attendance saved." : "")}
                </p>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} aria-hidden="true" />
                  {pending ? "Saving..." : "Save attendance"}
                </button>
              </div>
            </form>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">No.</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roster.map((student, index) => (
                    <tr key={student.studentId}>
                      <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {student.firstName} {student.lastName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {student.status ? statusLabels[student.status] : "Not marked"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <section
            id="student-attendance-report-output"
            className="hidden student-report-document p-6 print:block print-report-content"
          >
            <header className="mb-5 border-b-2 border-black pb-4 text-center">
              <h1 className="text-2xl font-bold">{schoolName}</h1>
              <h2 className="mt-1 text-xl font-bold">Student Attendance Report</h2>
              <p className="mt-2 text-sm">
                {sections.find((section) => String(section.id) === selectedSectionId)?.label ?? "Class section"} · {attendanceDate}
              </p>
            </header>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Student</th>
                  <th>Admission number</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((student, index) => (
                  <tr key={student.studentId}>
                    <td>{index + 1}</td>
                    <td>{student.firstName} {student.lastName}</td>
                    <td>{student.admissionNumber ?? "—"}</td>
                    <td>{student.status ? statusLabels[student.status] : "Not marked"}</td>
                    <td>{student.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="mt-6 border-t border-black pt-2 text-xs">
              {roster.length} enrolled {roster.length === 1 ? "student" : "students"} · Generated {new Date().toLocaleDateString()}
            </footer>
          </section>
        </section>
      )}
    </div>
  );
}
