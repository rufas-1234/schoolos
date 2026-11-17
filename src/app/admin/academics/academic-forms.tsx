"use client";

import { useActionState, useState, type ReactNode } from "react";
import { RequiredMark } from "@/components/required-mark";
import { AdminConfirmSubmitButton, AdminDeleteButton } from "@/components/admin-data-table";
import { SearchableSelect } from "@/components/searchable-select";
import {
  deleteAcademicTerm,
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

export function DeleteAcademicTermForm({
  termId,
  termName,
}: {
  termId: number;
  termName: string;
}) {
  const [state, action, pending] = useActionState(deleteAcademicTerm, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="recordId" value={termId} />
      {state.error && <p role="alert" className="max-w-56 text-xs text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-emerald-700">Term deleted.</p>}
      <span className="sr-only">Delete term {termName}</span>
      <AdminDeleteButton label={`Delete term ${termName}`} disabled={pending} />
    </form>
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
  const [state, formAction, pending] = useActionState<AcademicActionState, FormData>(createClassLevel, {});
  const [branchId, setBranchId] = useState(String(record?.branchId ?? ""));
  const [name, setName] = useState(record?.name ?? "");
  const [code, setCode] = useState(record?.code ?? "");
  const [sectionsAcademicYearId, setSectionsAcademicYearId] = useState("");
  const [sectionNames, setSectionNames] = useState("Section 1\nSection 2\nSection 3");

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{record ? "Edit class" : "Add class"}</h2>
      <p className="text-xs text-slate-500"><RequiredMark /> Required fields</p>
      {record && <input type="hidden" name="recordId" value={record.id} />}
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        onValueChange={setBranchId}
      />
      <Field label="Class name" name="name" placeholder="Grade 1" defaultValue={name}
        onChange={setName} />
      <Field label="Class code" name="code" placeholder="G1" defaultValue={code}
        onChange={setCode} />
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
            defaultValue={sectionsAcademicYearId}
            onValueChange={setSectionsAcademicYearId}
            allowEmpty
            required={false}
            emptyLabel="Skip sections for now"
          />
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Section names
            <textarea
              name="sectionNames"
              rows={3}
              value={sectionNames}
              onChange={(event) => setSectionNames(event.target.value)}
              placeholder={"A\nB\nC"}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400"
            />
            <span className="block text-xs font-normal text-slate-500">
              One name per line; enter 1–30 names, up to 80 characters each.
            </span>
          </label>
        </div>
      )}
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>}
      <button type="submit" disabled={pending}
        className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400">
        {pending ? "Saving..." : record ? "Save changes" : "Add class"}
      </button>
    </form>
  );
}

