"use client";

import { useActionState, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import {
  createPublicStaffApplication,
  type StaffActionState,
} from "@/app/admin/staff/actions";
import type { StaffSettingField } from "@/lib/staff-settings";
import {
  employmentTypes,
  staffContractTypes,
  staffGenders,
  staffMaritalStatuses,
  staffRoles,
} from "@/lib/staff-policy";

type Option = { id: number; label: string };
type ScopedOption = Option & { branchId: number | null };
type UploadedFile = { fileName: string; objectKey: string };

const inputClass = "w-full max-w-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const textAreaFields = new Set(["address", "permanentAddress", "qualification", "experience"]);
const fileFields = {
  profilePhotoFileName: { title: "Profile photo", purpose: "profilePhoto", objectKey: "profilePhotoObjectKey", photo: true },
  resumeFileName: { title: "Resume", purpose: "resume", objectKey: "resumeObjectKey", photo: false },
  joiningLetterFileName: { title: "Joining letter", purpose: "joiningLetter", objectKey: "joiningLetterObjectKey", photo: false },
  otherDocumentFileName: { title: "Other document", purpose: "otherDocument", objectKey: "otherDocumentObjectKey", photo: false },
} as const;
const selectOptions: Record<string, readonly string[]> = {
  personnelRole: staffRoles,
  gender: staffGenders,
  maritalStatus: staffMaritalStatuses,
  employmentType: employmentTypes,
  contractType: staffContractTypes,
  showAsExpert: ["yes", "no"],
};

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function PublicStaffRegistrationForm({
  schoolPublicId,
  defaultBranchId,
  visibleFields,
  requiredFields,
  fieldDefinitions,
  branches,
  departments,
  designations,
}: {
  schoolPublicId: string;
  defaultBranchId: number | null;
  visibleFields: string[];
  requiredFields: string[];
  fieldDefinitions: readonly StaffSettingField[];
  branches: Option[];
  departments: ScopedOption[];
  designations: ScopedOption[];
}) {
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(
    createPublicStaffApplication,
    {},
  );
  const [branchId, setBranchId] = useState(String(defaultBranchId ?? ""));
  const [uploads, setUploads] = useState<Record<string, UploadedFile | null>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState("");

  const fields = fieldDefinitions.filter((field) => visibleFields.includes(field.name));
  const groupedFields = useMemo(() => {
    const groups = new Map<string, typeof fields>();
    for (const field of fields) {
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return [...groups.entries()];
  }, [fields]);
  const branchDepartments = departments.filter((item) =>
    item.branchId === null || String(item.branchId) === branchId,
  );
  const branchDesignations = designations.filter((item) =>
    item.branchId === null || String(item.branchId) === branchId,
  );
  const hasPendingUploads = Object.values(uploading).some(Boolean);

  async function uploadFile(fieldName: keyof typeof fileFields, file: File) {
    setUploadError("");
    setUploading((current) => ({ ...current, [fieldName]: true }));
    try {
      const uploadData = new FormData();
      uploadData.set("file", file);
      uploadData.set("purpose", fileFields[fieldName].purpose);
      const response = await fetch(`/api/staff-registration/${schoolPublicId}/upload`, {
        method: "POST",
        body: uploadData,
      });
      const result = await response.json() as UploadedFile & { error?: string };
      if (!response.ok) throw new Error(result.error || "The file could not be uploaded.");
      setUploads((current) => ({
        ...current,
        [fieldName]: { fileName: result.fileName, objectKey: result.objectKey },
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The file could not be uploaded.");
    } finally {
      setUploading((current) => ({ ...current, [fieldName]: false }));
    }
  }

  function renderFileField(field: StaffSettingField, required: boolean) {
    const file = fileFields[field.name as keyof typeof fileFields];
    if (!file) return null;
    const uploaded = uploads[field.name] ?? null;
    return (
      <div key={field.name} className="space-y-2 sm:col-span-2">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          <span>{field.label}{required && <span className="text-slate-900"> *</span>}</span>
          <input
            type="file"
            accept={file.photo ? "image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png,image/webp"}
            required={required && !uploaded}
            disabled={uploading[field.name]}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0];
              if (selected) void uploadFile(field.name as keyof typeof fileFields, selected);
            }}
            className={inputClass}
          />
        </label>
        <input type="hidden" name={field.name} value={uploaded?.fileName ?? ""} />
        <input type="hidden" name={file.objectKey} value={uploaded?.objectKey ?? ""} />
        {uploaded && (
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="truncate">{uploaded.fileName}</span>
            <button type="button" onClick={() => setUploads((current) => ({ ...current, [field.name]: null }))}
              className="shrink-0 font-semibold text-slate-800 underline">Remove</button>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {file.photo ? "JPEG, PNG, or WebP; maximum 4 MB." : "PDF, JPEG, PNG, or WebP; maximum 4 MB."}
        </p>
      </div>
    );
  }

  function renderField(field: StaffSettingField) {
    const required = requiredFields.includes(field.name);
    if (field.name === "linkedUserId") return null;
    if (field.name in fileFields) return renderFileField(field, required);
    if (field.name === "branchId") {
      return (
        <SearchableSelect key="branchId" label={field.label} name="branchId" required={required}
          options={[{ value: "", label: "Select a branch" }, ...branches.map((item) => ({ value: String(item.id), label: item.label }))]}
          placeholder="Search branches..." defaultValue={branchId}
          onValueChange={(value) => setBranchId(value)} />
      );
    }
    if (field.name === "department" || field.name === "jobTitle") {
      const isDepartment = field.name === "department";
      const options = isDepartment ? branchDepartments : branchDesignations;
      return (
        <SearchableSelect key={`${field.name}-${branchId}`} label={field.label} name={field.name} required={required}
          options={[{ value: "", label: `Select ${field.label.toLocaleLowerCase()}` },
            ...options.map((item) => ({ value: item.label, label: item.label }))]}
          placeholder={`Search ${field.label.toLocaleLowerCase()}...`} defaultValue=""
          disabled={!branchId || !options.length} />
      );
    }
    if (field.name in selectOptions) {
      const options = selectOptions[field.name] ?? [];
      return (
        <label key={field.name} className="block space-y-1.5 text-sm font-medium text-slate-700">
          <span>{field.label}{required && <span className="text-slate-900"> *</span>}</span>
          <select name={field.name} required={required} className={inputClass}
            defaultValue={field.name === "showAsExpert" ? "no" : ""}>
            <option value="">Select {field.label.toLocaleLowerCase()}</option>
            {options.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </select>
        </label>
      );
    }

    const type = field.name === "dateOfBirth" || field.name === "startDate"
      ? "date"
      : field.name === "email"
        ? "email"
        : field.name.toLocaleLowerCase().includes("phone")
          ? "tel"
          : field.name === "basicSalary"
            ? "number"
            : field.name.endsWith("Url")
              ? "url"
              : "text";
    const props = {
      name: field.name,
      type,
      required,
      maxLength: 2000,
      step: type === "number" ? "0.01" : undefined,
      className: inputClass,
    };
    return (
      <label key={field.name} className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>{field.label}{required && <span className="text-slate-900"> *</span>}</span>
        {textAreaFields.has(field.name)
          ? <textarea {...props} rows={3} />
          : <input {...props} />}
      </label>
    );
  }

  if (state.success) {
    return (
      <section role="status" className="border border-slate-300 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-slate-950">Application received</h2>
        <p className="mt-2 text-sm text-slate-700">Your application has been submitted for review. The school will contact you about the next steps.</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="schoolPublicId" value={schoolPublicId} />
      <section className="border border-slate-300 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Applicant information</h2>
        <p className="mt-1 text-sm text-slate-600">Fields marked with * are required by the school.</p>
        <div className="mt-6 space-y-6">
          {groupedFields.map(([group, groupFields]) => (
            <fieldset key={group} className="space-y-4">
              <legend className="mb-3 w-full border-b border-slate-300 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">{group}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {groupFields.map((field) => <div key={field.name}>{renderField(field)}</div>)}
              </div>
            </fieldset>
          ))}
        </div>
      </section>
      <section className="space-y-4 border border-slate-300 bg-white p-5 sm:p-7">
        {uploadError && <p role="alert" className="text-sm text-red-700">{uploadError}</p>}
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="consent" required className="mt-1 accent-slate-800" />
          <span>I confirm that the information provided is accurate and may be used by the school to review this application.</span>
        </label>
        <button type="submit" disabled={pending || hasPendingUploads}
          className="border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {hasPendingUploads ? "Uploading files..." : pending ? "Submitting..." : "Submit application"}
        </button>
      </section>
    </form>
  );
}
