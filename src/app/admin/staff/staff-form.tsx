"use client";

import { useActionState } from "react";
import { RequiredMark } from "@/components/required-mark";
import { createStaffMember, updateStaffMember } from "./actions";

type StaffEditRecord = {
  publicId: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  jobTitle: string;
  department: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  linkedUserId: string | null;
  employmentType: string;
  startDate: string | null;
};

type StaffAccountOption = { id: string; name: string; email: string };

export function StaffForm({
  record,
  accounts = [],
  departmentOptions = [],
  designationOptions = [],
}: {
  record?: StaffEditRecord;
  accounts?: StaffAccountOption[];
  departmentOptions?: string[];
  designationOptions?: string[];
} = {}) {
  const [state, formAction, pending] = useActionState(
    record ? updateStaffMember : createStaffMember,
    {},
  );

  return (
    <form action={formAction} className="min-w-72 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-slate-500">
        <RequiredMark /> Required fields
      </p>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {record ? "Edit staff member" : "Add staff member"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {record
            ? "Update this staff member's directory details."
            : "Add teaching and non-teaching employees to this school directory."}
        </p>
      </div>

      {record && <input type="hidden" name="publicId" value={record.publicId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" required defaultValue={record?.firstName} />
        <Field label="Last name" name="lastName" required defaultValue={record?.lastName} />
        <Field label="Employee code" name="employeeCode" defaultValue={record?.employeeCode ?? ""} />
        <CatalogField
          label="Job title"
          name="jobTitle"
          options={designationOptions}
          required
          placeholder="e.g. Mathematics teacher"
          defaultValue={record?.jobTitle}
        />
        <CatalogField
          label="Department"
          name="department"
          options={departmentOptions}
          required
          placeholder="e.g. Academics"
          defaultValue={record?.department}
        />
        <Field label="Email address" name="email" type="email" defaultValue={record?.email ?? ""} />
        <Field label="Phone number" name="phone" type="tel" defaultValue={record?.phone ?? ""} />
        <Field label="Date of birth (optional)" name="dateOfBirth" type="date" defaultValue={record?.dateOfBirth ?? ""} />
        <Field label="Address (optional)" name="address" defaultValue={record?.address ?? ""} />
        <Field label="Emergency contact name (optional)" name="emergencyContactName" defaultValue={record?.emergencyContactName ?? ""} />
        <Field label="Emergency contact phone (optional)" name="emergencyContactPhone" type="tel" defaultValue={record?.emergencyContactPhone ?? ""} />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Link existing school account (optional)
          <select
            name="linkedUserId"
            defaultValue={record?.linkedUserId ?? ""}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
          >
            <option value="">No account linked</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.email}
              </option>
            ))}
          </select>
          <span className="block text-xs font-normal text-slate-500">
            Linking does not create an account or grant roles or permissions.
          </span>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Employment type <RequiredMark />
          <select
            name="employmentType"
            required
            defaultValue={record?.employmentType ?? "full_time"}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
          >
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
          </select>
        </label>
        <Field label="Start date" name="startDate" type="date" defaultValue={record?.startDate ?? ""} />
      </div>

      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && (
        <p role="status" className="text-sm text-emerald-700">
          {record ? "Staff member updated." : "Staff member added."}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400"
      >
        {pending ? "Saving..." : record ? "Save changes" : "Add staff member"}
      </button>
    </form>
  );
}

function CatalogField({
  label,
  name,
  options,
  required = false,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  const listId = `staff-${name}-options`;
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <input
        name={name}
        required={required}
        list={listId}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
      />
      <datalist id={listId}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </label>
  );
}

function Field({
  label,
  name,
  required = false,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
      />
    </label>
  );
}
