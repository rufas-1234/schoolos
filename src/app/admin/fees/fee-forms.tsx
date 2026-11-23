"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/searchable-select";
import { RequiredMark } from "@/components/required-mark";
import { AdminConfirmSubmitButton, AdminDeleteButton } from "@/components/admin-data-table";
import {
  assignStudentFeeDiscount,
  applyFeeAdvanceCredit,
  deleteFeeDiscount,
  deleteFeeGroup,
  deleteFeeStructure,
  deleteFeeType,
  deleteStudentFeeDiscount,
  createFeeDiscount,
  createFeeGroup,
  createFeeStructure,
  createFeeType,
  generateStudentFeeInvoices,
  recordFeePayment,
  recordBulkFeePayments,
  recordFeeAdvanceCredit,
  reverseFeePayment,
  updateFeeInvoice,
  type FeeActionState,
} from "./actions";

export type FeeOption = { id: number; label: string };
type ValueOption = { value: string; label: string };
export type CurrencyOption = ValueOption;
type FeeDeleteAction = (
  state: FeeActionState,
  formData: FormData,
) => Promise<FeeActionState>;

function ActionForm({
  action,
  title,
  children,
  submitLabel,
  recordId,
}: {
  action: (state: FeeActionState, formData: FormData) => Promise<FeeActionState>;
  title: string;
  children: ReactNode;
  submitLabel: string;
  recordId?: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {recordId !== undefined && <input type="hidden" name="recordId" value={recordId} />}
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      {state.receiptUrl && (
        <Link href={state.receiptUrl} className="inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
          Print receipt
        </Link>
      )}
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
  defaultValue?: string | number;
}) {
  return (
    <SearchableSelect
      label={label}
      name={name}
      options={options.map((option) => ({ value: String(option.id), label: option.label }))}
      defaultValue={defaultValue === undefined ? "" : String(defaultValue)}
      placeholder={options.length ? "Search or choose..." : "Create one first"}
      required
    />
  );
}

function ValueSelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: ValueOption[];
  defaultValue?: string;
}) {
  return <SearchableSelect label={label} name={name} options={options} defaultValue={defaultValue} placeholder="Search or choose..." required />;
}

export function DeleteFeeRecordForm({
  recordId,
  recordType,
}: {
  recordId: number;
  recordType: "group" | "type" | "discount" | "student-discount" | "structure";
}) {
  const action: FeeDeleteAction = {
    group: deleteFeeGroup,
    type: deleteFeeType,
    discount: deleteFeeDiscount,
    "student-discount": deleteStudentFeeDiscount,
    structure: deleteFeeStructure,
  }[recordType];
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="recordId" value={recordId} />
      <AdminDeleteButton label="Delete fee record" />
      {pending && <span className="text-xs text-slate-500">Deleting...</span>}
      {state.error && <p role="alert" className="text-xs text-rose-600">{state.error}</p>}
      {state.message && <p role="status" className="text-xs text-emerald-700">{state.message}</p>}
    </form>
  );
}

export function FeeGroupForm({
  record,
}: {
  record?: { id: number; name: string; description: string | null };
}) {
  return (
    <ActionForm
      action={createFeeGroup}
      title={record ? "Edit fee group" : "Add fee group"}
      submitLabel={record ? "Save group" : "Add group"}
      recordId={record?.id}
    >
      <Field label="Group name" name="name" placeholder="Tuition" defaultValue={record?.name} />
      <Field label="Description" name="description" required={false} placeholder="Optional notes" defaultValue={record?.description} />
    </ActionForm>
  );
}

export function FeeTypeForm({
  groups,
  record,
}: {
  groups: FeeOption[];
  record?: { id: number; name: string; description: string | null; feeGroupId: number };
}) {
  return (
    <ActionForm
      action={createFeeType}
      title={record ? "Edit fee type" : "Add fee type"}
      submitLabel={record ? "Save type" : "Add type"}
      recordId={record?.id}
    >
      <SelectField label="Fee group" name="feeGroupId" options={groups} defaultValue={record?.feeGroupId} />
      <Field label="Fee type" name="name" placeholder="Term 1" defaultValue={record?.name} />
      <Field label="Description" name="description" required={false} placeholder="Optional notes" defaultValue={record?.description} />
    </ActionForm>
  );
}

