"use client";

import { useActionState, type ReactNode } from "react";
import {
  createAccountTransaction,
  createChartAccount,
  createFundTransfer,
  createSchoolBankAccount,
  reviewAccountTransaction,
  type AccountActionState,
} from "./actions";

export type AccountOption = { id: number; label: string };

function ActionForm({
  action,
  title,
  children,
}: {
  action: (state: AccountActionState, formData: FormData) => Promise<AccountActionState>;
  title: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.message ?? "Saved successfully."}</p>}
      <button disabled={pending} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

function TextField({
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
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3" />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  required = true,
}: {
  label: string;
  name: string;
  options: AccountOption[];
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <select name={name} required={required} defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
        {required && <option value="">Choose...</option>}
        {!required && <option value="">None</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function AccountForms({
  section,
  assetAccounts,
  incomeAccounts,
  expenseAccounts,
  banks,
  currentDate,
}: {
  section: string;
  assetAccounts: AccountOption[];
  incomeAccounts: AccountOption[];
  expenseAccounts: AccountOption[];
  banks: AccountOption[];
  currentDate: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {section === "chart" && <ActionForm action={createChartAccount} title="Add chart of account">
        <TextField label="Account code" name="code" placeholder="4000" />
        <TextField label="Account name" name="name" placeholder="Donations income" />
        <label className="block text-sm text-slate-700">
          <span className="mb-1 block font-medium">Account type</span>
          <select name="accountType" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option>
            <option value="income">Income</option><option value="expense">Expense</option>
          </select>
        </label>
        <TextField label="Description" name="description" required={false} />
      </ActionForm>}

      {section === "bank" && <ActionForm action={createSchoolBankAccount} title="Add bank / cash account">
        <TextField label="Bank or provider" name="bankName" />
        <TextField label="Account display name" name="accountName" placeholder="School operating account" />
        <TextField label="Account number (only last 4 are stored)" name="accountNumber" required={false} />
        <SelectField label="Linked asset account" name="chartAccountId" options={assetAccounts} />
        <TextField label="Opening balance" name="openingBalance" type="number" defaultValue="0" />
      </ActionForm>}

      {section === "income" && <ActionForm action={createAccountTransaction} title="Record income">
        <input type="hidden" name="transactionType" value="income" />
        <SelectField label="Income category" name="categoryAccountId" options={incomeAccounts} />
        <SelectField label="Deposit to bank / cash" name="bankAccountId" options={banks} required={false} />
        <TextField label="Date" name="transactionDate" type="date" defaultValue={currentDate} />
        <TextField label="Amount" name="amount" type="number" />
        <TextField label="Description" name="description" />
        <TextField label="Received from" name="payee" required={false} />
        <TextField label="Reference" name="reference" required={false} />
      </ActionForm>}

      {section === "expenses" && <ActionForm action={createAccountTransaction} title="Record expense">
        <input type="hidden" name="transactionType" value="expense" />
        <SelectField label="Expense category" name="categoryAccountId" options={expenseAccounts} />
        <SelectField label="Paid from bank / cash" name="bankAccountId" options={banks} required={false} />
        <TextField label="Date" name="transactionDate" type="date" defaultValue={currentDate} />
        <TextField label="Amount" name="amount" type="number" />
        <TextField label="Description" name="description" placeholder="Staff expense, supplies, utilities..." />
        <TextField label="Paid to" name="payee" required={false} />
        <TextField label="Reference" name="reference" required={false} />
      </ActionForm>}

      {section === "transfers" && <ActionForm action={createFundTransfer} title="Transfer funds">
        <SelectField label="From account" name="sourceBankAccountId" options={banks} />
        <SelectField label="To account" name="destinationBankAccountId" options={banks} />
        <TextField label="Date" name="transferDate" type="date" defaultValue={currentDate} />
        <TextField label="Amount" name="amount" type="number" />
        <TextField label="Reference" name="reference" required={false} />
        <TextField label="Note" name="note" required={false} />
      </ActionForm>}
    </div>
  );
}

export function ReviewTransactionForm({ transactionId }: { transactionId: number }) {
  const [state, formAction, pending] = useActionState(reviewAccountTransaction, {});
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="transactionId" value={transactionId} />
      <button name="decision" value="approved" disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
      <button name="decision" value="rejected" disabled={pending} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button>
      {state.error && <span role="alert" className="text-xs text-rose-700">{state.error}</span>}
      {state.success && <span role="status" className="text-xs text-emerald-700">Reviewed.</span>}
    </form>
  );
}

export function ProfitLossFilters({ from, to }: { from: string; to: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="text-sm text-slate-700">From<input name="from" type="date" defaultValue={from} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
      <label className="text-sm text-slate-700">To<input name="to" type="date" defaultValue={to} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
      <button className="h-10 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">Update report</button>
    </form>
  );
}
