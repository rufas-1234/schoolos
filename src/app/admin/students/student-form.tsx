"use client";

import Image from "next/image";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { AdminConfirmSubmitButton } from "@/components/admin-data-table";
import { RequiredMark } from "@/components/required-mark";
import { SearchableSelect } from "@/components/searchable-select";
import type { StudentAdditionalDetails, StudentFieldSettings } from "@/db/schema";
import { createStudent, updateStudent } from "./actions";

type BranchOption = { id: number; label: string };
type YearOption = { id: number; label: string };
type ClassOption = { id: number; branchId: number; label: string };
type SectionOption = { id: number; academicYearId: number; classLevelId: number; label: string };
type CategoryOption = { id: number; branchId: number; label: string };

type StudentEditRecord = {
  publicId: string;
  branchId: number | null;
  categoryId: number | null;
  admissionNumber: string | null;
  dateOfBirth: string | null;
  admissionDate: string | null;
  firstName: string;
  lastName: string;
  gender: string | null;
  email: string | null;
  phone: string | null;
  religion: string | null;
  bloodGroup: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  fatherName: string | null;
  fatherOccupation: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherOccupation: string | null;
  motherPhone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  guardianOccupation: string | null;
  guardianAddress: string | null;
  additionalDetails: StudentAdditionalDetails | null;
  className: string | null;
  sectionName: string | null;
  academicYearName: string | null;
  rollNumber: string | null;
  status: string;
};

type StudentEditTab = "personal" | "parents" | "documents" | "previous" | "other" | "custom";
const studentEditTabs: { id: StudentEditTab; label: string; emptyMessage?: string }[] = [
  { id: "personal", label: "Personal Info" },
  { id: "parents", label: "Parents & Guardian Info" },
  { id: "documents", label: "Document Info", emptyMessage: "No student documents have been added." },
  {
    id: "previous",
    label: "Previous School Information",
    emptyMessage: "No previous school information has been added.",
  },
  { id: "other", label: "Other Info", emptyMessage: "No additional student information has been added." },
  { id: "custom", label: "Custom Field", emptyMessage: "No custom student fields are configured." },
];

const initialState = { success: false, error: undefined };
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white";

