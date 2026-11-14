"use client";

import { useActionState, type ReactNode } from "react";
import { RequiredMark } from "@/components/required-mark";
import {
  assignStudentFeeDiscount,
  createFeeDiscount,
  createFeeGroup,
  createFeeStructure,
  createFeeType,
  generateStudentFeeInvoices,
  recordFeePayment,
  type FeeActionState,
} from "./actions";

export type FeeOption = { id: number; label: string };
type ValueOption = { value: string; label: string };

function ActionForm({
  action,
  title,
  children,
  submitLabel,
}: {
  action: (state: FeeActionState, formData: FormData) => Promise<FeeActionState>;
  title: string;
  children: ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      {state.success && !state.message && <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {pending ? "Saving..." : submitLabel}
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
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  placeholder?: string;
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
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: FeeOption[];
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} <RequiredMark />
      <select
        name={name}
        required
        defaultValue={defaultValue ?? ""}
        disabled={!options.length}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white disabled:opacity-60"
      >
        <option value="" disabled>{options.length ? "Choose one" : "Create one first"}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ValueSelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: ValueOption[];
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label} <RequiredMark />
      <select
        name={name}
        required
        defaultValue=""
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
      >
        <option value="" disabled>Choose one</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function FeeGroupForm() {
  return (
    <ActionForm action={createFeeGroup} title="Add fee group" submitLabel="Add group">
      <Field label="Group name" name="name" placeholder="Tuition" />
      <Field label="Description" name="description" required={false} placeholder="Optional notes" />
    </ActionForm>
  );
}

export function FeeTypeForm({ groups }: { groups: FeeOption[] }) {
  return (
    <ActionForm action={createFeeType} title="Add fee type" submitLabel="Add type">
      <SelectField label="Fee group" name="feeGroupId" options={groups} />
      <Field label="Fee type" name="name" placeholder="Term 1" />
      <Field label="Description" name="description" required={false} placeholder="Optional notes" />
    </ActionForm>
  );
}

export function FeeDiscountForm() {
  return (
    <ActionForm action={createFeeDiscount} title="Create discount" submitLabel="Add discount">
      <Field label="Discount name" name="name" placeholder="Sibling discount" />
      <Field label="Discount code" name="code" placeholder="SIBLING" />
      <Field label="Description" name="description" required={false} />
      <ValueSelectField label="Discount method" name="discountType" options={[
        { value: "fixed", label: "Fixed amount" },
        { value: "percentage", label: "Percentage" },
      ]} />
      <Field label="Value (amount or percent)" name="value" type="number" />
      <ValueSelectField label="Frequency" name="frequency" options={[
        { value: "one_time", label: "One time" },
        { value: "yearly", label: "Yearly" },
      ]} />
    </ActionForm>
  );
}

export function StudentFeeDiscountForm({
  students,
  discounts,
  feeTypes,
}: {
  students: FeeOption[];
  discounts: FeeOption[];
  feeTypes: FeeOption[];
}) {
  return (
    <ActionForm action={assignStudentFeeDiscount} title="Assign a student discount" submitLabel="Assign discount">
      <SelectField label="Student" name="studentId" options={students} />
      <SelectField label="Fee type" name="feeTypeId" options={feeTypes} />
      <SelectField label="Discount" name="discountId" options={discounts} />
      <Field label="Note" name="note" required={false} placeholder="Optional reason or approval reference" />
    </ActionForm>
  );
}

export function FeeStructureForm({
  branches,
  years,
  classes,
  groups,
  types,
}: {
  branches: FeeOption[];
  years: FeeOption[];
  classes: FeeOption[];
  groups: FeeOption[];
  types: FeeOption[];
}) {
  return (
    <ActionForm action={createFeeStructure} title="Set up fee structure" submitLabel="Save structure">
      <SelectField label="Branch" name="branchId" options={branches} />
      <SelectField label="Academic year" name="academicYearId" options={years} />
      <SelectField label="Class" name="classLevelId" options={classes} />
      <SelectField label="Fee group" name="feeGroupId" options={groups} />
      <SelectField label="Fee type" name="feeTypeId" options={types} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" name="amount" type="number" />
        <Field label="Due date" name="dueDate" type="date" />
      </div>
      <ValueSelectField label="Late fine" name="fineType" options={[
        { value: "none", label: "No fine" },
        { value: "fixed", label: "Fixed amount" },
        { value: "percentage", label: "Percentage of fee" },
      ]} />
      <Field label="Fine value (0 for none)" name="fineValue" type="number" defaultValue="0" />
    </ActionForm>
  );
}

export function GenerateInvoicesForm({ structures }: { structures: FeeOption[] }) {
  return (
    <ActionForm action={generateStudentFeeInvoices} title="Generate student invoices" submitLabel="Generate invoices">
      <SelectField label="Fee structure" name="feeStructureId" options={structures} />
      <p className="text-xs leading-5 text-slate-500">
        Creates one invoice for each admitted or active student enrolled in the matching class and academic year. Existing invoices are left unchanged.
      </p>
    </ActionForm>
  );
}

export function RecordFeePaymentForm({
  invoiceId,
  maxAmount,
  currency,
}: {
  invoiceId: number;
  maxAmount: string;
  currency: string;
}) {
  return (
    <ActionForm action={recordFeePayment} title="Record payment" submitLabel="Record payment">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field label={`Amount (${currency})`} name="amount" type="number" placeholder={maxAmount} />
      <ValueSelectField label="Payment method" name="paymentMethod" options={[
        { value: "cash", label: "Cash" },
        { value: "bank_transfer", label: "Bank transfer" },
        { value: "card", label: "Card" },
        { value: "mobile_money", label: "Mobile money" },
        { value: "cheque", label: "Cheque" },
        { value: "other", label: "Other" },
      ]} />
      <Field label="Reference" name="reference" required={false} placeholder="Receipt or transaction reference" />
      <Field label="Notes" name="notes" required={false} />
      <p className="text-xs text-slate-500">Outstanding balance: {currency} {maxAmount}</p>
    </ActionForm>
  );
}
