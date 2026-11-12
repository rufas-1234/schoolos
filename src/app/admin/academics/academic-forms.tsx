"use client";

import { useActionState, type ReactNode } from "react";
import { RequiredMark } from "@/components/required-mark";
import {
  createAcademicTerm,
  createAcademicYear,
  createClassLevel,
  createClassSection,
  createClassSections,
  assignSubjectToClass,
  createSubject,
  type AcademicActionState,
} from "./actions";

export type Option = { id: number; label: string };

export function AcademicYearForm({
  record,
}: {
  record?: { id: number; name: string; startDate: string; endDate: string };
} = {}) {
  return (
    <ActionForm
      title={record ? "Edit academic year" : "Add academic year"}
      action={createAcademicYear}
      submitLabel={record ? "Save changes" : "Add year"}
      recordId={record?.id}
    >
      <Field label="Year name" name="name" placeholder="2026–2027" defaultValue={record?.name} />
      <DateFields startDate={record?.startDate} endDate={record?.endDate} />
    </ActionForm>
  );
}

export function AcademicTermForm({
  years,
  record,
}: {
  years: Option[];
  record?: {
    id: number;
    academicYearId: number;
    name: string;
    startDate: string;
    endDate: string;
    examStartDate: string | null;
    examEndDate: string | null;
  };
}) {
  return (
    <ActionForm
      title={record ? "Edit term" : "Add term"}
      action={createAcademicTerm}
      submitLabel={record ? "Save changes" : "Add term"}
      recordId={record?.id}
    >
      <SelectField label="Academic year" name="academicYearId" options={years} defaultValue={record?.academicYearId} />
      <Field label="Term name" name="name" placeholder="Term 1" defaultValue={record?.name} />
      <DateFields startDate={record?.startDate} endDate={record?.endDate} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Exam starts (optional)" name="examStartDate" type="date" required={false} defaultValue={record?.examStartDate} />
        <Field label="Exam ends (optional)" name="examEndDate" type="date" required={false} defaultValue={record?.examEndDate} />
      </div>
    </ActionForm>
  );
}

export function ClassLevelForm({
  branches,
  years = [],
  record,
}: {
  branches: Option[];
  years?: Option[];
  record?: { id: number; branchId: number; name: string; code: string };
}) {
  return (
    <ActionForm
      title={record ? "Edit class" : "Add class"}
      action={createClassLevel}
      submitLabel={record ? "Save changes" : "Add class"}
      recordId={record?.id}
    >
      <SelectField label="Branch" name="branchId" options={branches} defaultValue={record?.branchId} />
      <Field label="Class name" name="name" placeholder="Grade 1" defaultValue={record?.name} />
      <Field label="Class code" name="code" placeholder="G1" defaultValue={record?.code} />
      {!record && (
        <div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Create sections for this class</h3>
            <p className="mt-1 text-xs text-slate-600">
              Enter section names such as 1, 2, 3; A, B, C; or Blue, Gold. Choose an academic year to add them now.
            </p>
          </div>
          <SelectField
            label="Academic year for sections"
            name="sectionsAcademicYearId"
            options={years}
            allowEmpty
            required={false}
            emptyLabel="Skip sections for now"
          />
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Section names
            <textarea
              name="sectionNames"
              rows={3}
              defaultValue={"Section 1\nSection 2\nSection 3"}
              placeholder={"A\nB\nC"}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400"
            />
            <span className="block text-xs font-normal text-slate-500">
              One name per line; enter 1–30 names, up to 80 characters each.
            </span>
          </label>
        </div>
      )}
    </ActionForm>
  );
}

export function ClassSectionForm({
  years,
  classes,
  record,
}: {
  years: Option[];
  classes: Option[];
  record?: { id: number; academicYearId: number; classLevelId: number; name: string };
}) {
  return (
    <ActionForm
      title={record ? "Edit class section" : "Add class section"}
      action={createClassSection}
      submitLabel={record ? "Save changes" : "Add section"}
      recordId={record?.id}
    >
      <SelectField label="Academic year" name="academicYearId" options={years} defaultValue={record?.academicYearId} />
      <SelectField label="Class" name="classLevelId" options={classes} defaultValue={record?.classLevelId} />
      <Field label="Section name" name="name" placeholder="Section 1" defaultValue={record?.name} />
      <p className="text-xs text-slate-500">
        For example, create Section 1, Section 2, and Section 3 under P1.
      </p>
    </ActionForm>
  );
}

