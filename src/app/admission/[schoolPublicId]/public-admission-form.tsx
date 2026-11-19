"use client";

import { useActionState, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import type { StudentFieldSettings } from "@/db/schema";
import { studentSettingFields } from "@/lib/student-settings";
import { createPublicStudentAdmissionApplication, type StudentActionState } from "@/app/admin/students/actions";

type Option = { id: number; label: string };
type ClassOption = Option & { branchId: number };
type SectionOption = Option & { academicYearId: number; classLevelId: number };
type CategoryOption = Option & { branchId: number | null };
type UploadedFile = { fileName: string; objectKey: string };

const inputClass = "w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";
const textAreaFields = new Set([
  "currentAddress",
  "permanentAddress",
  "guardianAddress",
  "additionalNotes",
  "previousSchoolDetails",
]);
const genderOptions = [
  ["female", "Female"],
  ["male", "Male"],
  ["other", "Other"],
  ["non_binary", "Non-binary"],
  ["prefer_not_to_say", "Prefer not to say"],
];
const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function PublicAdmissionForm({
  schoolPublicId,
  fields,
  fieldDefinitions,
  branches,
  years,
  classes,
  sections,
  categories,
}: {
  schoolPublicId: string;
  fields: StudentFieldSettings;
  fieldDefinitions: typeof studentSettingFields;
  branches: Option[];
  years: Option[];
  classes: ClassOption[];
  sections: SectionOption[];
  categories: CategoryOption[];
}) {
  const [state, formAction, pending] = useActionState<StudentActionState, FormData>(
    createPublicStudentAdmissionApplication,
    {},
  );
  const [branchId, setBranchId] = useState("");
  const [yearId, setYearId] = useState("");
  const [classLevelId, setClassLevelId] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<UploadedFile | null>(null);
  const [documents, setDocuments] = useState<Record<number, UploadedFile | null>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState("");

  const visibleFields = fieldDefinitions.filter((field) => fields[field.name]?.enabled);
  const groupedFields = useMemo(() => {
    const groups = new Map<string, typeof visibleFields>();
    for (const field of visibleFields) {
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return [...groups.entries()];
  }, [visibleFields]);
  const branchClasses = classes.filter((item) => String(item.branchId) === branchId);
  const yearSections = sections.filter((item) =>
    String(item.academicYearId) === yearId && String(item.classLevelId) === classLevelId,
  );
  const branchCategories = categories.filter((item) => String(item.branchId) === branchId);
  const hasPendingUploads = Object.values(uploading).some(Boolean);

  async function uploadFile(file: File, purpose: "document" | "profile-photo", slot: string) {
    setUploadError("");
    setUploading((current) => ({ ...current, [slot]: true }));
    try {
      const uploadData = new FormData();
      uploadData.set("file", file);
      uploadData.set("purpose", purpose);
      const response = await fetch(`/api/admission/${schoolPublicId}/upload`, {
        method: "POST",
        body: uploadData,
      });
      const result = await response.json() as UploadedFile & { error?: string };
      if (!response.ok) throw new Error(result.error || "The file could not be uploaded.");
      const uploaded = { fileName: result.fileName, objectKey: result.objectKey };
      if (slot === "profilePhoto") setProfilePhoto(uploaded);
      else setDocuments((current) => ({ ...current, [Number(slot)]: uploaded }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The file could not be uploaded.");
    } finally {
      setUploading((current) => ({ ...current, [slot]: false }));
    }
  }

  function renderFileField(fieldName: "profilePhoto" | "studentDocuments", label: string, required: boolean) {
    if (fieldName === "profilePhoto") {
      return (
        <div className="space-y-2 sm:col-span-2" key={fieldName}>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>{label}{required && <span className="text-rose-700"> *</span>}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={required && !profilePhoto}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadFile(file, "profile-photo", "profilePhoto");
              }}
              className={inputClass}
            />
          </label>
          <input type="hidden" name="profilePhotoFileName" value={profilePhoto?.fileName ?? ""} />
          <input type="hidden" name="profilePhotoObjectKey" value={profilePhoto?.objectKey ?? ""} />
          {profilePhoto && (
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>{profilePhoto.fileName}</span>
              <button type="button" onClick={() => setProfilePhoto(null)} className="font-semibold text-rose-800">Remove</button>
            </div>
          )}
          <p className="text-xs text-slate-500">JPEG, PNG, or WebP; maximum 4 MB.</p>
        </div>
      );
    }

    return (
      <fieldset key={fieldName} className="space-y-3 sm:col-span-2">
        <legend className="text-sm font-medium text-slate-700">
          {label}{required && <span className="text-rose-700"> *</span>}
        </legend>
        <p className="text-xs text-slate-500">PDF, JPEG, PNG, or WebP; maximum 4 MB per file.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => {
            const slot = index + 1;
            const uploaded = documents[slot] ?? null;
            return (
              <div key={slot} className="space-y-2 rounded-lg border border-slate-100 p-3">
                <label className="block space-y-1 text-xs font-medium text-slate-600">
                  Document title {slot}
                  <input
                    name={`documentTitle${slot}`}
                    maxLength={120}
                    required={Boolean(uploaded)}
                    className={inputClass}
                  />
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  required={required && slot === 1 && !Object.values(documents).some(Boolean)}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadFile(file, "document", String(slot));
                  }}
                  className={inputClass}
                  aria-label={`Upload document ${slot}`}
                />
                <input type="hidden" name={`documentFileName${slot}`} value={uploaded?.fileName ?? ""} />
                <input type="hidden" name={`documentObjectKey${slot}`} value={uploaded?.objectKey ?? ""} />
                {uploaded && (
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="truncate">{uploaded.fileName}</span>
                    <button type="button" onClick={() => setDocuments((current) => ({ ...current, [slot]: null }))} className="shrink-0 font-semibold text-rose-800">Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }

  function renderField(field: (typeof studentSettingFields)[number]) {
    const required = fields[field.name]?.required ?? false;
    if (field.name === "profilePhoto" || field.name === "studentDocuments") {
      return renderFileField(field.name, field.label, required);
    }
    if (field.name === "branchId") {
      return (
        <SearchableSelect key="branchId" label={field.label} name="branchId" required
          options={[{ value: "", label: "Select a branch" }, ...branches.map((item) => ({ value: String(item.id), label: item.label }))]}
          placeholder="Search branches..." defaultValue={branchId}
          onValueChange={(value) => {
            setBranchId(value);
            setClassLevelId("");
          }} />
      );
    }
    if (field.name === "academicYearId") {
      return (
        <SearchableSelect key="academicYearId" label={field.label} name="academicYearId" required
          options={[{ value: "", label: "Select an academic year" }, ...years.map((item) => ({ value: String(item.id), label: item.label }))]}
          placeholder="Search academic years..." defaultValue={yearId}
          onValueChange={(value) => {
            setYearId(value);
            setClassLevelId("");
          }} />
      );
    }
    if (field.name === "classLevelId") {
      return (
        <SearchableSelect key={`classLevelId-${branchId}`} label={field.label} name="classLevelId" required
          options={[{ value: "", label: "Select a class" }, ...branchClasses.map((item) => ({ value: String(item.id), label: item.label }))]}
          placeholder="Search classes..." defaultValue={classLevelId} disabled={!branchClasses.length}
          onValueChange={setClassLevelId} />
      );
    }
    if (field.name === "classSectionId") {
      return (
        <SearchableSelect key={`classSectionId-${yearId}-${classLevelId}`} label={field.label} name="classSectionId" required
          options={[{ value: "", label: "Select a class section" }, ...yearSections.map((item) => ({ value: String(item.id), label: item.label }))]}
          placeholder="Search sections..." defaultValue="" disabled={!yearSections.length} />
      );
    }
    if (field.name === "categoryId") {
      return (
        <SearchableSelect key={`categoryId-${branchId}`} label={field.label} name="categoryId" required={required}
          options={[{ value: "", label: "No category selected" }, ...branchCategories.map((item) => ({ value: String(item.id), label: item.label }))]}
          placeholder="Search categories..." defaultValue="" disabled={!branchCategories.length} />
      );
    }
    if (field.name === "gender" || field.name === "bloodGroup") {
      const options = field.name === "gender" ? genderOptions : bloodGroupOptions.map((item) => [item, item]);
      return (
        <label key={field.name} className="block space-y-1.5 text-sm font-medium text-slate-700">
          <span>{field.label}{required && <span className="text-rose-700"> *</span>}</span>
          <select name={field.name} required={required} className={inputClass} defaultValue="">
            <option value="">Select {field.label.toLocaleLowerCase()}</option>
            {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      );
    }
    const type = field.name === "dateOfBirth" || field.name === "admissionDate"
      ? "date"
      : field.name.toLocaleLowerCase().includes("email")
        ? "email"
        : field.name.toLocaleLowerCase().includes("phone")
          ? "tel"
          : ["heightInches", "weightKg"].includes(field.name)
            ? "number"
            : "text";
    const fieldProps = {
      name: field.name,
      type,
      required,
      maxLength: 1000,
      step: type === "number" ? "0.01" : undefined,
      className: inputClass,
    };
    return (
      <label key={field.name} className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>{field.label}{required && <span className="text-rose-700"> *</span>}</span>
        {textAreaFields.has(field.name)
          ? <textarea {...fieldProps} rows={3} />
          : <input {...fieldProps} />}
      </label>
    );
  }

  if (state.success) {
    return (
      <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 sm:p-8">
        <h2 className="text-xl font-bold">Registration received</h2>
        <p className="mt-2 text-sm">Your application has been submitted for review. The school will contact you about the next steps.</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="schoolPublicId" value={schoolPublicId} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-slate-950">Student information</h2>
        <p className="mt-1 text-sm text-slate-600">Fields marked with * are required by the school.</p>
        <div className="mt-6 space-y-6">
          {groupedFields.map(([group, groupFields]) => (
            <fieldset key={group} className="space-y-4">
              <legend className="mb-3 w-full border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wide text-rose-900">{group}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {groupFields.map((field) => <div key={field.name}>{renderField(field)}</div>)}
              </div>
            </fieldset>
          ))}
        </div>
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {uploadError && <p role="alert" className="text-sm text-rose-700">{uploadError}</p>}
        {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="consent" required className="mt-1 accent-rose-800" />
          <span>I confirm that the information provided is accurate and may be used by the school to review this registration.</span>
        </label>
        <button type="submit" disabled={pending || hasPendingUploads} className="rounded-lg bg-rose-900 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-950 disabled:opacity-60">
          {hasPendingUploads ? "Uploading files..." : pending ? "Submitting..." : "Submit registration"}
        </button>
      </section>
    </form>
  );
}