export function StudentForm({
  branches,
  years,
  classes,
  sections,
  categories,
  settings,
  record,
}: {
  branches: BranchOption[];
  years: YearOption[];
  classes: ClassOption[];
  sections: SectionOption[];
  categories: CategoryOption[];
  settings: StudentFieldSettings;
  record?: StudentEditRecord;
}) {
  const [state, formAction, pending] = useActionState(
    record ? updateStudent : createStudent,
    initialState,
  );
  const generatedFormId = useId();
  const formId = record?.publicId ?? generatedFormId;
  const [branchId, setBranchId] = useState(record?.branchId ? String(record.branchId) : "");
  const [yearId, setYearId] = useState("");
  const [classLevelId, setClassLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [activeTab, setActiveTab] = useState<StudentEditTab>("personal");
  const [pendingUploads, setPendingUploads] = useState<Record<number, boolean>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValues = useRef<Map<string, string[]> | null>(null);
  const hasPendingUploads = Object.values(pendingUploads).some(Boolean);
  const fieldConfig = (name: keyof StudentFieldSettings) => settings[name];

  useEffect(() => {
    if (!state.error || !submittedValues.current || !formRef.current) return;
    for (const [name, values] of submittedValues.current) {
      const field = formRef.current.elements.namedItem(name);
      if (field instanceof RadioNodeList) {
        field.value = values[0] ?? "";
      } else if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        if (field instanceof HTMLInputElement && field.type === "file") continue;
        field.value = values[0] ?? "";
      }
    }
    submittedValues.current = null;
  }, [state]);

  const branchClasses = useMemo(
    () => classes.filter((item) => String(item.branchId) === branchId),
    [branchId, classes],
  );
  const yearSections = useMemo(
    () => sections.filter(
      (item) =>
        String(item.academicYearId) === yearId &&
        String(item.classLevelId) === classLevelId,
    ),
    [classLevelId, sections, yearId],
  );
  const branchCategories = useMemo(
    () => categories.filter((item) => String(item.branchId) === branchId),
    [branchId, categories],
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const snapshot = new Map<string, string[]>();
        for (const [name, value] of formData.entries()) {
          if (typeof value !== "string") continue;
          snapshot.set(name, [...(snapshot.get(name) ?? []), value]);
        }
        submittedValues.current = snapshot;
      }}
      className="space-y-6"
    >
      {record && <input type="hidden" name="publicId" value={record.publicId} />}
      <p className="text-xs text-slate-500">
        <RequiredMark /> Required fields
      </p>

      <div
        role="tablist"
        aria-label="Student information sections"
        className="grid grid-cols-2 gap-2 border-b border-slate-200 pb-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {studentEditTabs.map((tab) => (
          <button
            key={tab.id}
            id={`student-form-${formId}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`student-form-${formId}-${tab.id}-panel`}
            onClick={() => setActiveTab(tab.id)}
            className={`min-w-0 rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              activeTab === tab.id
                ? "bg-violet-100 text-violet-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`student-form-${formId}-personal-tab`}
        id={`student-form-${formId}-personal-panel`}
        hidden={activeTab !== "personal"}
        className="space-y-6"
      >
      <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-2 text-sm font-semibold text-slate-900">
          {record ? "Academic Information" : "Admission and class placement"}
        </legend>
        {!record && (
          <p className="text-sm text-slate-500">
            Choose the branch, academic year, class, and section to enroll the student during registration.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SearchableSelect
            label="Branch"
            name="branchId"
            options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
            required
            defaultValue={branchId}
            placeholder="Search branches..."
            disabled={!branches.length}
            onValueChange={(value) => {
              setBranchId(value);
              setYearId("");
              setClassLevelId("");
              setSectionId("");
            }}
          />

          {!record ? (
            <SearchableSelect
              key={branchId}
              label="Academic year"
              name="academicYearId"
              options={years.map((year) => ({ value: String(year.id), label: year.label }))}
              required
              defaultValue={yearId}
              placeholder="Search academic years..."
              disabled={!years.length}
              onValueChange={(value) => {
                setYearId(value);
                setClassLevelId("");
                setSectionId("");
              }}
            />
          ) : (
            <>
              <ReadOnlyField label="Admission number" value={record.admissionNumber} />
              <ReadOnlyField label="Roll" value={record.rollNumber} />
              <ReadOnlyField label="Class" value={record.className} />
              <ReadOnlyField label="Class section" value={record.sectionName} />
              <ReadOnlyField label="Academic year" value={record.academicYearName} />
              <ReadOnlyField label="Admission status" value={record.status} />
            </>
          )}

          {!record && (
            <>
              <SearchableSelect
                key={branchId}
                label="Class"
                name="classLevelId"
                options={branchClasses.map((classOption) => ({ value: String(classOption.id), label: classOption.label }))}
                required
                defaultValue={classLevelId}
                placeholder="Search classes..."
                disabled={!branchId || !branchClasses.length}
                onValueChange={(value) => {
                  setClassLevelId(value);
                  setSectionId("");
                }}
              />
              <SearchableSelect
                key={`${yearId}-${classLevelId}`}
                label="Class section"
                name="classSectionId"
                options={yearSections.map((section) => ({ value: String(section.id), label: section.label }))}
                required
                defaultValue={sectionId}
                placeholder="Search class sections..."
                disabled={!yearId || !classLevelId || !yearSections.length}
                onValueChange={setSectionId}
              />
              <p className="text-sm text-slate-500 sm:col-span-2">Admission and roll numbers will be generated automatically when this student is registered.</p>
            </>
          )}

          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Admission date {fieldConfig("admissionDate").required && <RequiredMark />}
            <input
              name="admissionDate"
              type="date"
              required={fieldConfig("admissionDate").required}
              defaultValue={record?.admissionDate ?? new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </label>
          <div hidden={!fieldConfig("categoryId").enabled}>
            <SearchableSelect
              key={branchId}
              name="categoryId"
              label="Student category"
              options={[
                { value: "", label: "No category" },
                ...branchCategories.map((category) => ({ value: String(category.id), label: category.label })),
              ]}
              required={fieldConfig("categoryId").required}
              defaultValue={record?.categoryId ? String(record.categoryId) : ""}
              disabled={!branchId}
              placeholder="Search categories..."
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-2 text-sm font-semibold text-slate-900">Personal Info</legend>
        <div hidden={!fieldConfig("profilePhoto").enabled} className="space-y-2">
          <span className="text-sm font-medium text-slate-700">
            Profile photo {fieldConfig("profilePhoto").required && <RequiredMark />}
          </span>
          <ProfilePhotoField
            record={record}
            photo={record?.additionalDetails?.profilePhoto}
            onPendingChange={(isPending) =>
              setPendingUploads((current) => ({ ...current, 0: isPending }))
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" required={fieldConfig("firstName").required} visible={fieldConfig("firstName").enabled} defaultValue={record?.firstName} />
          <Field label="Last name" name="lastName" required={fieldConfig("lastName").required} visible={fieldConfig("lastName").enabled} defaultValue={record?.lastName} />
          <label hidden={!fieldConfig("gender").enabled} className="space-y-1.5 text-sm font-medium text-slate-700">
          Gender {fieldConfig("gender").required && <RequiredMark />}
          <select name="gender" required={fieldConfig("gender").required} defaultValue={record?.gender ?? ""} className={inputClass}>
              <option value="" disabled>Select gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </label>
          <Field
            label="Date of birth"
            name="dateOfBirth"
            type="date"
          required={fieldConfig("dateOfBirth").required}
          visible={fieldConfig("dateOfBirth").enabled}
            defaultValue={record?.dateOfBirth ?? ""}
          />
          <Field label="Religion" name="religion" required={fieldConfig("religion").required} visible={fieldConfig("religion").enabled} defaultValue={record?.religion ?? ""} />
          <Field
            label="Caste"
            name="caste"
          required={fieldConfig("caste").required}
          visible={fieldConfig("caste").enabled}
            defaultValue={record?.additionalDetails?.caste ?? ""}
          />
          <label hidden={!fieldConfig("bloodGroup").enabled} className="space-y-1.5 text-sm font-medium text-slate-700">
            Blood group {fieldConfig("bloodGroup").required && <RequiredMark />}
            <select name="bloodGroup" required={fieldConfig("bloodGroup").required} defaultValue={record?.bloodGroup ?? ""} className={inputClass}>
              <option value="">Not specified</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </label>
          <Field label="Student email" name="email" type="email" required={fieldConfig("email").required} visible={fieldConfig("email").enabled} defaultValue={record?.email ?? ""} />
          <Field label="Student phone" name="phone" required={fieldConfig("phone").required} visible={fieldConfig("phone").enabled} defaultValue={record?.phone ?? ""} />
          <Field
            label="Current address"
            name="currentAddress"
            required={fieldConfig("currentAddress").required}
            visible={fieldConfig("currentAddress").enabled}
            defaultValue={record?.currentAddress ?? ""}
          />
          <Field
            label="Permanent address"
            name="permanentAddress"
            required={fieldConfig("permanentAddress").required}
            visible={fieldConfig("permanentAddress").enabled}
            defaultValue={record?.permanentAddress ?? ""}
          />
          <Field
            label="Height (inches)"
            name="heightInches"
            type="number"
            required={fieldConfig("heightInches").required}
            visible={fieldConfig("heightInches").enabled}
            min="0"
            max="120"
            step="0.1"
            defaultValue={record?.additionalDetails?.heightInches ?? ""}
          />
          <Field
            label="Weight (kg)"
            name="weightKg"
            type="number"
            required={fieldConfig("weightKg").required}
            visible={fieldConfig("weightKg").enabled}
            min="0"
            max="500"
            step="0.1"
            defaultValue={record?.additionalDetails?.weightKg ?? ""}
          />
        </div>
      </fieldset>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`student-form-${formId}-parents-tab`}
        id={`student-form-${formId}-parents-panel`}
        hidden={activeTab !== "parents"}
      >
      <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-2 text-sm font-semibold text-slate-900">Parents &amp; Guardian Info</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Father's name" name="fatherName" required={fieldConfig("fatherName").required} visible={fieldConfig("fatherName").enabled} defaultValue={record?.fatherName ?? ""} />
          <Field label="Father's occupation" name="fatherOccupation" required={fieldConfig("fatherOccupation").required} visible={fieldConfig("fatherOccupation").enabled} defaultValue={record?.fatherOccupation ?? ""} />
          <Field label="Father's phone" name="fatherPhone" required={fieldConfig("fatherPhone").required} visible={fieldConfig("fatherPhone").enabled} defaultValue={record?.fatherPhone ?? ""} />
          <Field label="Mother's name" name="motherName" required={fieldConfig("motherName").required} visible={fieldConfig("motherName").enabled} defaultValue={record?.motherName ?? ""} />
          <Field label="Mother's occupation" name="motherOccupation" required={fieldConfig("motherOccupation").required} visible={fieldConfig("motherOccupation").enabled} defaultValue={record?.motherOccupation ?? ""} />
          <Field label="Mother's phone" name="motherPhone" required={fieldConfig("motherPhone").required} visible={fieldConfig("motherPhone").enabled} defaultValue={record?.motherPhone ?? ""} />
          <Field label="Guardian's name" name="guardianName" required={fieldConfig("guardianName").required} visible={fieldConfig("guardianName").enabled} defaultValue={record?.guardianName ?? ""} />
          <Field label="Relationship to student" name="guardianRelation" required={fieldConfig("guardianRelation").required} visible={fieldConfig("guardianRelation").enabled} defaultValue={record?.guardianRelation ?? ""} />
          <Field
            label="Guardian email"
            name="guardianEmail"
            type="email"
            required={fieldConfig("guardianEmail").required}
            visible={fieldConfig("guardianEmail").enabled}
            defaultValue={record?.guardianEmail ?? ""}
          />
          <Field label="Guardian phone" name="guardianPhone" required={fieldConfig("guardianPhone").required} visible={fieldConfig("guardianPhone").enabled} defaultValue={record?.guardianPhone ?? ""} />
          <Field
            label="Guardian occupation"
            name="guardianOccupation"
            required={fieldConfig("guardianOccupation").required}
            visible={fieldConfig("guardianOccupation").enabled}
            defaultValue={record?.guardianOccupation ?? ""}
          />
          <Field
            label="Guardian address"
            name="guardianAddress"
            required={fieldConfig("guardianAddress").required}
            visible={fieldConfig("guardianAddress").enabled}
            defaultValue={record?.guardianAddress ?? ""}
          />
        </div>
      </fieldset>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`student-form-${formId}-documents-tab`}
        id={`student-form-${formId}-documents-panel`}
        hidden={activeTab !== "documents"}
        className="space-y-5"
      >
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Identity and financial information</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="National ID number" name="nationalIdNumber" required={fieldConfig("nationalIdNumber").required} visible={fieldConfig("nationalIdNumber").enabled} defaultValue={record?.additionalDetails?.nationalIdNumber ?? ""} />
            <Field label="Birth certificate number" name="birthCertificateNumber" required={fieldConfig("birthCertificateNumber").required} visible={fieldConfig("birthCertificateNumber").enabled} defaultValue={record?.additionalDetails?.birthCertificateNumber ?? ""} />
            <Field label="Bank name" name="bankName" required={fieldConfig("bankName").required} visible={fieldConfig("bankName").enabled} defaultValue={record?.additionalDetails?.bankName ?? ""} />
            <Field label="Bank account number" name="bankAccountNumber" required={fieldConfig("bankAccountNumber").required} visible={fieldConfig("bankAccountNumber").enabled} defaultValue={record?.additionalDetails?.bankAccountNumber ?? ""} />
            <Field label="IFSC / bank routing code" name="bankIfscCode" required={fieldConfig("bankIfscCode").required} visible={fieldConfig("bankIfscCode").enabled} defaultValue={record?.additionalDetails?.bankIfscCode ?? ""} />
          </div>
          <TextareaField
            label="Additional notes"
            name="additionalNotes"
            required={fieldConfig("additionalNotes").required}
            visible={fieldConfig("additionalNotes").enabled}
            defaultValue={record?.additionalDetails?.additionalNotes ?? ""}
          />
        </fieldset>
        <fieldset hidden={!fieldConfig("studentDocuments").enabled} className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Student documents</legend>
          {fieldConfig("studentDocuments").required && <p className="text-sm text-slate-600"><RequiredMark /> At least one document is required.</p>}
          <p className="text-sm text-slate-500">PDF, JPEG, PNG, or WebP files up to 4 MB each.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => {
              const slot = index + 1;
              const document = record?.additionalDetails?.documents?.[index];
              return (
                <StudentDocumentField
                  key={slot}
                  slot={slot}
                  record={record}
                  document={document}
                  onPendingChange={(isPending) =>
                    setPendingUploads((current) => ({ ...current, [slot]: isPending }))
                  }
                />
              );
            })}
          </div>
        </fieldset>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`student-form-${formId}-previous-tab`}
        id={`student-form-${formId}-previous-panel`}
        hidden={activeTab !== "previous"}
      >
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Previous school information</legend>
          <TextareaField
            label="Previous school details"
            name="previousSchoolDetails"
            required={fieldConfig("previousSchoolDetails").required}
            visible={fieldConfig("previousSchoolDetails").enabled}
            defaultValue={record?.additionalDetails?.previousSchoolDetails ?? ""}
          />
        </fieldset>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`student-form-${formId}-other-tab`}
        id={`student-form-${formId}-other-panel`}
        hidden={activeTab !== "other"}
        className="space-y-5"
      >
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Transport information</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transport route" name="transportRoute" required={fieldConfig("transportRoute").required} visible={fieldConfig("transportRoute").enabled} defaultValue={record?.additionalDetails?.transportRoute ?? ""} />
            <Field label="Vehicle number" name="vehicleNumber" required={fieldConfig("vehicleNumber").required} visible={fieldConfig("vehicleNumber").enabled} defaultValue={record?.additionalDetails?.vehicleNumber ?? ""} />
          </div>
        </fieldset>
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Dormitory information</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dormitory" name="dormitoryName" required={fieldConfig("dormitoryName").required} visible={fieldConfig("dormitoryName").enabled} defaultValue={record?.additionalDetails?.dormitoryName ?? ""} />
            <Field label="Room number" name="dormitoryRoom" required={fieldConfig("dormitoryRoom").required} visible={fieldConfig("dormitoryRoom").enabled} defaultValue={record?.additionalDetails?.dormitoryRoom ?? ""} />
          </div>
        </fieldset>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`student-form-${formId}-custom-tab`}
        id={`student-form-${formId}-custom-panel`}
        hidden={activeTab !== "custom"}
      >
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Custom student field</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Field name" name="customFieldName" required={fieldConfig("customFieldName").required} visible={fieldConfig("customFieldName").enabled} defaultValue={record?.additionalDetails?.customFieldName ?? ""} />
            <Field label="Field value" name="customFieldValue" required={fieldConfig("customFieldValue").required} visible={fieldConfig("customFieldValue").enabled} defaultValue={record?.additionalDetails?.customFieldValue ?? ""} />
          </div>
        </fieldset>
      </div>

      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && (
        <p role="status" className="text-sm text-emerald-700">
          {record
            ? "Student record updated."
            : "Admission and class placement added to the review queue."}
        </p>
      )}
      <div className="flex justify-end">
        {record
          ? <button type="submit" disabled={pending || hasPendingUploads} className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
              {hasPendingUploads ? "Uploading documents..." : pending ? "Saving..." : "Save changes"}
            </button>
          : <AdminConfirmSubmitButton
              label="Submit student admission and class placement"
              buttonText={hasPendingUploads ? "Uploading documents..." : pending ? "Saving..." : "Submit admission and class placement"}
              confirmationTitle="Confirm student admission"
              confirmationMessage="Submit this student’s admission and class placement for review?"
              disabled={pending || hasPendingUploads}
              variant="primary"
            />}
      </div>
    </form>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-slate-700">
      {label}
      <input
        value={value ?? ""}
        readOnly
        placeholder="Not provided"
        className={`${inputClass} read-only:bg-slate-100`}
      />
    </label>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  visible = true,
  defaultValue,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  visible?: boolean;
  defaultValue?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label hidden={!visible} className="space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        maxLength={type === "date" || type === "number" ? undefined : 1000}
        className={inputClass}
      />
    </label>
  );
}

