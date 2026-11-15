"use client";

import { useActionState } from "react";
import {
  createExamType,
  createExamination,
  createGradingScale,
  publishExamination,
  requestMarkCorrection,
  reviewExamSubject,
  reviewMarkCorrection,
  saveClassTeacherRemark,
  saveExamMarks,
  saveExamAttendance,
  savePrincipalRemark,
  submitExamSubject,
  updateExamSubjectSettings,
  type ExaminationActionState,
} from "./actions";

function Feedback({ state }: { state: ExaminationActionState }) {
  if (!state.error && !state.success) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={`mt-3 text-sm ${state.error ? "text-rose-700" : "text-emerald-700"}`}>
      {state.error ?? "Saved successfully."}
    </p>
  );
}

function SubmitButton({ children, pending }: { children: string; pending: boolean }) {
  return (
    <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Saving..." : children}
    </button>
  );
}

export function CreateExaminationForm({
  years,
  terms,
  examTypes,
  scales,
  classes,
}: {
  years: Array<{ id: number; name: string }>;
  terms: Array<{ id: number; academicYearId: number; name: string }>;
  examTypes: Array<{ id: number; name: string }>;
  scales: Array<{ id: number; name: string; isDefault: boolean }>;
  classes: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(createExamination, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Create examination</h2>
      <label className="block text-sm font-medium">Examination name
        <input required name="name" maxLength={120} className="mt-1 w-full rounded-lg border p-2.5" placeholder="Term 1 examinations" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Exam type
          <select required name="examTypeId" className="mt-1 w-full rounded-lg border p-2.5" defaultValue="">
            <option value="" disabled>Select type</option>
            {examTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Academic year
          <select required name="academicYearId" className="mt-1 w-full rounded-lg border p-2.5" defaultValue="">
            <option value="" disabled>Select year</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Term
          <select name="academicTermId" className="mt-1 w-full rounded-lg border p-2.5" defaultValue="">
            <option value="">No term</option>
            {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Grading scale
          <select required name="gradingScaleId" className="mt-1 w-full rounded-lg border p-2.5" defaultValue={scales.find((scale) => scale.isDefault)?.id ?? ""}>
            <option value="" disabled>Select scale</option>
            {scales.map((scale) => <option key={scale.id} value={scale.id}>{scale.name}{scale.isDefault ? " (default)" : ""}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">Start date
            <input required type="date" name="startDate" className="mt-1 w-full rounded-lg border p-2.5" />
          </label>
          <label className="text-sm font-medium">End date
            <input required type="date" name="endDate" className="mt-1 w-full rounded-lg border p-2.5" />
          </label>
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Classes (all assigned subjects will be included)</legend>
        <div className="grid max-h-40 grid-cols-2 gap-2 overflow-auto rounded-lg border p-3 sm:grid-cols-3">
          {classes.map((classLevel) => (
            <label key={classLevel.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="classLevelIds" value={classLevel.id} />
              {classLevel.name}
            </label>
          ))}
          {classes.length === 0 && <p className="col-span-full text-sm text-slate-500">Add active classes and subject assignments first.</p>}
        </div>
      </fieldset>
      <p className="text-xs text-slate-500">Each enrolled student is added to the selected class rosters. New subjects start with a 100-mark maximum and weight 1; adjust each before entering marks.</p>
      <SubmitButton pending={pending}>Create examination</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function CreateExamTypeForm() {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(createExamType, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Create exam type</h2>
      <label className="block text-sm font-medium">Exam name
        <input required name="name" maxLength={120} className="mt-1 w-full rounded-lg border p-2.5" placeholder="First Term" />
      </label>
      <label className="block text-sm font-medium">Average passing mark
        <input required type="number" min="0" max="100" step="0.01" name="averageMark" defaultValue="0" className="mt-1 w-full rounded-lg border p-2.5" />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="averagePassing" /> Use as the school&apos;s average-passing examination</label>
      <p className="text-xs text-slate-500">Exam types are reusable labels such as First Term or Mid-year. This passing threshold is stored on the type; each examination still uses its selected grading scale for result grades.</p>
      <SubmitButton pending={pending}>Save exam type</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function CreateGradingScaleForm() {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(createGradingScale, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Grading scales</h2>
      <label className="block text-sm font-medium">Scale name
        <input required name="name" maxLength={120} className="mt-1 w-full rounded-lg border p-2.5" placeholder="Standard 0–100" />
      </label>
      <label className="block text-sm font-medium">Grade bands
        <textarea required name="bands" rows={5} className="mt-1 w-full rounded-lg border p-2.5 font-mono text-xs" defaultValue={"0|40|F|Needs improvement|Needs additional support\n40|70|C|Satisfactory|Good effort\n70|100|A|Excellent|Outstanding performance"} />
      </label>
      <p className="text-xs text-slate-500">One row per band: minimum % | maximum % | grade | description | performance remark. Bands must cover 0–100 without gaps or overlaps. Lower bounds are inclusive; the 100% maximum is inclusive.</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isDefault" /> Make default</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="allowRanking" /> Enable class ranking</label>
      </div>
      <SubmitButton pending={pending}>Save grading scale</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SaveExamAttendanceForm({
  examSubjectId,
  students,
  editable,
}: {
  examSubjectId: number;
  editable: boolean;
  students: Array<{
    enrollmentId: number;
    name: string;
    admissionNumber: string | null;
    status: string | null;
    note: string | null;
  }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(saveExamAttendance, {});
  if (!editable) return <p className="text-sm text-slate-600">Attendance is read-only after results are published.</p>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th><th className="p-3">Attendance</th><th className="p-3">Note</th></tr></thead>
          <tbody>{students.map((student) => (
            <tr key={student.enrollmentId} className="border-t">
              <td className="p-3 font-medium">{student.name}</td>
              <td className="p-3">{student.admissionNumber ?? "—"}</td>
              <td className="p-3"><select required name={`attendance_${student.enrollmentId}`} defaultValue={student.status ?? ""} className="rounded-lg border p-2"><option value="" disabled>Select status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></td>
              <td className="p-3"><input name={`note_${student.enrollmentId}`} maxLength={500} defaultValue={student.note ?? ""} className="w-full min-w-40 rounded-lg border p-2" /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <SubmitButton pending={pending}>Save exam attendance</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SubjectSettingsForm({
  examSubjectId,
  examDate,
  maxMarks,
  weight,
}: {
  examSubjectId: number;
  examDate: string;
  maxMarks: string;
  weight: string;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(updateExamSubjectSettings, {});
  return (
    <form action={action} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <label className="text-xs font-medium">Date<input required type="date" name="examDate" defaultValue={examDate} className="mt-1 w-full rounded border p-2" /></label>
      <label className="text-xs font-medium">Maximum marks<input required type="number" step="0.01" min="0.01" name="maxMarks" defaultValue={maxMarks} className="mt-1 w-full rounded border p-2" /></label>
      <label className="text-xs font-medium">Weight<input required type="number" step="0.01" min="0.01" name="weight" defaultValue={weight} className="mt-1 w-full rounded border p-2" /></label>
      <div className="flex items-end"><SubmitButton pending={pending}>Update assessment</SubmitButton></div>
      <div className="sm:col-span-4"><Feedback state={state} /></div>
    </form>
  );
}

export function SaveMarksForm({
  examSubjectId,
  students,
  maxMarks,
  editable,
}: {
  examSubjectId: number;
  maxMarks: string;
  editable: boolean;
  students: Array<{ enrollmentId: number; name: string; admissionNumber: string | null; marks: string | null; teacherRemark: string | null }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(saveExamMarks, {});
  if (!editable) return null;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th><th className="p-3">Marks / {maxMarks}</th><th className="p-3">Teacher remark</th></tr></thead>
          <tbody>{students.map((student) => (
            <tr key={student.enrollmentId} className="border-t">
              <td className="p-3 font-medium">{student.name}</td>
              <td className="p-3">{student.admissionNumber ?? "—"}</td>
              <td className="p-3"><input aria-label={`Marks for ${student.name}`} type="number" name={`marks_${student.enrollmentId}`} min="0" max={maxMarks} step="0.01" defaultValue={student.marks ?? ""} className="w-28 rounded-lg border p-2" /></td>
              <td className="p-3"><input aria-label={`Teacher remark for ${student.name}`} name={`remark_${student.enrollmentId}`} maxLength={1000} defaultValue={student.teacherRemark ?? ""} className="w-full min-w-48 rounded-lg border p-2" /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <SubmitButton pending={pending}>Save draft marks</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SubmitSubjectForm({ examSubjectId }: { examSubjectId: number }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(submitExamSubject, {});
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <SubmitButton pending={pending}>Submit for approval</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function ReviewSubjectForm({ examSubjectId }: { examSubjectId: number }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(reviewExamSubject, {});
  return (
    <form action={action} className="mt-3 space-y-2 rounded-xl bg-violet-50 p-3">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <label className="block text-xs font-medium">Review note<input name="reviewNote" maxLength={1000} className="mt-1 w-full rounded border p-2" /></label>
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="approve" disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve</button>
        <button name="decision" value="return" disabled={pending} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60">Return to teacher</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function PublishExaminationForm({ examinationId }: { examinationId: number }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(publishExamination, {});
  return (
    <form action={action} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <input type="hidden" name="examinationId" value={examinationId} />
      <h2 className="font-bold text-emerald-950">Publish results</h2>
      <p className="my-2 text-sm text-emerald-900">Publication locks marks. Every assessment must have complete, approved marks. Further changes require a reviewed correction request.</p>
      <SubmitButton pending={pending}>Publish all results</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function ClassTeacherRemarkForm({
  examClassId,
  enrollmentId,
  remark,
}: {
  examClassId: number;
  enrollmentId: number;
  remark: string | null;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(saveClassTeacherRemark, {});
  return (
    <form action={action} className="mt-2 print:hidden">
      <input type="hidden" name="examClassId" value={examClassId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <label className="block text-xs font-medium text-slate-600">Class teacher remark
        <textarea name="remark" maxLength={1000} rows={2} defaultValue={remark ?? ""} className="mt-1 w-full rounded-lg border p-2" />
      </label>
      <button disabled={pending} className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60">{pending ? "Saving..." : "Save remark"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function PrincipalRemarkForm({
  examClassId,
  remark,
}: {
  examClassId: number;
  remark: string | null;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(savePrincipalRemark, {});
  return (
    <form action={action} className="rounded-xl border bg-white p-4">
      <input type="hidden" name="examClassId" value={examClassId} />
      <label className="block text-sm font-semibold">Principal remark for report cards
        <textarea name="remark" maxLength={1000} rows={3} defaultValue={remark ?? ""} className="mt-2 w-full rounded-lg border p-2.5" />
      </label>
      <SubmitButton pending={pending}>Save principal remark</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function CorrectionRequestForm({
  examMarkId,
  previousMarks,
  maxMarks,
}: {
  examMarkId: number;
  previousMarks: string;
  maxMarks: string;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(requestMarkCorrection, {});
  return (
    <form action={action} className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 print:hidden">
      <input type="hidden" name="examMarkId" value={examMarkId} />
      <p className="text-xs font-semibold text-amber-900">Published mark: {previousMarks}. Request changes with a reason; the published value remains until approved.</p>
      <label className="block text-xs font-medium">Requested marks
        <input required type="number" min="0" max={maxMarks} step="0.01" name="requestedMarks" defaultValue={previousMarks} className="mt-1 w-full rounded border p-2" />
      </label>
      <label className="block text-xs font-medium">Reason
        <textarea required name="reason" maxLength={1000} rows={2} className="mt-1 w-full rounded border p-2" />
      </label>
      <SubmitButton pending={pending}>Request correction</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function ReviewCorrectionForm({ correctionId }: { correctionId: number }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(reviewMarkCorrection, {});
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-3 print:hidden">
      <input type="hidden" name="correctionId" value={correctionId} />
      <label className="min-w-52 flex-1 text-xs font-medium">Review note
        <input name="reviewNote" maxLength={1000} className="mt-1 w-full rounded border p-2" />
      </label>
      <button name="decision" value="approve" disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve correction</button>
      <button name="decision" value="reject" disabled={pending} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60">Reject</button>
      <Feedback state={state} />
    </form>
  );
}