export function ClassSectionsForm({
  years,
  classes,
}: {
  years: Option[];
  classes: Option[];
}) {
  return (
    <ActionForm
      title="Add class sections"
      action={createClassSections}
      submitLabel="Create sections"
    >
      <SelectField label="Academic year" name="academicYearId" options={years} />
      <SelectField label="Class" name="classLevelId" options={classes} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Section names <RequiredMark />
        <textarea
          name="names"
          rows={4}
          defaultValue={"Section 1\nSection 2\nSection 3"}
          required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        />
      </label>
      <p className="text-xs text-slate-500">
        Enter one name per line, such as 1, 2, 3; A, B, C; or Blue, Gold. Add 1–30 names; existing sections are kept.
      </p>
    </ActionForm>
  );
}

export function SubjectForm({
  branches,
  record,
}: {
  branches: Option[];
  record?: { id: number; branchId: number; name: string; code: string; subjectType: string };
}) {
  return (
    <ActionForm
      title={record ? "Edit subject" : "Add subject"}
      action={createSubject}
      submitLabel={record ? "Save changes" : "Add subject"}
      recordId={record?.id}
    >
      <SelectField label="Branch" name="branchId" options={branches} defaultValue={record?.branchId} />
      <Field label="Subject name" name="name" placeholder="Mathematics" defaultValue={record?.name} />
      <Field label="Subject code" name="code" placeholder="MATH" defaultValue={record?.code} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Subject type <RequiredMark />
        <select
          name="subjectType"
          defaultValue={record?.subjectType ?? "theory"}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        >
          <option value="theory">Theory</option>
          <option value="practical">Practical</option>
        </select>
      </label>
    </ActionForm>
  );
}

export function ClassSubjectForm({
  classes,
  subjects,
  defaultCompulsory = true,
  record,
}: {
  classes: Option[];
  subjects: Option[];
  defaultCompulsory?: boolean;
  record?: { id: number; classLevelId: number; subjectId: number; isCompulsory: boolean };
}) {
  return (
    <ActionForm
      title={record ? "Edit class subject" : "Assign subject to class"}
      action={assignSubjectToClass}
      submitLabel={record ? "Save changes" : "Assign subject"}
      recordId={record?.id}
    >
      <SelectField label="Class" name="classLevelId" options={classes} defaultValue={record?.classLevelId} />
      <SelectField label="Subject" name="subjectId" options={subjects} defaultValue={record?.subjectId} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Requirement <RequiredMark />
        <select
          name="isCompulsory"
          defaultValue={record ? (record.isCompulsory ? "true" : "false") : defaultCompulsory ? "true" : "false"}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        >
          <option value="true">Compulsory</option>
          <option value="false">Optional</option>
        </select>
      </label>
    </ActionForm>
  );
}

export function ActionForm({
  title,
  action,
  submitLabel,
  recordId,
  children,
}: {
  title: string;
  action: (
    previousState: AcademicActionState,
    formData: FormData,
  ) => Promise<AcademicActionState>;
  submitLabel: string;
  recordId?: number;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<AcademicActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500">
        <RequiredMark /> Required fields
      </p>
      {recordId !== undefined && <input type="hidden" name="recordId" value={recordId} />}
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  label,
  name,
  placeholder,
  type = "text",
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
      />
    </label>
  );
}

function DateFields({
  startDate,
  endDate,
}: {
  startDate?: string;
  endDate?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Starts" name="startDate" type="date" defaultValue={startDate} />
      <Field label="Ends" name="endDate" type="date" defaultValue={endDate} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  required = true,
  allowEmpty = false,
  emptyLabel,
  defaultValue,
}: {
  label: string;
  name: string;
  options: Option[];
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  defaultValue?: string | number | null;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        disabled={options.length === 0 && required}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="" disabled={!allowEmpty}>
          {emptyLabel ?? (options.length === 0 ? "Create one first" : "Choose one")}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