function TextareaField({
  label,
  name,
  required = false,
  visible = true,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  visible?: boolean;
  defaultValue?: string;
}) {
  return (
    <label hidden={!visible} className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <textarea
        name={name}
        required={required}
        defaultValue={defaultValue}
        maxLength={2000}
        rows={4}
        className={inputClass}
      />
    </label>
  );
}

function StudentDocumentField({
  slot,
  record,
  document,
  onPendingChange,
}: {
  slot: number;
  record?: StudentEditRecord;
  document?: StudentAdditionalDetails["documents"][number];
  onPendingChange: (pending: boolean) => void;
}) {
  const [fileName, setFileName] = useState(document?.fileName ?? "");
  const [objectKey, setObjectKey] = useState(document?.objectKey ?? "");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file: File) {
    setUploadError("");
    if (file.size > 4 * 1024 * 1024) {
      setUploadError("Choose a PDF, JPEG, PNG, or WebP file no larger than 4 MB.");
      return;
    }
    setUploading(true);
    onPendingChange(true);
    try {
      const uploadForm = new FormData();
      uploadForm.set("mode", record ? "update" : "create");
      if (record) uploadForm.set("studentPublicId", record.publicId);
      uploadForm.set("file", file);

      const response = await fetch("/api/admin/students/document-upload", {
        method: "POST",
        body: uploadForm,
      });
      const result = await response.json() as {
        error?: string;
        fileName?: string;
        objectKey?: string;
      };
      if (!response.ok || !result.fileName || !result.objectKey) {
        setUploadError(result.error ?? "The document upload failed. Try again.");
        return;
      }
      setFileName(result.fileName);
      setObjectKey(result.objectKey);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "The document upload failed. Try again.",
      );
    } finally {
      setUploading(false);
      onPendingChange(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <Field
        label={`Document ${slot} title`}
        name={`documentTitle${slot}`}
        defaultValue={document?.title ?? ""}
      />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>Document {slot} file</span>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-800 hover:file:bg-violet-100"
        />
      </label>
      <input type="hidden" name={`documentFileName${slot}`} value={fileName} />
      <input type="hidden" name={`documentObjectKey${slot}`} value={objectKey} />
      {fileName && objectKey && (
        <p className="break-all text-xs text-slate-500">
          Saved:{" "}
          {record ? (
            <a
              href={`/api/admin/students/${record.publicId}/documents/${slot}`}
              className="font-medium text-violet-800 underline"
            >
              {fileName}
            </a>
          ) : fileName}
        </p>
      )}
      {uploading && <p role="status" className="text-xs text-violet-700">Uploading…</p>}
      {uploadError && <p role="alert" className="text-xs text-rose-700">{uploadError}</p>}
    </div>
  );
}