export function ClassSectionForm({
  branches,
  years,
  classes,
  record,
}: {
  branches: Option[];
  years: Option[];
  classes: (Option & { branchId: number })[];
  record?: { id: number; academicYearId: number; classLevelId: number; name: string };
}) {
  const [branchId, setBranchId] = useState(
    String(classes.find((classLevel) => classLevel.id === record?.classLevelId)?.branchId ?? ""),
  );
  const [classLevelId, setClassLevelId] = useState(String(record?.classLevelId ?? ""));
  const availableClasses = classes.filter((classLevel) => String(classLevel.branchId) === branchId);

  return (
    <ActionForm
      title={record ? "Edit class section" : "Add class section"}
      action={createClassSection}
      submitLabel={record ? "Save changes" : "Add section"}
      recordId={record?.id}
    >
      <SelectField label="Academic year" name="academicYearId" options={years} defaultValue={record?.academicYearId} />
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setClassLevelId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Class"
        name="classLevelId"
        options={availableClasses.map((classLevel) => ({ value: String(classLevel.id), label: classLevel.label }))}
        defaultValue={classLevelId}
        required
        disabled={!branchId || availableClasses.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search classes..."}
        onValueChange={setClassLevelId}
      />
      <Field label="Section name" name="name" placeholder="Section 1" defaultValue={record?.name} />
      <p className="text-xs text-slate-500">
        For example, create Section 1, Section 2, and Section 3 under P1.
      </p>
    </ActionForm>
  );
}

export function ClassSectionsForm({
  branches,
  years,
  classes,
}: {
  branches: Option[];
  years: Option[];
  classes: (Option & { branchId: number })[];
}) {
  const [branchId, setBranchId] = useState("");
  const [classLevelId, setClassLevelId] = useState("");
  const availableClasses = classes.filter((classLevel) => String(classLevel.branchId) === branchId);

  return (
    <ActionForm
      title="Add class sections"
      action={createClassSections}
      submitLabel="Create sections"
    >
      <SelectField label="Academic year" name="academicYearId" options={years} />
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setClassLevelId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Class"
        name="classLevelId"
        options={availableClasses.map((classLevel) => ({ value: String(classLevel.id), label: classLevel.label }))}
        defaultValue={classLevelId}
        required
        disabled={!branchId || availableClasses.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search classes..."}
        onValueChange={setClassLevelId}
      />
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
  branches,
  classes,
  subjects,
  defaultCompulsory = true,
  record,
}: {
  branches: Option[];
  classes: (Option & { branchId: number })[];
  subjects: (Option & { branchId: number })[];
  defaultCompulsory?: boolean;
  record?: { id: number; classLevelId: number; subjectId: number; isCompulsory: boolean };
}) {
  const [branchId, setBranchId] = useState(
    String(classes.find((classLevel) => classLevel.id === record?.classLevelId)?.branchId ?? ""),
  );
  const [classLevelId, setClassLevelId] = useState(String(record?.classLevelId ?? ""));
  const [subjectId, setSubjectId] = useState(String(record?.subjectId ?? ""));
  const availableClasses = classes.filter((classLevel) => String(classLevel.branchId) === branchId);
  const availableSubjects = subjects.filter((subject) => String(subject.branchId) === branchId);

  return (
    <ActionForm
      title={record ? "Edit class subject" : "Assign subject to class"}
      action={assignSubjectToClass}
      submitLabel={record ? "Save changes" : "Assign subject"}
      recordId={record?.id}
    >
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setClassLevelId("");
          setSubjectId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Class"
        name="classLevelId"
        options={availableClasses.map((classLevel) => ({ value: String(classLevel.id), label: classLevel.label }))}
        defaultValue={classLevelId}
        required
        disabled={!branchId || availableClasses.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search classes..."}
        onValueChange={(value) => {
          setClassLevelId(value);
          setSubjectId("");
        }}
      />
      <SearchableSelect
        key={`${branchId}-${classLevelId}`}
        label="Subject"
        name="subjectId"
        options={availableSubjects.map((subject) => ({ value: String(subject.id), label: subject.label }))}
        defaultValue={availableSubjects.some((subject) => String(subject.id) === subjectId) ? subjectId : ""}
        required
        disabled={!classLevelId || availableSubjects.length === 0}
        placeholder={!classLevelId ? "Choose a class first" : "Search subjects..."}
        onValueChange={setSubjectId}
      />
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
  confirmation,
}: {
  title: string;
  action: (
    previousState: AcademicActionState,
    formData: FormData,
  ) => Promise<AcademicActionState>;
  submitLabel: string;
  recordId?: number;
  children: ReactNode;
  confirmation?: { title: string; message: string };
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
      {confirmation
        ? <AdminConfirmSubmitButton
            label={submitLabel}
            buttonText={pending ? "Saving..." : submitLabel}
            confirmationTitle={confirmation.title}
            confirmationMessage={confirmation.message}
            disabled={pending}
            variant="primary"
          />
        : <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400">
            {pending ? "Saving..." : submitLabel}
          </button>}
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
  onChange,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={onChange ? undefined : defaultValue ?? ""}
        value={onChange ? String(defaultValue ?? "") : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
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
  onValueChange,
}: {
  label: string;
  name: string;
  options: Option[];
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  defaultValue?: string | number | null;
  onValueChange?: (value: string) => void;
}) {
  const searchableOptions = options.map((option) => ({
    value: String(option.id),
    label: option.label,
  }));
  if (allowEmpty) {
    searchableOptions.unshift({
      value: "",
      label: emptyLabel ?? (options.length === 0 ? "Create one first" : "Choose one"),
    });
  }
  return (
    <SearchableSelect
      label={label}
      name={name}
      options={searchableOptions}
      required={required}
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
      disabled={options.length === 0 && required}
      placeholder={emptyLabel ?? (options.length === 0 ? "Create one first" : "Search options...")}
      onValueChange={onValueChange}
    />
  );
}
