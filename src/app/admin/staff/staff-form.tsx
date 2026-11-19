"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { createStaffMember, updateStaffMember, type StaffActionState } from "./actions";
import type { StaffCustomField, StaffDocuments, StaffStoredFile } from "@/db/schema";
import { employmentTypes, staffContractTypes, staffGenders, staffMaritalStatuses, staffRoles } from "@/lib/staff-policy";

type StaffEditRecord = {
  publicId: string;
  branchId: number | null;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  personnelRole: string | null;
  jobTitle: string;
  department: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  gender: string | null;
  maritalStatus: string | null;
  address: string | null;
  permanentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  drivingLicense: string | null;
  showAsExpert: boolean;
  qualification: string | null;
  experience: string | null;
  epfNumber: string | null;
  basicSalary: string | null;
  contractType: string | null;
  location: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankBranch: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  documents: StaffDocuments | null;
  customFields: StaffCustomField[] | null;
  linkedUserId: string | null;
  loginAccessEnabled: boolean;
  employmentType: string;
  startDate: string | null;
};

type StaffFormProps = {
  record?: StaffEditRecord;
  accounts: { id: string; name: string; email: string; membershipStatus: string }[];
  branches: { id: number; name: string; code: string }[];
  departments: { id: number; name: string; branchId: number | null }[];
  designations: { id: number; name: string; branchId: number | null }[];
  requiredFields: string[];
  visibleFields: string[];
};

const tabs = [
  "Basic Information",
  "Payroll Details",
  "Bank Details",
  "Social Links",
  "Document Information",
  "Custom Fields",
] as const;
type Tab = (typeof tabs)[number];

const requiredStaffFieldsContext = createContext<ReadonlySet<string>>(new Set());
const visibleStaffFieldsContext = createContext<ReadonlySet<string>>(new Set());