function ProfilePhotoField({
  record,
  photo,
  onPendingChange,
}: {
  record?: StudentEditRecord;
  photo?: StudentAdditionalDetails["profilePhoto"] | null;
  onPendingChange: (pending: boolean) => void;
}) {
  const [fileName, setFileName] = useState(photo?.fileName ?? "");
  const [objectKey, setObjectKey] = useState(photo?.objectKey ?? "");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function uploadPhoto(file: File) {
    setUploadError("");
    if (file.size === 0 || file.size > 4 * 1024 * 1024) {
      setUploadError("Choose a JPEG, PNG, or WebP photo no larger than 4 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Choose a JPEG, PNG, or WebP photo.");
      return;
    }

    setUploading(true);
    onPendingChange(true);
    try {
      const uploadForm = new FormData();
      uploadForm.set("mode", record ? "update" : "create");
      uploadForm.set("purpose", "profile-photo");
      if (record) uploadForm.set("studentPublicId", record.publicId);
      uploadForm.set("file", file);

      const response = await fetch("/api/admin/students/document-upload", {
        method: "POST",
        body: uploadForm,
      });
      const result = await response.json() as {
        error?: string;
        fileName?: string;
        objectKey?: string;
      };
      if (!response.ok || !result.fileName || !result.objectKey) {
        setUploadError(result.error ?? "The photo upload failed. Try again.");
        return;
      }

      setFileName(result.fileName);
      setObjectKey(result.objectKey);
      setLocalPreview(URL.createObjectURL(file));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The photo upload failed. Try again.");
    } finally {
      setUploading(false);
      onPendingChange(false);
    }
  }

  const previewUrl = localPreview ?? (
    record && objectKey ? `/api/admin/students/${record.publicId}/photo` : null
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
      {previewUrl ? (
        <Image
          src={previewUrl}
          alt="Student profile photo preview"
          width={112}
          height={112}
          unoptimized
          className="h-28 w-28 rounded-xl border border-slate-200 object-cover"
        />
      ) : (
        <div
          aria-label="No student photo selected"
          className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-3xl font-semibold text-slate-400"
        >
          +
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Student photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-800 hover:file:bg-violet-100"
          />
        </label>
        <p className="text-xs text-slate-500">JPEG, PNG, or WebP · up to 4 MB</p>
        {fileName && <p className="break-all text-xs text-slate-500">Saved: {fileName}</p>}
        <input type="hidden" name="profilePhotoFileName" value={fileName} />
        <input type="hidden" name="profilePhotoObjectKey" value={objectKey} />
        {uploading && <p role="status" className="text-xs text-violet-700">Uploading photo…</p>}
        {uploadError && <p role="alert" className="text-xs text-rose-700">{uploadError}</p>}
      </div>
    </div>
  );
}
