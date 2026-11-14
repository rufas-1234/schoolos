"use client";

import { useActionState } from "react";
import { RequiredMark } from "@/components/required-mark";
import {
  assignStaffLeaveBalance,
  createStaffLeaveRequest,
  createStaffLeaveType,
  markStaffPayrollPaid,
  recordStaffAttendance,
  recordStaffPayroll,
  reviewStaffLeaveRequest,
  type HrActionState,
} from "./actions";

type Option = { value: string; label: string };

export function AttendanceForm({
  staffId,
  branchId,
  attendanceDate,
  status,
  note,
}: {
  staffId: number;
  branchId: number;
  attendanceDate: string;
  status?: string;
  note?: string | null;
}) {
  const [state, action, pending] = useActionState(recordStaffAttendance, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="attendanceDate" value={attendanceDate} />
      <select
        name="status"
        aria-label="Attendance status"
        defaultValue={status ?? "present"}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700"
      >
        <option value="present">Present</option>
        <option value="absent">Absent</option>
        <option value="late">Late</option>
        <option value="excused">Excused</option>
      </select>
      <input
        name="note"
        defaultValue={note ?? ""}
        maxLength={500}
        aria-label="Attendance note"
        placeholder="Note (optional)"
        className="w-36 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <span role="alert" className="basis-full text-xs text-rose-600">{state.error}</span>}
      {state.success && <span role="status" className="basis-full text-xs text-emerald-700">Saved</span>}
    </form>
  );
}

export function LeaveTypeForm({
  branches,
  branchId,
}: {
  branches: { id: number; name: string; code: string }[];
  branchId: number;
}) {
  const [state, action, pending] = useActionState(createStaffLeaveType, {});
  return (
    <HrForm title="Add leave type" action={action} pending={pending} submitLabel="Add leave type" state={state}>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Branch
        <select name="branchId" required defaultValue={branchId.toString()} className={inputClass}>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </label>
      <Field label="Leave type name" name="name" placeholder="Annual leave" />
    </HrForm>
  );
}

export function LeaveBalanceForm({
  branchId,
  branchName,
  staffOptions,
  leaveTypeOptions,
  leaveYear,
}: {
  branchId: number;
  branchName: string;
  staffOptions: Option[];
  leaveTypeOptions: Option[];
  leaveYear: number;
}) {
  const [state, action, pending] = useActionState(assignStaffLeaveBalance, {});
  return (
    <HrForm title="Assign leave entitlement" action={action} pending={pending} submitLabel="Save entitlement" state={state}>
      <input type="hidden" name="branchId" value={branchId} />
      <p className="text-xs text-slate-500">Branch: {branchName}</p>
      <SelectField label="Staff member" name="staffId" options={staffOptions} />
      <SelectField label="Leave type" name="leaveTypeId" options={leaveTypeOptions} />
      <Field label="Leave year" name="leaveYear" type="number" min="2000" max="9999" defaultValue={String(leaveYear)} />
      <Field label="Entitlement (calendar days)" name="entitlementDays" type="number" step="0.25" min="0" max="366" />
    </HrForm>
  );
}

export function LeaveRequestForm({
  branchId,
  branchName,
  staffOptions,
  leaveTypeOptions,
}: {
  branchId: number;
  branchName: string;
  staffOptions: Option[];
  leaveTypeOptions: Option[];
}) {
  const [state, action, pending] = useActionState(createStaffLeaveRequest, {});
  return (
    <HrForm title="Create leave request" action={action} pending={pending} submitLabel="Submit request" state={state}>
      <input type="hidden" name="branchId" value={branchId} />
      <p className="text-xs text-slate-500">Branch: {branchName}</p>
      <SelectField label="Staff member" name="staffId" options={staffOptions} />
      <SelectField label="Leave type" name="leaveTypeId" options={leaveTypeOptions} />
      <Field label="Start date" name="startDate" type="date" />
      <Field label="End date" name="endDate" type="date" />
      <Field label="Reason" name="reason" maxLength={1000} />
      <p className="text-xs leading-5 text-slate-500">
        Leave is counted in calendar days. Weekends and holidays are included.
      </p>
    </HrForm>
  );
}

export function LeaveReviewForm({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(reviewStaffLeaveRequest, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input
        name="reviewNote"
        maxLength={500}
        placeholder="Review note (optional)"
        aria-label="Review note"
        className="w-44 rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
      />
      <button
        name="decision"
        value="approved"
        disabled={pending}
        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        name="decision"
        value="rejected"
        disabled={pending}
        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        Reject
      </button>
      {state.error && <span role="alert" className="basis-full text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

export function PayrollForm({
  branchId,
  branchName,
  staffOptions,
  currency,
  payPeriod,
}: {
  branchId: number;
  branchName: string;
  staffOptions: Option[];
  currency: string;
  payPeriod: string;
}) {
  const [state, action, pending] = useActionState(recordStaffPayroll, {});
  return (
    <HrForm title="Record payroll payment" action={action} pending={pending} submitLabel="Save payroll record" state={state}>
      <input type="hidden" name="branchId" value={branchId} />
      <p className="text-xs text-slate-500">Branch: {branchName}</p>
      <SelectField label="Staff member" name="staffId" options={staffOptions} />
      <Field label="Pay period" name="payPeriod" type="month" defaultValue={payPeriod} />
      <Field label={`Base salary (${currency})`} name="baseSalary" type="number" min="0.01" step="0.01" />
      <Field label={`Allowances (${currency})`} name="allowances" type="number" min="0" step="0.01" defaultValue="0" />
      <Field label={`Deductions (${currency})`} name="deductions" type="number" min="0" step="0.01" defaultValue="0" />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Payment status <RequiredMark />
        <select name="status" required defaultValue="recorded" className={inputClass}>
          <option value="recorded">Recorded, not paid</option>
          <option value="paid">Paid</option>
        </select>
      </label>
      <Field label="Paid date (required if marked paid)" name="paidDate" type="date" required={false} />
      <Field label="Notes (optional)" name="notes" maxLength={1000} required={false} />
      <p className="text-xs leading-5 text-slate-500">
        Gross pay is base salary plus allowances. Net pay is gross pay minus deductions; enter any applicable statutory deductions manually.
      </p>
    </HrForm>
  );
}

export function MarkPayrollPaidForm({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(markStaffPayrollPaid, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="date" name="paidDate" required aria-label="Payment date" className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {state.error && <span role="alert" className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

function HrForm({
  title,
  action,
  pending,
  submitLabel,
  state,
  children,
}: {
  title: string;
  action: (formData: FormData) => void;
  pending: boolean;
  submitLabel: string;
  state: HrActionState;
  children: React.ReactNode;
}) {
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500"><RequiredMark /> Required fields</p>
      </div>
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  min,
  max,
  step,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  maxLength?: number;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} {required && <RequiredMark />}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        className={inputClass}
      />
    </label>
  );
}

function SelectField({ label, name, options }: { label: string; name: string; options: Option[] }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} <RequiredMark />
      <select name={name} required defaultValue="" className={inputClass}>
        <option value="" disabled>Select…</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white";
