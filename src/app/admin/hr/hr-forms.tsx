"use client";

import { useActionState, useState } from "react";
import { RequiredMark } from "@/components/required-mark";
import { SearchableSelect } from "@/components/searchable-select";
import { printElementById } from "@/components/print-button";
import { AdminDeleteButton } from "@/components/admin-data-table";
import {
  assignStaffLeaveBalance,
  createStaffLeaveRequest,
  createStaffLeaveType,
  deleteStaffPayrollRecord,
  recordStaffAttendanceBulk,
  recordStaffAttendance,
  recordStaffPayroll,
  reviewStaffLeaveRequest,
  updateStaffPayroll,
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

export function BulkAttendanceForm({
  branchId,
  attendanceDate,
}: {
  branchId: number;
  attendanceDate: string;
}) {
  const [state, action, pending] = useActionState(recordStaffAttendanceBulk, {});
  return (
    <form id="staff-attendance-bulk-form" action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="attendanceDate" value={attendanceDate} />
      <label className="space-y-1.5 text-sm font-medium text-slate-700">
        Mark selected as
        <select name="status" defaultValue="present" className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
          <option value="excused">Excused</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Apply to selected"}
      </button>
      {state.error && <span role="alert" className="basis-full text-xs text-rose-600">{state.error}</span>}
      {state.success && <span role="status" className="basis-full text-xs text-emerald-700">Selected staff attendance saved.</span>}
    </form>
  );
}

export function StaffAttendanceSelectAll() {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const nextSelected = !selected;
        document.querySelectorAll<HTMLInputElement>(
          'input[name="staffIds"][form="staff-attendance-bulk-form"]',
        ).forEach((checkbox) => {
          checkbox.checked = nextSelected;
        });
        setSelected(nextSelected);
      }}
      className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {selected ? "Clear staff selection" : "Select all staff"}
    </button>
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
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
        required
        defaultValue={branchId.toString()}
        placeholder="Search branches..."
        disabled={!branches.length}
      />
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
  currencies,
  defaultCurrency,
  payPeriod,
  record,
}: {
  branchId: number;
  branchName: string;
  staffOptions: Option[];
  currencies: Option[];
  defaultCurrency: string;
  payPeriod: string;
  record?: {
    publicId: string;
    staffId: number;
    currency: string;
    baseSalary: string;
    allowances: string;
    deductions: string;
    payPeriod: string;
    notes: string | null;
  };
}) {
  const actionToRun = record ? updateStaffPayroll : recordStaffPayroll;
  const [state, action, pending] = useActionState(actionToRun, {});
  return (
    <HrForm
      title={record ? "Edit payroll record" : "Prepare payroll record"}
      action={action}
      pending={pending}
      submitLabel={record ? "Save payroll changes" : "Save payroll record"}
      state={state}
    >
      <input type="hidden" name="branchId" value={branchId} />
      {record && <input type="hidden" name="publicId" value={record.publicId} />}
      <p className="text-xs text-slate-500">Branch: {branchName}</p>
      <SearchableSelect
        label="Staff member"
        name="staffId"
        options={staffOptions}
        required
        defaultValue={record?.staffId.toString() ?? ""}
        placeholder={staffOptions.length ? "Search staff member..." : "No active staff"}
        disabled={!staffOptions.length}
      />
      <SearchableSelect
        label="Currency"
        name="currency"
        options={currencies}
        required
        defaultValue={record?.currency ?? defaultCurrency}
        placeholder={currencies.length ? "Search currencies..." : "Configure a currency first"}
        disabled={!currencies.length}
      />
      <Field label="Pay period" name="payPeriod" type="month" defaultValue={record?.payPeriod ?? payPeriod} />
      <Field label="Base salary (selected currency)" name="baseSalary" type="number" min="0.01" step="0.01" defaultValue={record?.baseSalary} />
      <Field label="Allowances (selected currency)" name="allowances" type="number" min="0" step="0.01" defaultValue={record?.allowances ?? "0"} />
      <Field label="Deductions (selected currency)" name="deductions" type="number" min="0" step="0.01" defaultValue={record?.deductions ?? "0"} />
      <Field label="Notes (optional)" name="notes" maxLength={1000} defaultValue={record?.notes ?? ""} required={false} />
      <p className="text-xs leading-5 text-slate-500">
        Gross pay = salary + allowances. Net pay = gross minus deductions; Finance records staff payments in Accounts.
      </p>
    </HrForm>
  );
}

export function DeletePayrollForm({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState(deleteStaffPayrollRecord, {});
  return (
    <form
      action={action}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="publicId" value={publicId} />
      <AdminDeleteButton
        label="Delete payroll record"
        disabled={pending}
        showLabel
        buttonText={pending ? "Deleting..." : "Delete"}
      />
      {state.error && <span role="alert" className="max-w-40 text-xs text-rose-600">{state.error}</span>}
      {state.success && <span role="status" className="text-xs text-emerald-700">Deleted</span>}
    </form>
  );
}

export function PayrollRecordPrintButton({
  publicId,
  schoolName,
  staffName,
  employeeCode,
  baseSalary,
  allowances,
  deductions,
  netPay,
  payPeriod,
  paidDate,
  status,
  notes,
}: {
  publicId: string;
  schoolName: string;
  staffName: string;
  employeeCode: string | null;
  baseSalary: string;
  allowances: string;
  deductions: string;
  netPay: string;
  payPeriod: string;
  paidDate: string | null;
  status: string;
  notes: string | null;
}) {
  const targetId = `payroll-record-print-${publicId}`;
  return (
    <>
      <button
        type="button"
        onClick={() => printElementById(targetId, "Payroll statement")}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Print
      </button>
      <article id={targetId} className="payroll-record-print">
        <p className="payroll-record-print-kicker">Payroll statement</p>
        <h1>{schoolName}</h1>
        <p className="payroll-record-print-period">Pay period: {payPeriod}</p>
        <dl>
          <div><dt>Staff member</dt><dd>{staffName}</dd></div>
          <div><dt>Staff number</dt><dd>{employeeCode || "—"}</dd></div>
          <div><dt>Status</dt><dd>{status === "paid" ? "Paid" : "Recorded, not paid"}</dd></div>
          <div><dt>Paid date</dt><dd>{paidDate || "—"}</dd></div>
        </dl>
        <table>
          <tbody>
            <tr><th>Base salary</th><td>{baseSalary}</td></tr>
            <tr><th>Allowances</th><td>{allowances}</td></tr>
            <tr><th>Deductions</th><td>{deductions}</td></tr>
            <tr><th>Net pay</th><td>{netPay}</td></tr>
          </tbody>
        </table>
        {notes && <p className="payroll-record-print-notes">Notes: {notes}</p>}
        <footer><span>Prepared by: ____________________</span><span>Received by: ____________________</span></footer>
      </article>
    </>
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
    <SearchableSelect
      label={label}
      name={name}
      options={options}
      required
      placeholder={options.length ? `Search ${label.toLocaleLowerCase()}...` : "Create one first"}
      disabled={!options.length}
    />
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white";
