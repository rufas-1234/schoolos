"use client";

import { useActionState, useState, type ReactNode } from "react";
import { AdminDeleteButton } from "@/components/admin-data-table";
import {
  createExamType,
  createExamination,
  createGradingScale,
  deleteExamination,
  publishExamination,
  requestMarkCorrection,
  reviewExamSubject,
  reviewMarkCorrection,
  saveClassTeacherRemark,
  saveExamMarks,
  saveExamAttendance,
  savePrincipalRemark,
  submitExamSubject,
  updateExamination,
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
  branches,
  classes,
  today,
  record,
}: {
  years: Array<{ id: number; name: string; status: string; startDate: string; endDate: string }>;
  terms: Array<{ id: number; academicYearId: number; name: string; startDate: string; endDate: string }>;
  branches: Array<{ id: number; name: string }>;
  classes: Array<{ id: number; name: string; branchId: number; branchName: string }>;
  today: string;
  record?: {
    id: number;
    name: string;
    branchId: number | null;
    examSystem: string;
    startDate: string;
    endDate: string;
    academicYearId: number;
    academicTermId: number | null;
    classNames: string[];
    components: Array<{ title: string; maxMarks: number }>;
  };
}) {
  const formAction = record ? updateExamination : createExamination;
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(formAction, {});
  const defaultYear = years.find((year) => year.status === "active") ?? years[0];
  const initialTerm =
    terms.find((term) => term.academicYearId === defaultYear?.id && term.startDate <= today && term.endDate >= today) ??
    terms.find((term) => term.academicYearId === defaultYear?.id);
  const [academicYearId, setAcademicYearId] = useState(String(record?.academicYearId ?? defaultYear?.id ?? ""));
  const [academicTermId, setAcademicTermId] = useState(String(record?.academicTermId ?? initialTerm?.id ?? ""));
  const [examStartDate, setExamStartDate] = useState(record?.startDate ?? initialTerm?.startDate ?? defaultYear?.startDate ?? "");
  const [examEndDate, setExamEndDate] = useState(record?.endDate ?? initialTerm?.endDate ?? defaultYear?.endDate ?? "");
  const [branchId, setBranchId] = useState(String(record?.branchId ?? ""));
  const [examSystem, setExamSystem] = useState<"single" | "multi">(record?.examSystem === "multi" ? "multi" : "single");
  const [components, setComponents] = useState<Array<{ title: string; maxMarks: string }>>(
    record?.components.map((component) => ({ title: component.title, maxMarks: String(component.maxMarks) })) ??
    [{ title: "Exam", maxMarks: "100" }],
  );
  const visibleTerms = terms.filter((term) => term.academicYearId === Number(academicYearId));
  const visibleClasses = branchId
    ? classes.filter((classLevel) => classLevel.branchId === Number(branchId))
    : classes;
  const totalMarks = components.reduce((total, component) => total + (Number(component.maxMarks) || 0), 0);
  const updateComponent = (index: number, patch: Partial<{ title: string; maxMarks: string }>) => {
    setComponents((current) => current.map((component, rowIndex) =>
      rowIndex === index ? { ...component, ...patch } : component,
    ));
  };
  const componentPayload = components.map((component) => `${component.title}|${component.maxMarks}`).join("\n");
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{record ? "Edit Exam" : "Add Exam"}</h2>
        <p className="mt-1 text-sm text-slate-600">Choose the branch and exam system, then define the mark distributions for each subject.</p>
      </div>
      {record && <input type="hidden" name="examinationId" value={record.id} />}
      <label className="block text-sm font-medium">Exam title *
        <input required name="name" maxLength={120} defaultValue={record?.name ?? ""} className="mt-1 w-full rounded-lg border p-2.5" placeholder="First Term" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Select branch *
          <select required={!record} name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5">
            {!record && <option value="" disabled>Select branch</option>}
            {record && <option value="">All branches</option>}
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Exam system
          <select name="examSystem" value={examSystem} onChange={(event) => {
            const nextSystem = event.target.value === "multi" ? "multi" : "single";
            setExamSystem(nextSystem);
            if (nextSystem === "multi" && components.length < 2) {
              setComponents([{ title: "Paper 1", maxMarks: "50" }, { title: "Paper 2", maxMarks: "50" }]);
            } else if (nextSystem === "single" && components.length > 1) {
              setComponents([{ title: "Exam", maxMarks: "100" }]);
            }
          }} className="mt-1 w-full rounded-lg border p-2.5">
            <option value="single">Single Exam</option>
            <option value="multi">Multi Exam</option>
          </select>
        </label>
        {record ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium">Academic year and term</p>
            <p className="mt-1 text-slate-600">
              {years.find((year) => year.id === record.academicYearId)?.name ?? "Academic year"}
              {terms.find((term) => term.id === record.academicTermId)?.name ? ` · ${terms.find((term) => term.id === record.academicTermId)?.name}` : ""}
              {` · Classes: ${record.classNames.join(", ") || "none"}.`}
            </p>
          </div>
        ) : <>
        <label className="text-sm font-medium">Academic year *
          <select required name="academicYearId" value={academicYearId} onChange={(event) => {
            const nextYearId = event.target.value;
            const nextYear = years.find((year) => year.id === Number(nextYearId));
            const nextTerm = terms.find((term) => term.academicYearId === Number(nextYearId) && term.startDate <= today && term.endDate >= today) ??
              terms.find((term) => term.academicYearId === Number(nextYearId));
            setAcademicYearId(nextYearId);
            setAcademicTermId(String(nextTerm?.id ?? ""));
            setExamStartDate(nextTerm?.startDate ?? nextYear?.startDate ?? "");
            setExamEndDate(nextTerm?.endDate ?? nextYear?.endDate ?? "");
          }} className="mt-1 w-full rounded-lg border p-2.5">
            <option value="" disabled>Select year</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.status === "active" ? " (active)" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Term
          <select name="academicTermId" value={academicTermId} onChange={(event) => {
            const nextTermId = event.target.value;
            const nextTerm = visibleTerms.find((term) => term.id === Number(nextTermId));
            const year = years.find((item) => item.id === Number(academicYearId));
            setAcademicTermId(nextTermId);
            setExamStartDate(nextTerm?.startDate ?? year?.startDate ?? "");
            setExamEndDate(nextTerm?.endDate ?? year?.endDate ?? "");
          }} className="mt-1 w-full rounded-lg border p-2.5">
            <option value="">No term</option>
            {visibleTerms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
          </select>
        </label>
        </>}
        <label className="text-sm font-medium">Start date *
          <input required type="date" name="startDate" value={examStartDate} onChange={(event) => setExamStartDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5" />
        </label>
        <label className="text-sm font-medium">End date *
          <input required type="date" name="endDate" value={examEndDate} onChange={(event) => setExamEndDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5" />
        </label>
        <label className="text-sm font-medium">Exam Mark *
          <input readOnly value={totalMarks.toFixed(2)} className="mt-1 w-full rounded-lg border bg-slate-50 p-2.5" />
        </label>
      </div>
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Add Mark Distributions</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Exam title</th><th className="p-3">Exam mark</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody>{components.map((component, index) => (
              <tr key={index} className="border-t">
                <td className="p-2">
                  <label className="sr-only" htmlFor={`exam-component-title-${index}`}>Distribution title</label>
                  <input id={`exam-component-title-${index}`} required maxLength={120} value={component.title} onChange={(event) => updateComponent(index, { title: event.target.value })} className="w-full rounded-lg border p-2.5" placeholder="First Term Exam" />
                </td>
                <td className="p-2">
                  <label className="sr-only" htmlFor={`exam-component-marks-${index}`}>Distribution maximum marks</label>
                  <input id={`exam-component-marks-${index}`} required type="number" min="0.01" max="999999" step="0.01" value={component.maxMarks} onChange={(event) => updateComponent(index, { maxMarks: event.target.value })} className="w-full rounded-lg border p-2.5" />
                </td>
                <td className="p-2">
                  <button type="button" disabled={examSystem === "single" || components.length <= 2} onClick={() => setComponents((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
                </td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="border-t font-semibold"><td className="p-3 text-right">Total</td><td className="p-3">{totalMarks.toFixed(2)}</td><td /></tr></tfoot>
          </table>
        </div>
        {examSystem === "multi" && (
          <button type="button" onClick={() => setComponents((current) => [...current, { title: `Paper ${current.length + 1}`, maxMarks: "50" }])} className="mt-3 rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-800">Add Mark Distribution</button>
        )}
      </fieldset>
      <input type="hidden" name="components" value={componentPayload} />
      {!record && <fieldset>
        <legend className="mb-2 text-sm font-semibold">Classes (all assigned subjects will be included)</legend>
        <div className="grid max-h-40 grid-cols-2 gap-2 overflow-auto rounded-lg border p-3 sm:grid-cols-3">
          {visibleClasses.map((classLevel) => (
            <label key={classLevel.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="classLevelIds" value={classLevel.id} />
              {classLevel.name}
            </label>
          ))}
          {visibleClasses.length === 0 && <p className="col-span-full text-sm text-slate-500">Add active classes and subject assignments first.</p>}
        </div>
      </fieldset>}
      {record && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Classes and subjects remain unchanged. Mark distributions can be changed only before marks are entered; a branch change must preserve the student roster.</p>}
      {!record && <p className="text-xs text-slate-500">Choose the classes that will take this exam. Currently enrolled students and assigned subjects are added automatically.</p>}
      <SubmitButton pending={pending}>{record ? "Save changes" : "Save Exam"}</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteExaminationForm({
  examinationId,
  examinationName,
  disabled,
}: {
  examinationId: number;
  examinationName: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(deleteExamination, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="examinationId" value={examinationId} />
      <AdminDeleteButton label={`Delete ${examinationName}`} disabled={disabled || pending} />
      {disabled && <span className="max-w-40 text-xs text-slate-500">Deletion is available only before marks, attendance, or submission.</span>}
      {state.error && <p role="alert" className="max-w-56 text-xs text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-emerald-700">Examination deleted.</p>}
    </form>
  );
}

export function CreateExamTypeForm({ branches }: { branches: Array<{ id: number; name: string }> }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(createExamType, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Create exam type</h2>
      <label className="block text-sm font-medium">Branch
        <select name="branchId" className="mt-1 w-full rounded-lg border p-2.5" defaultValue="">
          <option value="">All branches</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
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
  weight,
}: {
  examSubjectId: number;
  examDate: string;
  weight: string;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(updateExamSubjectSettings, {});
  return (
    <form action={action} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <label className="text-xs font-medium">Date<input required type="date" name="examDate" defaultValue={examDate} className="mt-1 w-full rounded border p-2" /></label>
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
  students: Array<{
    markId: number;
    enrollmentId: number;
    name: string;
    admissionNumber: string | null;
    teacherRemark: string | null;
    components: Array<{ id: number; title: string; maxMarks: string; marks: string | null }>;
  }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(saveExamMarks, {});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.flatMap((student) => [
      ...student.components.map((component) => [
        `component_${student.markId}_${component.id}`,
        component.marks ?? "",
      ]),
      [`remark_${student.enrollmentId}`, student.teacherRemark ?? ""],
    ])),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.admissionNumber ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const pageSize = 20;
  const pageCount = Math.ceil(filteredStudents.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount - 1, 0));
  const visibleStudents = filteredStudents.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const firstVisible = filteredStudents.length === 0 ? 0 : currentPage * pageSize + 1;
  const lastVisible = Math.min((currentPage + 1) * pageSize, filteredStudents.length);
  if (!editable) return null;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <p className="text-sm text-slate-600">Enter marks for each component. The total is calculated from the marks entered, out of {maxMarks}; grades are based on the total. Remarks are optional.</p>
      <label className="block max-w-lg text-sm font-medium text-slate-700">
        Search students
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Name or admission number"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
        />
      </label>
      <p className="text-xs text-slate-500" aria-live="polite">
        Showing {firstVisible}–{lastVisible} of {filteredStudents.length} matching students (page {pageCount === 0 ? 0 : currentPage + 1} of {pageCount}). Saving updates only the students shown on this page.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th>{students[0]?.components.map((component) => <th key={component.id} className="p-3">{component.title} / {component.maxMarks}</th>)}<th className="p-3">Teacher remark</th></tr></thead>
          <tbody>{visibleStudents.length > 0 ? visibleStudents.map((student) => (
              <tr key={student.enrollmentId} className="border-t">
                <td className="p-3 font-medium">{student.name}</td>
                <td className="p-3">{student.admissionNumber ?? "—"}</td>
                {student.components.map((component) => {
                  const name = `component_${student.markId}_${component.id}`;
                  return <td key={component.id} className="p-3"><input aria-label={`${component.title} marks for ${student.name}`} type="number" name={name} min="0" max={component.maxMarks} step="0.01" value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} className="w-28 rounded-lg border p-2" /></td>;
                })}
                <td className="p-3"><input aria-label={`Optional teacher remark for ${student.name}`} name={`remark_${student.enrollmentId}`} maxLength={1000} value={values[`remark_${student.enrollmentId}`] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [`remark_${student.enrollmentId}`]: event.target.value }))} className="w-full min-w-48 rounded-lg border p-2" /></td>
              </tr>
            )) : <tr><td colSpan={(students[0]?.components.length ?? 0) + 3} className="p-4 text-center text-slate-500">No students match this search.</td></tr>}</tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label="Marks roster pages" className="flex items-center justify-between gap-3">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Previous</button>
          <span className="text-sm text-slate-600">Page {currentPage + 1} of {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Next</button>
        </nav>
      )}
      <SubmitButton pending={pending}>Save marks for shown students</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SearchableStudentItems({
  items,
  emptyMessage,
}: {
  items: Array<{ id: number; name: string; admissionNumber: string | null; content: ReactNode }>;
  emptyMessage: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = items.filter((item) =>
    `${item.name} ${item.admissionNumber ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const pageSize = 20;
  const pageCount = Math.ceil(visibleItems.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount - 1, 0));
  const pageItems = visibleItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const firstVisible = visibleItems.length === 0 ? 0 : currentPage * pageSize + 1;
  const lastVisible = Math.min((currentPage + 1) * pageSize, visibleItems.length);
  return (
    <div className="space-y-4">
      <label className="block max-w-lg text-sm font-medium text-slate-700">
        Search students
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Name or admission number"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
        />
      </label>
      <p className="text-xs text-slate-500" aria-live="polite">
        Showing {firstVisible}–{lastVisible} of {visibleItems.length} matching students (page {pageCount === 0 ? 0 : currentPage + 1} of {pageCount}).
      </p>
      {pageItems.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {pageItems.map((item) => <div key={item.id}>{item.content}</div>)}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">{emptyMessage}</p>
      )}
      {pageCount > 1 && (
        <nav aria-label="Student remarks pages" className="flex items-center justify-between gap-3">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Previous</button>
          <span className="text-sm text-slate-600">Page {currentPage + 1} of {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Next</button>
        </nav>
      )}
    </div>
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