export function FeeDiscountForm({
  currencies,
  defaultCurrency,
  record,
}: {
  currencies: CurrencyOption[];
  defaultCurrency: string;
  record?: {
    id: number;
    name: string;
    code: string;
    description: string | null;
    discountType: string;
    value: string;
    currency: string;
    frequency: string;
  };
}) {
  return (
    <ActionForm
      action={createFeeDiscount}
      title={record ? "Edit discount" : "Create discount"}
      submitLabel={record ? "Save discount" : "Add discount"}
      recordId={record?.id}
    >
      <Field label="Discount name" name="name" placeholder="Sibling discount" defaultValue={record?.name} />
      <Field label="Discount code" name="code" placeholder="SIBLING" defaultValue={record?.code} />
      <Field label="Description" name="description" required={false} defaultValue={record?.description} />
      <ValueSelectField label="Discount method" name="discountType" options={[
        { value: "fixed", label: "Fixed amount" },
        { value: "percentage", label: "Percentage" },
      ]} defaultValue={record?.discountType} />
      <Field label="Value (amount or percent)" name="value" type="number" defaultValue={record?.value} />
      <ValueSelectField label="Currency for fixed discounts" name="currency" options={currencies}
        defaultValue={record?.currency ?? defaultCurrency} />
      <ValueSelectField label="Frequency" name="frequency" options={[
        { value: "one_time", label: "One time" },
        { value: "yearly", label: "Yearly" },
      ]} defaultValue={record?.frequency} />
    </ActionForm>
  );
}

export function StudentFeeDiscountForm({
  students,
  discounts,
  feeTypes,
  record,
}: {
  students: FeeOption[];
  discounts: FeeOption[];
  feeTypes: FeeOption[];
  record?: {
    studentId: number;
    feeTypeId: number;
    discountId: number;
    note: string | null;
  };
}) {
  return (
  <ActionForm
    action={assignStudentFeeDiscount}
    title={record ? "Edit student discount or scholarship" : "Assign a student discount or scholarship"}
    submitLabel={record ? "Save assignment" : "Assign discount"}
  >
      <SelectField label="Student" name="studentId" options={students} defaultValue={record?.studentId} />
      <SelectField label="Fee type" name="feeTypeId" options={feeTypes} defaultValue={record?.feeTypeId} />
      <SelectField label="Discount" name="discountId" options={discounts} defaultValue={record?.discountId} />
      <Field label="Note" name="note" required={false} placeholder="Optional reason or approval reference" defaultValue={record?.note} />
    </ActionForm>
  );
}

