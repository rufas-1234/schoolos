"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { AdminDeleteButton } from "@/components/admin-data-table";
import { SearchableSelect } from "@/components/searchable-select";
import { PAGE_SIZE_OPTIONS } from "@/components/pagination-utils";
import {
  createExamType,
  createExamination,
  assignExamClassTeacher,
  createGradingScale,
  deleteExamination,
  publishExamination,
  reopenApprovedExamSubject,
  reviewExamSubject,
  reviewMarkCorrection,
  saveClassTeacherRemark,
  saveExamMarks,
  saveExamAttendance,
  syncExamMarksRoster,
  savePrincipalRemark,
  submitExamSubject,
  updateGradingScale,
  updateExamination,
  updateExamSubjectSettings,
  type ExaminationActionState,
} from "./actions";
import { GRADING_SCALE_PRESETS } from "@/lib/grading-scale-presets";
import { examMarkEntryInputPattern, type GradeBand } from "@/lib/examination-policy";

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
    <form action={action} className="max-w-5xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{record ? "Edit Exam" : "Add Exam"}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose the branch and exam system, set the exam dates, and select classes to schedule their assigned subjects.
        </p>
      </div>
      {record && <input type="hidden" name="examinationId" value={record.id} />}
      <label className="block max-w-2xl text-sm font-medium">Exam title *
        <input required name="name" maxLength={120} defaultValue={record?.name ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="First Term" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SearchableSelect label="Select branch *" name="branchId" defaultValue={branchId} required={!record}
          options={[...(record ? [{ value: "", label: "All branches" }] : []), ...branches.map((branch) => ({ value: String(branch.id), label: branch.name }))]}
          placeholder="Search branches..." onValueChange={setBranchId} />
        <label className="text-sm font-medium">Exam system
          <select name="examSystem" value={examSystem} onChange={(event) => {
            const nextSystem = event.target.value === "multi" ? "multi" : "single";
            setExamSystem(nextSystem);
            if (nextSystem === "multi" && components.length < 2) {
              setComponents([{ title: "Paper 1", maxMarks: "50" }, { title: "Paper 2", maxMarks: "50" }]);
            } else if (nextSystem === "single" && components.length > 1) {
              setComponents([{ title: "Exam", maxMarks: "100" }]);
            }
          }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
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
        <SearchableSelect key={academicYearId} label="Academic year *" name="academicYearId" defaultValue={academicYearId} required
          options={[{ value: "", label: "Select year" }, ...years.map((year) => ({ value: String(year.id), label: `${year.name}${year.status === "active" ? " (active)" : ""}` }))]}
          placeholder="Search academic years..." onValueChange={(nextYearId) => {
            const nextYear = years.find((year) => year.id === Number(nextYearId));
            const nextTerm = terms.find((term) => term.academicYearId === Number(nextYearId) && term.startDate <= today && term.endDate >= today) ??
              terms.find((term) => term.academicYearId === Number(nextYearId));
            setAcademicYearId(nextYearId);
            setAcademicTermId(String(nextTerm?.id ?? ""));
            setExamStartDate(nextTerm?.startDate ?? nextYear?.startDate ?? "");
            setExamEndDate(nextTerm?.endDate ?? nextYear?.endDate ?? "");
          }} />
        <SearchableSelect key={`${academicYearId}-${academicTermId}`} label="Term" name="academicTermId" defaultValue={academicTermId}
          options={[{ value: "", label: "No term" }, ...visibleTerms.map((term) => ({ value: String(term.id), label: term.name }))]}
          placeholder="Search terms..." onValueChange={(nextTermId) => {
            const nextTerm = visibleTerms.find((term) => term.id === Number(nextTermId));
            const year = years.find((item) => item.id === Number(academicYearId));
            setAcademicTermId(nextTermId);
            setExamStartDate(nextTerm?.startDate ?? year?.startDate ?? "");
            setExamEndDate(nextTerm?.endDate ?? year?.endDate ?? "");
          }} />
        </>}
        <label className="text-sm font-medium">Start date *
          <input required type="date" name="startDate" value={examStartDate} onChange={(event) => setExamStartDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="text-sm font-medium">End date *
          <input required type="date" name="endDate" value={examEndDate} onChange={(event) => setExamEndDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="text-sm font-medium">Exam Mark *
          <input readOnly value={totalMarks.toFixed(2)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-700" />
        </label>
      </div>
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Add Mark Distributions</legend>
        <div className="overflow-x-auto">
          <table className="w-full max-w-3xl table-fixed text-left text-sm">
            <colgroup><col className="w-[58%]" /><col className="w-[24%]" /><col className="w-[18%]" /></colgroup>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Exam title</th><th className="p-3">Exam mark</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody>{components.map((component, index) => (
              <tr key={index} className="border-t">
                <td className="p-2">
                  <label className="sr-only" htmlFor={`exam-component-title-${index}`}>Distribution title</label>
                  <input id={`exam-component-title-${index}`} required maxLength={120} value={component.title} onChange={(event) => updateComponent(index, { title: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="First Term Exam" />
                </td>
                <td className="p-2">
                  <label className="sr-only" htmlFor={`exam-component-marks-${index}`}>Distribution maximum marks</label>
                  <input id={`exam-component-marks-${index}`} required type="number" min="0.01" max="999999" step="0.01" value={component.maxMarks} onChange={(event) => updateComponent(index, { maxMarks: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm tabular-nums outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
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
      {record && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Classes and subjects stay fixed. Change mark distributions before entry; preserve the roster when changing branches.</p>}
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
    <form action={action} className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-center text-lg font-bold text-slate-900">Create exam type</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableSelect label="Branch" name="branchId" defaultValue=""
          options={[{ value: "", label: "All branches" }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.name }))]}
          placeholder="Search branches..." />
        <label className="block text-sm font-medium sm:col-span-2">Exam name
          <input required name="name" maxLength={120} className="mt-1 h-10 w-full max-w-xl rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="First Term" />
        </label>
        <label className="block text-sm font-medium">Average passing mark
          <input required type="number" min="0" max="100" step="0.01" name="averageMark" defaultValue="0" className="mt-1 h-10 w-full max-w-48 rounded-lg border border-slate-200 px-3 text-sm tabular-nums outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="averagePassing" /> Use as the school&apos;s average-passing examination</label>
      <p className="text-xs text-slate-500">Exam types store a passing threshold; grades use the scale selected for each exam.</p>
      <SubmitButton pending={pending}>Save exam type</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

type GradingScaleEditorData = {
  id: number;
  name: string;
  isDefault: boolean;
  allowRanking: boolean;
  bands: GradeBand[];
};

function GradingScaleForm({ scale }: { scale?: GradingScaleEditorData }) {
  const formAction = scale ? updateGradingScale : createGradingScale;
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(formAction, {});
  const defaultPreset = GRADING_SCALE_PRESETS[0];
  const [name, setName] = useState(scale?.name ?? defaultPreset.name);
  const [presetId, setPresetId] = useState(scale ? "" : defaultPreset.id);
  const [bands, setBands] = useState<GradeBand[]>(scale?.bands ?? defaultPreset.bands);
  const preset = GRADING_SCALE_PRESETS.find((item) => item.id === presetId);
  const serializedBands = bands.map((band) => [
    band.minPercent,
    band.maxPercent,
    band.grade,
    band.description,
    band.performanceRemark,
  ].join("|")).join("\n");
  const updateBand = (index: number, patch: Partial<GradeBand>) => {
    setBands((current) => current.map((band, rowIndex) =>
      rowIndex === index ? { ...band, ...patch } : band,
    ));
    setPresetId("");
  };
  const addBand = () => {
    setBands((current) => {
      const last = current[current.length - 1];
      if (!last || last.maxPercent - last.minPercent < 0.02) return current;
      const midpoint = Math.round(((last.minPercent + last.maxPercent) / 2) * 100) / 100;
      return [
        ...current.slice(0, -1),
        { ...last, maxPercent: midpoint, grade: `New${current.length}`, description: "New grade" },
        { ...last, minPercent: midpoint },
      ];
    });
    setPresetId("");
  };
  const removeBand = (index: number) => {
    setBands((current) => {
      if (current.length <= 1) return current;
      if (index === 0) {
        return current.slice(1).map((band, rowIndex) =>
          rowIndex === 0 ? { ...band, minPercent: 0 } : band,
        );
      }
      return current.filter((_, rowIndex) => rowIndex !== index).map((band, rowIndex) =>
        rowIndex === index - 1
          ? { ...band, maxPercent: current[index].maxPercent }
          : band,
      );
    });
    setPresetId("");
  };
  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      {scale && <input type="hidden" name="scaleId" value={scale.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm font-medium">Grading system
          <select
            value={presetId}
            onChange={(event) => {
              const nextPreset = GRADING_SCALE_PRESETS.find((item) => item.id === event.target.value);
              setPresetId(event.target.value);
              if (nextPreset) {
                setBands(nextPreset.bands);
                if (!scale) setName(nextPreset.name);
              }
            }}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"
          >
            {scale && <option value="">Keep current / custom bands</option>}
            {GRADING_SCALE_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            {!scale && <option value="">Custom scale</option>}
          </select>
        </label>
        <label className="block text-sm font-medium">Scale name
          <input required name="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="School grading scale" />
        </label>
      </div>
      {preset && <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{preset.note} The grade ranges, letters, descriptions, and comments below are editable.</p>}
      {scale && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Saving changes affects every examination that uses this scale, including published report cards.</p>}
      <input type="hidden" name="bands" value={serializedBands} />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-2">From %</th><th className="p-2">Up to %</th><th className="p-2">Grade</th><th className="p-2">Description</th><th className="p-2">Suggested comment</th><th className="p-2">Action</th></tr>
          </thead>
          <tbody>{bands.map((band, index) => (
            <tr key={`${index}-${band.grade}`} className="border-t">
              <td className="p-2"><input aria-label={`Grade ${band.grade} minimum percentage`} type="number" min="0" max="100" step="0.01" value={Number.isNaN(band.minPercent) ? "" : band.minPercent} onChange={(event) => updateBand(index, { minPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) })} className="w-24 rounded border p-2" /></td>
              <td className="p-2"><input aria-label={`Grade ${band.grade} maximum percentage`} type="number" min="0" max="100" step="0.01" value={Number.isNaN(band.maxPercent) ? "" : band.maxPercent} onChange={(event) => updateBand(index, { maxPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) })} className="w-24 rounded border p-2" /></td>
              <td className="p-2"><input required aria-label="Grade letter" maxLength={8} value={band.grade} onChange={(event) => updateBand(index, { grade: event.target.value })} className="w-20 rounded border p-2" /></td>
              <td className="p-2"><input required aria-label="Grade description" maxLength={255} value={band.description} onChange={(event) => updateBand(index, { description: event.target.value })} className="w-40 rounded border p-2" /></td>
              <td className="p-2"><input required aria-label="Suggested grade comment" maxLength={255} value={band.performanceRemark} onChange={(event) => updateBand(index, { performanceRemark: event.target.value })} className="w-56 rounded border p-2" /></td>
              <td className="p-2"><button type="button" disabled={bands.length <= 1} onClick={() => removeBand(index)} className="rounded border px-2 py-1 text-xs font-medium text-rose-700 disabled:opacity-50">Remove</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button type="button" onClick={addBand} className="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-800">Add grade band</button>
      <p className="text-xs text-slate-500">Ranges must cover 0% to 100% without gaps or overlaps. A score at a boundary starts the higher grade.</p>
      <div className="flex flex-wrap gap-4 text-sm">
        {scale?.isDefault
          ? <><input type="hidden" name="isDefault" value="on" /><p className="text-slate-600">This is the default scale for new exams. To change it, make another scale the default.</p></>
          : <label className="flex items-center gap-2"><input type="checkbox" name="isDefault" /> Use as the default for new exams</label>}
        <label className="flex items-center gap-2"><input type="checkbox" name="allowRanking" defaultChecked={scale?.allowRanking ?? false} /> Show class positions and ranking</label>
      </div>
      <SubmitButton pending={pending}>{scale ? "Save grading scale changes" : "Create grading scale"}</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function CreateGradingScaleForm() {
  return (
    <section className="max-w-5xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Create a grading scale</h2>
      <p className="text-sm text-slate-600">Choose a ready-made system, review its bands, and adjust them to match your school.</p>
      <GradingScaleForm />
    </section>
  );
}

export function EditGradingScaleForm({ scale }: { scale: GradingScaleEditorData }) {
  return (
    <details className="mt-4 rounded-lg border border-slate-200">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-violet-800">Edit this grading scale</summary>
      <div className="p-3">
        <GradingScaleForm scale={scale} />
      </div>
    </details>
  );
}

export function SaveExamAttendanceForm({
  examSubjectId,
  students,
  isCompulsory,
  editable,
  approvedAssessment = false,
}: {
  examSubjectId: number;
  isCompulsory: boolean;
  editable: boolean;
  approvedAssessment?: boolean;
  students: Array<{
    enrollmentId: number;
    name: string;
    admissionNumber: string | null;
    status: string | null;
    note: string | null;
  }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(saveExamAttendance, {});
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Record<number, string>>(() =>
    Object.fromEntries(students.map((student) => [student.enrollmentId, student.status ?? ""])),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCount = students.filter((student) =>
    `${student.name} ${student.admissionNumber ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
  ).length;
  if (!editable) return <p className="text-sm text-slate-600">Attendance can be changed while this assessment is a draft and the examination is open. Only system superadmins can change attendance on approved results while the examination is open.</p>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      {approvedAssessment && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Superadmin attendance correction: saving changes attendance only and does not reopen or edit the approved marks.</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block w-full max-w-md space-y-1.5 text-sm font-medium text-slate-700">
          Quick search students
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or admission number"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
          />
        </label>
        <button
          type="button"
          onClick={() => setStatuses(Object.fromEntries(
            students.map((student) => [student.enrollmentId, "present"]),
          ))}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
        >
          <CheckCheck size={16} aria-hidden="true" />
          All present
        </button>
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">
        Showing {visibleCount} of {students.length} students
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th><th className="p-3">Attendance</th><th className="p-3">Note</th></tr></thead>
          <tbody>{students.map((student) => (
            <tr
              key={student.enrollmentId}
              className="border-t"
              hidden={!`${student.name} ${student.admissionNumber ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)}
            >
              <td className="p-3 font-medium">{student.name}</td>
              <td className="p-3">{student.admissionNumber ?? "—"}</td>
              <td className="p-3"><select required name={`attendance_${student.enrollmentId}`} value={statuses[student.enrollmentId] ?? ""} onChange={(event) => setStatuses((current) => ({ ...current, [student.enrollmentId]: event.target.value }))} className="rounded-lg border p-2"><option value="" disabled>Select status</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option>{!isCompulsory && <option value="not_applicable">Not taking optional subject</option>}<option value="x">X — Absent</option><option value="y">Y — Nullified (malpractice)</option></select></td>
              <td className="p-3"><input name={`note_${student.enrollmentId}`} maxLength={500} required={statuses[student.enrollmentId] === "x" || statuses[student.enrollmentId] === "y"} placeholder={statuses[student.enrollmentId] === "x" || statuses[student.enrollmentId] === "y" ? "Required: record the reason" : ""} defaultValue={student.note ?? ""} className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></td>
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
    <form action={action} className="mt-3 grid max-w-2xl gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <label className="text-xs font-medium">Date<input required type="date" name="examDate" defaultValue={examDate} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></label>
      <label className="text-xs font-medium">Weight<input required type="number" step="0.01" min="0.01" name="weight" defaultValue={weight} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm tabular-nums outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></label>
      <div className="flex items-end"><SubmitButton pending={pending}>Update assessment</SubmitButton></div>
      <div className="sm:col-span-4"><Feedback state={state} /></div>
    </form>
  );
}

export function SaveMarksForm({
  examSubjectId,
  students,
  maxMarks,
  componentMarkCount,
  editable,
}: {
  examSubjectId: number;
  maxMarks: string;
  componentMarkCount: number;
  editable: boolean;
  students: Array<{
    markId: number;
    enrollmentId: number;
    name: string;
    admissionNumber: string | null;
    attendanceStatus: string | null;
    teacherRemark: string | null;
    components: Array<{ id: number; title: string; maxMarks: string; marks: string | null }>;
  }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(saveExamMarks, {});
  const [rosterReady, setRosterReady] = useState(false);
  const [rosterSyncError, setRosterSyncError] = useState("");
  const [retryRosterSync, setRetryRosterSync] = useState(0);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.flatMap((student) => [
      ...student.components.map((component) => [
        `component_${student.markId}_${component.id}`,
        student.attendanceStatus === "x" || student.attendanceStatus === "y"
          ? student.attendanceStatus
          : component.marks ?? "",
      ]),
      [`remark_${student.enrollmentId}`, student.teacherRemark ?? ""],
    ])),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.admissionNumber ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const pageCount = Math.ceil(filteredStudents.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount - 1, 0));
  const visibleStudents = filteredStudents.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const firstVisible = filteredStudents.length === 0 ? 0 : currentPage * pageSize + 1;
  const lastVisible = Math.min((currentPage + 1) * pageSize, filteredStudents.length);
  useEffect(() => {
    if (!editable) return;
    let active = true;
    syncExamMarksRoster(examSubjectId).then((result) => {
      if (!active) return;
      if (result.error) {
        setRosterSyncError(result.error);
        return;
      }
      if (
        (result.rosterCount ?? 0) > students.length ||
        (result.componentMarkCount ?? 0) > componentMarkCount
      ) {
        router.refresh();
        return;
      }
      setRosterReady(true);
    }).catch((error: unknown) => {
      console.error("Could not synchronize the exam marks roster.", error);
      if (active) setRosterSyncError("Could not refresh the enrolled-student roster. Please try again.");
    });
    return () => {
      active = false;
    };
  }, [componentMarkCount, editable, examSubjectId, retryRosterSync, router, students.length]);
  if (!editable) return null;
  if (!rosterReady) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {rosterSyncError
          ? <p role="alert" className="text-sm text-rose-700">{rosterSyncError}</p>
          : <p role="status" className="text-sm text-slate-600">Refreshing marks roster from currently enrolled students…</p>}
        {rosterSyncError && (
          <button
            type="button"
            onClick={() => {
              setRosterSyncError("");
              setRetryRosterSync((current) => current + 1);
            }}
            className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white"
          >
            Retry roster refresh
          </button>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <p className="text-sm text-slate-600">Attendance is required before marks can be saved. Enter marks or X (absent) / Y (malpractice); codes clear scores. Use one code across components (max {maxMarks}).</p>
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
      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
        Students per page
        <select value={pageSize} onChange={(event) => {
          setPageSize(Number(event.target.value));
          setPage(0);
        }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th><th className="p-3">Attendance</th>{students[0]?.components.map((component) => <th key={component.id} className="p-3">{component.title} / {component.maxMarks}</th>)}<th className="p-3">Teacher remark</th></tr></thead>
          <tbody>{visibleStudents.length > 0 ? visibleStudents.map((student) => (
              <tr key={student.enrollmentId} className="border-t">
                <td className="p-3 font-medium">{student.name}</td>
                <td className="p-3">{student.admissionNumber ?? "—"}</td>
                <td className="p-3">{student.attendanceStatus === "x" ? "X · Absent" : student.attendanceStatus === "y" ? "Y · Nullified (malpractice)" : student.attendanceStatus ?? "Not recorded"}</td>
                {student.components.map((component) => {
                  const name = `component_${student.markId}_${component.id}`;
                  return <td key={component.id} className="p-3"><input aria-label={`${component.title} marks or X/Y status for ${student.name}`} type="text" pattern={examMarkEntryInputPattern} name={name} maxLength={10} placeholder="Mark / X / Y" value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} className="w-28 rounded-lg border p-2" /></td>;
                })}
                <td className="p-3"><input aria-label={`Optional teacher remark for ${student.name}`} name={`remark_${student.enrollmentId}`} maxLength={1000} value={values[`remark_${student.enrollmentId}`] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [`remark_${student.enrollmentId}`]: event.target.value }))} className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></td>
              </tr>
            )) : <tr><td colSpan={(students[0]?.components.length ?? 0) + 4} className="p-4 text-center text-slate-500">No students match this search.</td></tr>}</tbody>
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
  const [pageSize, setPageSize] = useState(20);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = items.filter((item) =>
    `${item.name} ${item.admissionNumber ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
  );
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
      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
        Students per page
        <select value={pageSize} onChange={(event) => {
          setPageSize(Number(event.target.value));
          setPage(0);
        }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
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

export function ReopenApprovedSubjectForm({ examSubjectId }: { examSubjectId: number }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(reopenApprovedExamSubject, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <div>
        <h2 className="font-bold text-amber-950">Reopen approved marks for correction</h2>
        <p className="mt-1 text-sm text-amber-900">Marks stay. Reopen to draft, sync missing students, and resubmit for approval. Published exams stay closed.</p>
      </div>
      <label className="block text-sm font-medium text-amber-950">
        Reason for reopening
        <textarea required name="reason" maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-amber-300 bg-white p-2" />
      </label>
      <SubmitButton pending={pending}>Reopen for correction</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function AssignExamClassTeacherForm({
  examClassId,
  classTeacherId,
  teachers,
}: {
  examClassId: number;
  classTeacherId: number | null;
  teachers: Array<{ id: number; name: string }>;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(assignExamClassTeacher, {});
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <input type="hidden" name="examClassId" value={examClassId} />
      <label className="min-w-60 flex-1 text-xs font-medium text-slate-600">
        Class teacher responsible for reviewing results
        <select name="teacherId" defaultValue={classTeacherId ? String(classTeacherId) : ""} required className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900">
          <option value="">Select class teacher</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </label>
      <SubmitButton pending={pending}>Assign</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function PublishExamClassForm({
  examClassId,
  disabled,
}: {
  examClassId: number;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(publishExamination, {});
  return (
    <form action={action} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <input type="hidden" name="examClassId" value={examClassId} />
      <p className="text-sm font-semibold text-emerald-950">Publish this class&apos;s results</p>
      <p className="mt-1 text-xs text-emerald-900">Publishers can publish after full attendance is recorded. Marks entry is separate; published results stay locked.</p>
      <button disabled={disabled || pending} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Publishing..." : "Publish class results"}
      </button>
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
        <textarea name="remark" maxLength={1000} rows={2} defaultValue={remark ?? ""} className="mt-1 w-full max-w-2xl rounded-lg border border-slate-200 p-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
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
        <textarea name="remark" maxLength={1000} rows={3} defaultValue={remark ?? ""} className="mt-2 w-full max-w-2xl rounded-lg border border-slate-200 p-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </label>
      <SubmitButton pending={pending}>Save principal remark</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function ReviewCorrectionForm({ correctionId }: { correctionId: number }) {
  const [state, action, pending] = useActionState<ExaminationActionState, FormData>(reviewMarkCorrection, {});
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-3 print:hidden">
      <input type="hidden" name="correctionId" value={correctionId} />
      <label className="min-w-52 max-w-lg flex-1 text-xs font-medium">Review note
        <input name="reviewNote" maxLength={1000} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </label>
      <button name="decision" value="approve" disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve correction</button>
      <button name="decision" value="reject" disabled={pending} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60">Reject</button>
      <Feedback state={state} />
    </form>
  );
}
