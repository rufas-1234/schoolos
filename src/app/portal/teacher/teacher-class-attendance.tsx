"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCheck, Search, Save } from "lucide-react";
import { attendanceStatuses, type AttendanceStatus } from "@/lib/attendance-policy";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { saveTeacherClassAttendance } from "./teacher-actions";

export type TeacherClassSectionOption = {
  id: number;
  label: string;
};

export type TeacherClassStudent = {
  id: number;
  enrollmentId: number;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
  rollNumber: string | null;
  status: AttendanceStatus | null;
  note: string | null;
  absencesInLast30Days: number;
  publishedReports: { examId: number; examName: string }[];
};

const statusLabels: Record<AttendanceStatus | "", string> = {
  "": "Not marked",
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export function TeacherClassAttendance({
  sections,
  selectedSectionId,
  attendanceDate,
  students,
}: {
  sections: TeacherClassSectionOption[];
  selectedSectionId: string;
  attendanceDate: string;
  students: TeacherClassStudent[];
}) {
  const initialStatuses = Object.fromEntries(
    students.map((student) => [student.id, student.status ?? ""]),
  ) as Record<number, AttendanceStatus | "">;
  const [statuses, setStatuses] = useState(initialStatuses);
  const [state, formAction, pending] = useActionState<
    { error?: string; success?: boolean },
    FormData
  >(saveTeacherClassAttendance, {});
  const [studentSearch, setStudentSearch] = useState("");
  const filteredStudents = students.filter((student) =>
    `${student.firstName} ${student.lastName} ${student.admissionNumber ?? ""} ${student.rollNumber ?? ""}`
      .toLocaleLowerCase().includes(studentSearch.trim().toLocaleLowerCase()),
  );

  function setAll(status: AttendanceStatus) {
    setStatuses(Object.fromEntries(students.map((student) => [student.id, status])) as Record<number, AttendanceStatus>);
  }

  return (
    <div className="space-y-4">
      <SmartFilterForm method="get" className="print:hidden grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:items-end">
        <input type="hidden" name="section" value="register" />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Appointed class
          <select
            name="classSectionId"
            required
            defaultValue={selectedSectionId}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
          >
            <option value="" disabled>Select a class</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Attendance date
          <input
            type="date"
            name="attendanceDate"
            required
            defaultValue={attendanceDate}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
          />
        </label>
        <button type="submit" className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
          Load class
        </button>
      </SmartFilterForm>

      {!sections.length ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No active class-teacher appointments were found. Ask an administrator to assign your class.
        </p>
      ) : !selectedSectionId ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          Select an appointed class and date to view its register and attendance.
        </p>
      ) : students.length ? (
        <form action={formAction} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <input type="hidden" name="classSectionId" value={selectedSectionId} />
          <input type="hidden" name="attendanceDate" value={attendanceDate} />
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-950">Class register · {attendanceDate}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {studentSearch ? `Showing ${filteredStudents.length} of ` : ""}{students.length} currently enrolled students
              </p>
            </div>
            <div className="print:hidden flex flex-wrap gap-2">
              <button type="button" onClick={() => setAll("present")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                <CheckCheck size={14} aria-hidden="true" /> All present
              </button>
              <button type="button" onClick={() => setAll("absent")} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50">
                <CheckCheck size={14} aria-hidden="true" /> All absent
              </button>
            </div>
          </div>
          <label className="print:hidden flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm text-slate-500">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search students</span>
            <input
              type="search"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Search by student name, admission number, or roll number"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none focus:ring-0"
            />
          </label>
          <div className="divide-y divide-slate-100">
            {filteredStudents.length ? filteredStudents.map((student, index) => (
              <article key={student.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(10rem,1fr)] sm:items-end">
                <div>
                  <p className="text-xs font-medium text-slate-400">Student {index + 1}{student.rollNumber ? ` · Roll ${student.rollNumber}` : ""}</p>
                  <p className="mt-1 font-semibold text-slate-900">{student.firstName} {student.lastName}</p>
                  {student.admissionNumber && <p className="mt-0.5 text-xs text-slate-500">Admission: {student.admissionNumber}</p>}
                  {student.absencesInLast30Days > 0 && (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      {student.absencesInLast30Days} absence{student.absencesInLast30Days === 1 ? "" : "s"} in the last 30 days
                    </p>
                  )}
                  {student.publishedReports.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {student.publishedReports.map((report) => (
                        <Link
                          key={report.examId}
                          href={`/admin/examinations/${report.examId}/report-cards/${student.enrollmentId}`}
                          className="text-xs font-semibold text-violet-700 hover:text-violet-900"
                        >
                          {report.examName} report
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <label className="block space-y-1 text-xs font-semibold text-slate-600">
                  Attendance
                  <span className="hidden print:block pt-1 text-sm font-normal text-slate-800">
                    {statusLabels[statuses[student.id] ?? ""]}
                  </span>
                  <select
                    name={`status_${student.id}`}
                    value={statuses[student.id] ?? ""}
                    onChange={(event) => setStatuses((current) => ({
                      ...current,
                      [student.id]: event.target.value as AttendanceStatus | "",
                    }))}
                    className="print:hidden w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800"
                  >
                    <option value="">Not marked</option>
                    {attendanceStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </select>
                </label>
                <label className="block space-y-1 text-xs font-semibold text-slate-600">
                  Note (optional)
                  <span className="hidden print:block pt-1 text-sm font-normal text-slate-800">
                    {student.note || "—"}
                  </span>
                  <input
                    name={`note_${student.id}`}
                    defaultValue={student.note ?? ""}
                    maxLength={500}
                    className="print:hidden w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800"
                  />
                </label>
              </article>
            )) : (
              <p className="p-5 text-sm text-slate-500">No students match your search.</p>
            )}
          </div>
          <div className="print:hidden flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className={state.error ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>
              {state.error ?? (state.success ? "Attendance saved." : "")}
            </p>
            <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
              <Save size={16} aria-hidden="true" />
              {pending ? "Saving..." : "Save attendance"}
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No currently enrolled students were found in this class for the selected date.
        </p>
      )}
    </div>
  );
}