export function FeeStructureForm({
  branches,
  years,
  terms,
  students,
  classes,
  groups,
  types,
  currencies,
  defaultCurrency,
  record,
}: {
  branches: FeeOption[];
  years: FeeOption[];
  terms: FeeOption[];
  students: FeeOption[];
  classes: FeeOption[];
  groups: FeeOption[];
  types: FeeOption[];
  currencies: CurrencyOption[];
  defaultCurrency: string;
  record?: {
    id: number;
    branchId: number;
    academicYearId: number;
    academicTermId: number | null;
    studentId: number | null;
    classLevelId: number;
    feeGroupId: number;
    feeTypeId: number;
    amount: string;
    currency: string;
    dueDate: string;
    fineType: string;
    fineValue: string;
  };
}) {
  return (
    <ActionForm
      action={createFeeStructure}
      title={record ? "Edit fee structure" : "Set up fee structure"}
      submitLabel={record ? "Save structure" : "Save structure"}
      recordId={record?.id}
    >
      <SelectField label="Branch" name="branchId" options={branches} defaultValue={record?.branchId} />
      <SelectField label="Academic year" name="academicYearId" options={years} defaultValue={record?.academicYearId} />
      <SearchableSelect
        label="Academic term (optional)"
        name="academicTermId"
        options={[
          { value: "", label: "Entire academic year" },
          ...terms.map((term) => ({ value: String(term.id), label: term.label })),
        ]}
        defaultValue={record?.academicTermId ? String(record.academicTermId) : ""}
        placeholder="Search a term or use the full academic year..."
        required={false}
      />
      <SearchableSelect
        label="Student-specific charge (optional)"
        name="studentId"
        options={[
          { value: "", label: "Apply to the whole class" },
          ...students.map((student) => ({ value: String(student.id), label: student.label })),
        ]}
        placeholder="Search a student or leave blank for the whole class..."
        defaultValue={record?.studentId ? String(record.studentId) : ""}
        required={false}
      />
      <SelectField label="Class" name="classLevelId" options={classes} defaultValue={record?.classLevelId} />
      <SelectField label="Fee group" name="feeGroupId" options={groups} defaultValue={record?.feeGroupId} />
      <SelectField label="Fee type" name="feeTypeId" options={types} defaultValue={record?.feeTypeId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <ValueSelectField label="Currency" name="currency" options={currencies}
            defaultValue={record?.currency ?? defaultCurrency} />
          <Field label="Amount" name="amount" type="number" defaultValue={record?.amount} />
        </div>
        <Field label="Due date" name="dueDate" type="date" defaultValue={record?.dueDate} />
      </div>
      <ValueSelectField label="Late fine" name="fineType" options={[
        { value: "none", label: "No fine" },
        { value: "fixed", label: "Fixed amount" },
        { value: "percentage", label: "Percentage of fee" },
      ]} defaultValue={record?.fineType} />
      <Field label="Fine value (0 for none)" name="fineValue" type="number" defaultValue={record?.fineValue ?? "0"} />
    </ActionForm>
  );
}

export function GenerateInvoicesForm({
  structures,
  students,
}: {
  structures: FeeOption[];
  students: FeeOption[];
}) {
  return (
    <ActionForm action={generateStudentFeeInvoices} title="Generate student invoices" submitLabel="Generate invoices">
      <SelectField label="Fee structure" name="feeStructureId" options={structures} />
      <SearchableSelect
        label="Student (optional)"
        name="studentId"
        options={students.map((student) => ({ value: String(student.id), label: student.label }))}
        placeholder="Search a student or leave blank for the whole class..."
      />
      <p className="text-xs leading-5 text-slate-500">
        Select one student or leave blank for all eligible students in this class and year. Existing invoices stay unchanged.
      </p>
    </ActionForm>
  );
}

export function RecordFeePaymentForm({
  invoiceId,
  maxAmount,
  currency,
  idempotencyKey,
  invoices,
}: {
  invoiceId?: number;
  maxAmount?: string;
  currency: string;
  idempotencyKey: string;
  invoices?: FeeOption[];
}) {
  return (
    <ActionForm
      action={recordFeePayment}
      title={invoices ? "Quick add payment" : "Record payment"}
      submitLabel={invoices ? "Add payment" : "Record payment"}
    >
      {invoices ? (
        <SelectField label="Invoice" name="invoiceId" options={invoices} />
      ) : (
        <input type="hidden" name="invoiceId" value={invoiceId} />
      )}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Field label={`Amount (${currency})`} name="amount" type="number" placeholder={maxAmount ?? "Enter payment amount"} />
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
      {maxAmount && <p className="text-xs text-slate-500">Outstanding balance: {currency} {maxAmount}</p>}
    </ActionForm>
  );
}

export function RecordFeeAdvanceCreditForm({
  students,
  currencies,
  defaultCurrency,
  idempotencyKey,
}: {
  students: FeeOption[];
  currencies: CurrencyOption[];
  defaultCurrency: string;
  idempotencyKey: string;
}) {
  return (
    <ActionForm action={recordFeeAdvanceCredit} title="Record advance fee payment" submitLabel="Record advance payment">
      <p className="text-sm text-slate-600">
        Record an advance payment for future fees; the credit stays on the account until applied.
      </p>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <SelectField label="Student" name="studentId" options={students} />
      <ValueSelectField label="Currency" name="currency" options={currencies} defaultValue={defaultCurrency} />
      <Field label="Amount" name="amount" type="number" placeholder="Enter amount received" />
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
    </ActionForm>
  );
}

export function ApplyFeeAdvanceCreditForm({
  studentId,
  invoices,
  idempotencyKey,
}: {
  studentId: number;
  invoices: FeeOption[];
  idempotencyKey: string;
}) {
  return (
    <ActionForm action={applyFeeAdvanceCredit} title="Apply carry-forward credit" submitLabel="Apply credit to invoice">
      <p className="text-sm text-slate-600">
        The system applies up to the invoice&apos;s remaining balance. Any unused credit stays available for later fees.
      </p>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <SelectField label="Outstanding invoice" name="invoiceId" options={invoices} />
      <p className="text-xs text-slate-500">The advance is applied as an internal credit; no new payment is collected.</p>
    </ActionForm>
  );
}

export function BulkFeePaymentForm({
  search,
  status,
  overdue,
  branchId,
  classLevelId,
  sectionId,
  invoiceCount,
  outstandingMinor,
  currency,
}: {
  search: string;
  status: string;
  overdue: string;
  branchId: string;
  classLevelId: string;
  sectionId: string;
  invoiceCount: number;
  outstandingMinor: number;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(recordBulkFeePayments, {});
  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-semibold text-slate-900">Bulk payment</h2>
        <p className="mt-1 text-sm text-slate-600">
          Collect each unpaid or partial invoice&apos;s full remaining balance from the current filters.
          {` ${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"} · ${currency} ${(outstandingMinor / 100).toFixed(2)} outstanding.`}
        </p>
      </div>
      {invoiceCount > 500 && (
        <p role="status" className="text-sm font-medium text-amber-800">
          Narrow the search filters to 500 or fewer outstanding invoices before recording bulk payments.
        </p>
      )}
      <input type="hidden" name="search" value={search} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="overdue" value={overdue} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="classLevelId" value={classLevelId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="currency" value={currency} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ValueSelectField label="Payment method" name="paymentMethod" options={[
          { value: "cash", label: "Cash" },
          { value: "bank_transfer", label: "Bank transfer" },
          { value: "card", label: "Card" },
          { value: "mobile_money", label: "Mobile money" },
          { value: "cheque", label: "Cheque" },
          { value: "other", label: "Other" },
        ]} />
        <Field label="Reference" name="reference" required={false} placeholder="Optional batch or transaction reference" />
      </div>
      <Field label="Notes" name="notes" required={false} />
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      <AdminConfirmSubmitButton
        label="Record bulk payment"
        buttonText={pending ? "Recording..." : "Record payments"}
        confirmationTitle="Confirm bulk invoice payment"
        confirmationMessage={`This will record payments for up to 500 unpaid or partial invoices matching these filters, up to ${currency} ${(outstandingMinor / 100).toFixed(2)} in total. Each invoice will receive its own receipt. Continue only if this amount has been received.`}
        disabled={pending || outstandingMinor <= 0 || invoiceCount > 500}
        variant="primary"
      />
    </form>
  );
}

export function FeePaymentReversalForm({
  paymentId,
  amount,
  currency,
  idempotencyKey,
}: {
  paymentId: number;
  amount: string;
  currency: string;
  idempotencyKey: string;
}) {
  return (
    <ActionForm action={reverseFeePayment} title="Reverse or refund payment" submitLabel="Record reversal">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Field label={`Amount (${currency})`} name="amount" type="number" placeholder={amount} />
      <ValueSelectField label="Action" name="reversalType" options={[
        { value: "reversal", label: "Reverse payment" },
        { value: "refund", label: "Refund" },
      ]} />
      <Field label="Reason" name="reason" placeholder="Required audit reason" />
      <Field label="Reference" name="reference" required={false} placeholder="Optional bank or refund reference" />
      <p className="text-xs text-slate-500">Unreversed amount: {currency} {amount}. This creates a financial history record; it does not delete the payment.</p>
    </ActionForm>
  );
}

export function EditFeeInvoiceForm({
  invoice,
}: {
  invoice: {
    id: number;
    amount: string;
    discountAmount: string;
    dueDate: string;
    fineType: string;
    fineValue: string;
  };
}) {
  return (
    <ActionForm action={updateFeeInvoice} title="Edit invoice" submitLabel="Save invoice">
      <input type="hidden" name="invoiceId" value={invoice.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invoice amount" name="amount" type="number" defaultValue={invoice.amount} />
        <Field label="Discount amount" name="discountAmount" type="number" defaultValue={invoice.discountAmount} />
        <Field label="Due date" name="dueDate" type="date" defaultValue={invoice.dueDate} />
        <ValueSelectField label="Late fine" name="fineType" options={[
          { value: "none", label: "No fine" },
          { value: "fixed", label: "Fixed amount" },
          { value: "percentage", label: "Percentage of fee" },
        ]} defaultValue={invoice.fineType} />
      </div>
      <Field label="Fine value" name="fineValue" type="number" defaultValue={invoice.fineValue} />
      <p className="text-xs text-slate-500">Item and invoice number stay fixed. If paid, change only the due date unless you record a reversal or refund.</p>
    </ActionForm>
  );
}