export function StaffForm({
  record,
  accounts,
  branches,
  departments,
  designations,
  requiredFields,
  visibleFields,
}: StaffFormProps) {
  const action = record ? updateStaffMember : createStaffMember;
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(action, {});
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValues = useRef<Map<string, string[]> | null>(null);
  const accountPasswordRef = useRef<HTMLInputElement>(null);
  const accountPasswordConfirmationRef = useRef<HTMLInputElement>(null);
  const [selectedBranchId, setSelectedBranchId] = useState(record?.branchId?.toString() ?? "");
  const [loginAccessEnabled, setLoginAccessEnabled] = useState(record?.loginAccessEnabled ?? false);
  const customField = (index: number) => record?.customFields?.[index];
  const departmentOptions = branchCatalogOptions(departments, selectedBranchId, record?.department);
  const designationOptions = branchCatalogOptions(designations, selectedBranchId, record?.jobTitle);

  useEffect(() => {
    if (state.success) {
      if (accountPasswordRef.current) accountPasswordRef.current.value = "";
      if (accountPasswordConfirmationRef.current) accountPasswordConfirmationRef.current.value = "";
      submittedValues.current = null;
      return;
    }
    if (!state.error || !submittedValues.current || !formRef.current) return;
    for (const [name, values] of submittedValues.current) {
      if (name === "accountPassword" || name === "accountPasswordConfirmation") continue;
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

  return (
    <visibleStaffFieldsContext.Provider value={new Set(visibleFields)}>
    <requiredStaffFieldsContext.Provider value={new Set(requiredFields)}>
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onSubmit={(event) => {
        const values = new Map<string, string[]>();
        for (const [name, value] of new FormData(event.currentTarget).entries()) {
          if (typeof value === "string") values.set(name, [...(values.get(name) ?? []), value]);
        }
        submittedValues.current = values;
      }}
      className="space-y-5"
    >
      {record && <input type="hidden" name="publicId" value={record.publicId} />}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="Staff profile sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              activeTab === tab
                ? "bg-violet-700 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={activeTab} className="grid gap-4 sm:grid-cols-2">
        <div hidden={activeTab !== "Basic Information"} className="contents">
            <input type="hidden" name="loginAccessEnabled" value={record && loginAccessEnabled ? "true" : "false"} />
            <Field label="Staff number"><input name="employeeCode" defaultValue={record?.employeeCode ?? ""} maxLength={40} className={inputClass} /></Field>
            <Field label="Staff role">
              <select name="personnelRole" defaultValue={record?.personnelRole ?? ""} className={inputClass}>
                <option value="">Select role</option>
                {staffRoles.map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}
              </select>
            </Field>
            <StaffSearchableSelectField
              key={`department-${selectedBranchId}`}
              label="Department"
              name="department"
              options={departmentOptions.map((option) => ({
                value: option.name,
                label: `${option.name}${option.branchId === null ? " (All branches)" : ""}`,
              }))}
              defaultValue={record?.department ?? ""}
              placeholder="Search departments..."
            />
            <StaffSearchableSelectField
              key={`designation-${selectedBranchId}`}
              label="Designation"
              name="jobTitle"
              options={designationOptions.map((option) => ({
                value: option.name,
                label: `${option.name}${option.branchId === null ? " (All branches)" : ""}`,
              }))}
              defaultValue={record?.jobTitle ?? ""}
              placeholder="Search designations..."
            />
            <Field label="First name"><input name="firstName" required minLength={2} maxLength={120} defaultValue={record?.firstName ?? ""} className={inputClass} /></Field>
            <Field label="Last name"><input name="lastName" required minLength={2} maxLength={120} defaultValue={record?.lastName ?? ""} className={inputClass} /></Field>
            <Field label="Father's name"><input name="fatherName" maxLength={160} defaultValue={record?.fatherName ?? ""} className={inputClass} /></Field>
            <Field label="Mother's name"><input name="motherName" maxLength={160} defaultValue={record?.motherName ?? ""} className={inputClass} /></Field>
            <Field label="Email" required={loginAccessEnabled} forceVisible={loginAccessEnabled}>
              <input name="email" type="email" maxLength={320} defaultValue={record?.email ?? ""} className={inputClass} />
            </Field>
            {!record ? (
              <div className="sm:col-span-2 rounded-xl border border-violet-100 bg-violet-50/70 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">A staff login is created automatically</p>
                <p className="mt-1 leading-6">
                  The staff number is the username. If it is blank, a staff number is generated. The initial password is staff@ followed by that number; staff can change it under Account security.
                </p>
              </div>
            ) : (
            <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-start gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={loginAccessEnabled}
                  onChange={(event) => {
                    setLoginAccessEnabled(event.currentTarget.checked);
                    if (!event.currentTarget.checked) {
                      if (accountPasswordRef.current) accountPasswordRef.current.value = "";
                      if (accountPasswordConfirmationRef.current) accountPasswordConfirmationRef.current.value = "";
                    }
                  }}
                  className="mt-1 accent-violet-700"
                />
                <span>
                  Enable login access for this staff member
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                    Login access can be disabled or re-enabled here. Staff sign in with their staff number or linked email.
                  </span>
                </span>
              </label>
              {loginAccessEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>Set or reset password <span className="font-normal text-slate-500">(leave blank to keep an existing password)</span></span>
                    <input
                      ref={accountPasswordRef}
                      name="accountPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      className={inputClass}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>Confirm password</span>
                    <input
                      ref={accountPasswordConfirmationRef}
                      name="accountPasswordConfirmation"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      className={inputClass}
                    />
                  </label>
                </div>
              )}
            </div>
            )}
            <Field label="Gender">
              <select name="gender" defaultValue={record?.gender ?? ""} className={inputClass}>
                <option value="">Select gender</option>
                {staffGenders.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            </Field>
            <Field label="Date of birth"><input name="dateOfBirth" type="date" defaultValue={record?.dateOfBirth ?? ""} className={inputClass} /></Field>
            <Field label="Joining date"><input name="startDate" type="date" defaultValue={record?.startDate ?? ""} className={inputClass} /></Field>
            <Field label="Mobile number"><input name="phone" type="tel" maxLength={40} defaultValue={record?.phone ?? ""} className={inputClass} /></Field>
            <Field label="Marital status">
              <select name="maritalStatus" defaultValue={record?.maritalStatus ?? ""} className={inputClass}>
                <option value="">Select marital status</option>
                {staffMaritalStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            </Field>
            <Field label="Emergency mobile"><input name="emergencyContactPhone" type="tel" maxLength={40} defaultValue={record?.emergencyContactPhone ?? ""} className={inputClass} /></Field>
            <Field label="Emergency contact name"><input name="emergencyContactName" maxLength={160} defaultValue={record?.emergencyContactName ?? ""} className={inputClass} /></Field>
            <Field label="Driving license"><input name="drivingLicense" maxLength={80} defaultValue={record?.drivingLicense ?? ""} className={inputClass} /></Field>
            <StaffSearchableSelectField
              label="Branch"
              name="branchId"
              options={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
              defaultValue={selectedBranchId}
              placeholder="Search branches..."
              onValueChange={setSelectedBranchId}
            />
            <Field label="Profile photo" fieldName="profilePhotoFileName">
              <StaffFileField
                purpose="profilePhoto"
                staffPublicId={record?.publicId}
                initialFile={record?.documents?.profilePhoto ?? null}
                onPendingChange={(delta) => setPendingUploads((count) => count + delta)}
              />
            </Field>
            <Field label="Show as expert staff">
              <select name="showAsExpert" defaultValue={record?.showAsExpert ? "yes" : "no"} className={inputClass}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Current address" full><textarea name="address" rows={2} maxLength={1000} defaultValue={record?.address ?? ""} className={inputClass} /></Field>
            <Field label="Permanent address" full><textarea name="permanentAddress" rows={2} maxLength={1000} defaultValue={record?.permanentAddress ?? ""} className={inputClass} /></Field>
            <Field label="Qualifications" full><textarea name="qualification" rows={2} maxLength={2000} defaultValue={record?.qualification ?? ""} className={inputClass} /></Field>
            <Field label="Experience" full><textarea name="experience" rows={2} maxLength={2000} defaultValue={record?.experience ?? ""} className={inputClass} /></Field>
            <StaffSearchableSelectField
              label="Linked school account"
              name="linkedUserId"
              options={[
                { value: "", label: "No linked account" },
                ...accounts.map((account) => ({
                  value: account.id,
                  label: `${account.name} (${account.email})${account.membershipStatus === "active" ? "" : " — access disabled"}`,
                })),
              ]}
              defaultValue={record?.linkedUserId ?? ""}
              placeholder="Search school accounts..."
              full
            />
            <Field label="Employment type">
              <select name="employmentType" defaultValue={record?.employmentType ?? "full_time"} className={inputClass}>
                {employmentTypes.map((value) => <option key={value} value={value}>{titleCase(value.replaceAll("_", " "))}</option>)}
              </select>
            </Field>
        </div>

        <div hidden={activeTab !== "Payroll Details"} className="contents">
            <Field label="EPF number"><input name="epfNumber" maxLength={80} defaultValue={record?.epfNumber ?? ""} className={inputClass} /></Field>
            <Field label="Basic salary"><input name="basicSalary" type="number" min="0" step="0.01" defaultValue={record?.basicSalary ?? ""} className={inputClass} /></Field>
            <Field label="Contract type">
              <select name="contractType" defaultValue={record?.contractType ?? ""} className={inputClass}>
                <option value="">Select contract type</option>
                {staffContractTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            </Field>
            <Field label="Location"><input name="location" maxLength={255} defaultValue={record?.location ?? ""} className={inputClass} /></Field>
        </div>

        <div hidden={activeTab !== "Bank Details"} className="contents">
            <Field label="Account name"><input name="bankAccountName" maxLength={160} defaultValue={record?.bankAccountName ?? ""} className={inputClass} /></Field>
            <Field label="Account number"><input name="bankAccountNumber" maxLength={80} defaultValue={record?.bankAccountNumber ?? ""} className={inputClass} /></Field>
            <Field label="Bank name"><input name="bankName" maxLength={160} defaultValue={record?.bankName ?? ""} className={inputClass} /></Field>
            <Field label="Bank branch"><input name="bankBranch" maxLength={160} defaultValue={record?.bankBranch ?? ""} className={inputClass} /></Field>
        </div>

        <div hidden={activeTab !== "Social Links"} className="contents">
            <Field label="Facebook URL"><input name="facebookUrl" type="url" maxLength={2048} defaultValue={record?.facebookUrl ?? ""} className={inputClass} /></Field>
            <Field label="Twitter URL"><input name="twitterUrl" type="url" maxLength={2048} defaultValue={record?.twitterUrl ?? ""} className={inputClass} /></Field>
            <Field label="LinkedIn URL"><input name="linkedinUrl" type="url" maxLength={2048} defaultValue={record?.linkedinUrl ?? ""} className={inputClass} /></Field>
            <Field label="Instagram URL"><input name="instagramUrl" type="url" maxLength={2048} defaultValue={record?.instagramUrl ?? ""} className={inputClass} /></Field>
        </div>

        <div hidden={activeTab !== "Document Information"} className="contents">
            <Field label="Resume" fieldName="resumeFileName"><StaffFileField purpose="resume" staffPublicId={record?.publicId} initialFile={record?.documents?.resume ?? null} onPendingChange={(delta) => setPendingUploads((count) => count + delta)} /></Field>
            <Field label="Joining letter" fieldName="joiningLetterFileName"><StaffFileField purpose="joiningLetter" staffPublicId={record?.publicId} initialFile={record?.documents?.joiningLetter ?? null} onPendingChange={(delta) => setPendingUploads((count) => count + delta)} /></Field>
            <Field label="Other document" fieldName="otherDocumentFileName"><StaffFileField purpose="otherDocument" staffPublicId={record?.publicId} initialFile={record?.documents?.otherDocument ?? null} onPendingChange={(delta) => setPendingUploads((count) => count + delta)} /></Field>
        </div>

        <div hidden={activeTab !== "Custom Fields"} className="contents">
            {[0, 1].map((index) => (
              <div key={index} className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                <Field label={`Custom field ${index + 1} name`}>
                  <input name={`customFieldName${index + 1}`} maxLength={120} defaultValue={customField(index)?.label ?? ""} className={inputClass} />
                </Field>
                <Field label={`Custom field ${index + 1} value`}>
                  <input name={`customFieldValue${index + 1}`} maxLength={500} defaultValue={customField(index)?.value ?? ""} className={inputClass} />
                </Field>
              </div>
            ))}
        </div>
      </section>

      {!branches.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add an active branch before creating or saving a staff profile.
        </p>
      )}
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      <div className="admin-dialog-form-actions flex items-center justify-between border-t border-slate-100 pt-4">
        {state.success && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            {state.message ?? `Staff profile saved.${loginAccessEnabled ? " Assign the school role under User Roles before the staff member signs in." : ""}`}
          </p>
        )}
        {!state.success && <span />}
        <button
          type="submit"
          disabled={pending || pendingUploads > 0 || !branches.length}
          className="w-full rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Saving..." : pendingUploads ? "Uploading..." : record ? "Save changes" : "Add staff"}
        </button>
      </div>
    </form>
    </requiredStaffFieldsContext.Provider>
    </visibleStaffFieldsContext.Provider>
  );
}

function StaffFileField({
  purpose,
  staffPublicId,
  initialFile,
  onPendingChange,
}: {
  purpose: "profilePhoto" | "resume" | "joiningLetter" | "otherDocument";
  staffPublicId?: string;
  initialFile: StaffStoredFile | null;
  onPendingChange: (delta: number) => void;
}) {
  const [file, setFile] = useState(initialFile);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const label = purpose[0].toUpperCase() + purpose.slice(1);
  const slot = purpose;

  async function upload(selected: File | undefined) {
    if (!selected) return;
    setError("");
    setUploading(true);
    onPendingChange(1);
    try {
      const body = new FormData();
      body.set("purpose", purpose);
      body.set("file", selected);
      if (staffPublicId) body.set("staffPublicId", staffPublicId);
      const response = await fetch("/api/admin/staff/upload", { method: "POST", body });
      const result = await response.json() as { error?: string; fileName?: string; objectKey?: string };
      if (!response.ok || !result.fileName || !result.objectKey) {
        setError(result.error ?? "The file could not be uploaded.");
        return;
      }
      setFile({ fileName: result.fileName, objectKey: result.objectKey });
    } catch {
      setError("The file could not be uploaded. Check your connection and try again.");
    } finally {
      setUploading(false);
      onPendingChange(-1);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={`${purpose}FileName`} value={file?.fileName ?? ""} />
      <input type="hidden" name={`${purpose}ObjectKey`} value={file?.objectKey ?? ""} />
      <input
        type="file"
        accept={purpose === "profilePhoto" ? "image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png,image/webp"}
        onChange={(event) => void upload(event.currentTarget.files?.[0])}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-violet-700"
      />
      {file && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {staffPublicId ? (
            <a
              href={`/api/admin/staff/${staffPublicId}/files/${slot}`}
              target="_blank"
              rel="noreferrer"
              className="truncate font-medium text-violet-700 underline"
            >
              {file.fileName}
            </a>
          ) : (
            <span className="truncate text-slate-600">{file.fileName}</span>
          )}
          <button type="button" onClick={() => setFile(null)} className="shrink-0 text-rose-700 underline">
            Remove
          </button>
        </div>
      )}
      {uploading && <p className="text-xs text-slate-500">Uploading...</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {!file && purpose === "profilePhoto" && (
        <p className="text-xs text-slate-500">JPEG, PNG, or WebP; up to 4 MB.</p>
      )}
      {!file && purpose !== "profilePhoto" && (
        <p className="text-xs text-slate-500">PDF, JPEG, PNG, or WebP; up to 4 MB.</p>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Field({
  label,
  required = false,
  full = false,
  forceVisible = false,
  fieldName,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  forceVisible?: boolean;
  fieldName?: string;
  children: React.ReactNode;
}) {
  const requiredFields = useContext(requiredStaffFieldsContext);
  const visibleFields = useContext(visibleStaffFieldsContext);
  const childName = isValidElement<{ name?: string }>(children) ? children.props.name : undefined;
  const name = fieldName ?? childName ?? "";
  const requiredField = required || requiredFields.has(name);
  const control = isValidElement<{ name?: string; required?: boolean }>(children) && (fieldName || childName)
    ? cloneElement(children, { required: requiredField })
    : children;
  return (
    <label hidden={!forceVisible && !visibleFields.has(name)} className={`space-y-1.5 text-sm font-medium text-slate-700 ${full ? "sm:col-span-2" : ""}`}>
      <span>{label}{requiredField ? " *" : ""}</span>
      {control}
    </label>
  );
}

function StaffSearchableSelectField({
  label,
  name,
  options,
  defaultValue,
  placeholder,
  onValueChange,
  full = false,
}: {
  label: string;
  name: string;
  options: SearchableSelectOption[];
  defaultValue?: string;
  placeholder: string;
  onValueChange?: (value: string) => void;
  full?: boolean;
}) {
  const requiredFields = useContext(requiredStaffFieldsContext);
  const visibleFields = useContext(visibleStaffFieldsContext);
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <SearchableSelect
        label={label}
        name={name}
        options={options}
        required={requiredFields.has(name)}
        defaultValue={defaultValue}
        placeholder={placeholder}
        hidden={!visibleFields.has(name)}
        onValueChange={onValueChange}
      />
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

function branchCatalogOptions(
  options: { id: number; name: string; branchId: number | null }[],
  selectedBranchId: string,
  current?: string | null,
) {
  const applicable = options.filter((option) =>
    option.branchId === null || option.branchId.toString() === selectedBranchId,
  );
  if (current && !applicable.some((option) => option.name === current)) {
    applicable.push({ id: -1, name: current, branchId: null });
  }
  return applicable;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
