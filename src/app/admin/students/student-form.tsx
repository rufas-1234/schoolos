"use client";

import Image from "next/image";
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { RequiredMark } from "@/components/required-mark";
import type { StudentAdditionalDetails } from "@/db/schema";
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
  record,
}: {
  branches: BranchOption[];
  years: YearOption[];
  classes: ClassOption[];
  sections: SectionOption[];
  categories: CategoryOption[];
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
  const hasPendingUploads = Object.values(pendingUploads).some(Boolean);

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
      action={formAction}
      onSubmit={(event) => {
        if (record) return;
        const formData = new FormData(event.currentTarget);
        const studentName = [formData.get("firstName"), formData.get("lastName")]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join(" ");
        const label = studentName || "this student";
        if (!window.confirm(`Are you sure you want to register ${label} and place them in the selected class?`)) {
          event.preventDefault();
        }
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
        className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2"
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
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
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
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Branch <RequiredMark />
            <select
              name="branchId"
              required
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setYearId("");
                setClassLevelId("");
                setSectionId("");
              }}
              className={inputClass}
            >
              <option value="" disabled>Select a branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.label}</option>
              ))}
            </select>
          </label>

          {!record ? (
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              Academic year <RequiredMark />
              <select
                name="academicYearId"
                required
                value={yearId}
                onChange={(event) => {
                  setYearId(event.target.value);
                  setClassLevelId("");
                  setSectionId("");
                }}
                className={inputClass}
              >
                <option value="" disabled>Select an active academic year</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>{year.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <input type="hidden" name="admissionNumber" value={record.admissionNumber ?? ""} />
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
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Class <RequiredMark />
                <select
                  name="classLevelId"
                  required
                  value={classLevelId}
                  onChange={(event) => {
                    setClassLevelId(event.target.value);
                    setSectionId("");
                  }}
                  disabled={!branchId}
                  className={inputClass}
                >
                  <option value="" disabled>Select a class</option>
                  {branchClasses.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>{classOption.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Class section <RequiredMark />
                <select
                  name="classSectionId"
                  required
                  value={sectionId}
                  onChange={(event) => setSectionId(event.target.value)}
                  disabled={!yearId || !classLevelId}
                  className={inputClass}
                >
                  <option value="" disabled>Select a section</option>
                  {yearSections.map((section) => (
                    <option key={section.id} value={section.id}>{section.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Admission number <RequiredMark />
                <input
                  name="admissionNumber"
                  required
                  maxLength={40}
                  className={inputClass}
                  placeholder="e.g. 2026-001"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Roll number
                <input name="rollNumber" maxLength={40} className={inputClass} />
              </label>
            </>
          )}

          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Admission date
            <input
              name="admissionDate"
              type="date"
              defaultValue={record?.admissionDate ?? new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Student category
            <select
              name="categoryId"
              defaultValue={record?.categoryId ? String(record.categoryId) : ""}
              disabled={!branchId}
              className={inputClass}
            >
              <option value="">No category</option>
              {branchCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-2 text-sm font-semibold text-slate-900">Personal Info</legend>
        <ProfilePhotoField
          record={record}
          photo={record?.additionalDetails?.profilePhoto}
          onPendingChange={(isPending) =>
            setPendingUploads((current) => ({ ...current, 0: isPending }))
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" required defaultValue={record?.firstName} />
          <Field label="Last name" name="lastName" required defaultValue={record?.lastName} />
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Gender <RequiredMark />
            <select name="gender" required defaultValue={record?.gender ?? ""} className={inputClass}>
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
            required
            defaultValue={record?.dateOfBirth ?? ""}
          />
          <Field label="Religion" name="religion" defaultValue={record?.religion ?? ""} />
          <Field
            label="Caste"
            name="caste"
            defaultValue={record?.additionalDetails?.caste ?? ""}
          />
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Blood group
            <select name="bloodGroup" defaultValue={record?.bloodGroup ?? ""} className={inputClass}>
              <option value="">Not specified</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </label>
          <Field label="Student email" name="email" type="email" defaultValue={record?.email ?? ""} />
          <Field label="Student phone" name="phone" required defaultValue={record?.phone ?? ""} />
          <Field
            label="Current address"
            name="currentAddress"
            defaultValue={record?.currentAddress ?? ""}
          />
          <Field
            label="Permanent address"
            name="permanentAddress"
            defaultValue={record?.permanentAddress ?? ""}
          />
          <Field
            label="Height (inches)"
            name="heightInches"
            type="number"
            min="0"
            max="120"
            step="0.1"
            defaultValue={record?.additionalDetails?.heightInches ?? ""}
          />
          <Field
            label="Weight (kg)"
            name="weightKg"
            type="number"
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
          <Field label="Father's name" name="fatherName" defaultValue={record?.fatherName ?? ""} />
          <Field label="Father's occupation" name="fatherOccupation" defaultValue={record?.fatherOccupation ?? ""} />
          <Field label="Father's phone" name="fatherPhone" defaultValue={record?.fatherPhone ?? ""} />
          <Field label="Mother's name" name="motherName" defaultValue={record?.motherName ?? ""} />
          <Field label="Mother's occupation" name="motherOccupation" defaultValue={record?.motherOccupation ?? ""} />
          <Field label="Mother's phone" name="motherPhone" defaultValue={record?.motherPhone ?? ""} />
          <Field label="Guardian's name" name="guardianName" defaultValue={record?.guardianName ?? ""} />
          <Field label="Relationship to student" name="guardianRelation" defaultValue={record?.guardianRelation ?? ""} />
          <Field
            label="Guardian email"
            name="guardianEmail"
            type="email"
            defaultValue={record?.guardianEmail ?? ""}
          />
          <Field label="Guardian phone" name="guardianPhone" defaultValue={record?.guardianPhone ?? ""} />
          <Field
            label="Guardian occupation"
            name="guardianOccupation"
            defaultValue={record?.guardianOccupation ?? ""}
          />
          <Field
            label="Guardian address"
            name="guardianAddress"
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
            <Field label="National ID number" name="nationalIdNumber" defaultValue={record?.additionalDetails?.nationalIdNumber ?? ""} />
            <Field label="Birth certificate number" name="birthCertificateNumber" defaultValue={record?.additionalDetails?.birthCertificateNumber ?? ""} />
            <Field label="Bank name" name="bankName" defaultValue={record?.additionalDetails?.bankName ?? ""} />
            <Field label="Bank account number" name="bankAccountNumber" defaultValue={record?.additionalDetails?.bankAccountNumber ?? ""} />
            <Field label="IFSC / bank routing code" name="bankIfscCode" defaultValue={record?.additionalDetails?.bankIfscCode ?? ""} />
          </div>
          <TextareaField
            label="Additional notes"
            name="additionalNotes"
            defaultValue={record?.additionalDetails?.additionalNotes ?? ""}
          />
        </fieldset>
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Student documents</legend>
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
            <Field label="Transport route" name="transportRoute" defaultValue={record?.additionalDetails?.transportRoute ?? ""} />
            <Field label="Vehicle number" name="vehicleNumber" defaultValue={record?.additionalDetails?.vehicleNumber ?? ""} />
          </div>
        </fieldset>
        <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold text-slate-900">Dormitory information</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dormitory" name="dormitoryName" defaultValue={record?.additionalDetails?.dormitoryName ?? ""} />
            <Field label="Room number" name="dormitoryRoom" defaultValue={record?.additionalDetails?.dormitoryRoom ?? ""} />
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
            <Field label="Field name" name="customFieldName" defaultValue={record?.additionalDetails?.customFieldName ?? ""} />
            <Field label="Field value" name="customFieldValue" defaultValue={record?.additionalDetails?.customFieldValue ?? ""} />
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
        <button
          type="submit"
          disabled={pending || hasPendingUploads}
          className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {hasPendingUploads
            ? "Uploading documents..."
            : pending
            ? "Saving..."
            : record
              ? "Save changes"
              : "Submit admission and class placement"}
        </button>
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
  defaultValue,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-slate-700">
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
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label}
      <textarea
        name={name}
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
