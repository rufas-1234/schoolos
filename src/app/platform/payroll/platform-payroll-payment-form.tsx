"use client";

import { useActionState } from "react";
import {
  platformPayStaffPayrollRecord,
  type PlatformPayrollActionState,
} from "./actions";

const fieldClass = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export function PlatformPayrollPaymentForm({
  schoolPublicId,
  payrollPublicId,
  banks,
  expenseAccounts,
  defaultExpenseAccountId,
  currentDate,
}: {
  schoolPublicId: string;
  payrollPublicId: string;
  banks: { id: string; label: string }[];
  expenseAccounts: { id: string; label: string }[];
  defaultExpenseAccountId: string;
  currentDate: string;
}) {
  const [state, action, pending] = useActionState<PlatformPayrollActionState, FormData>(
    platformPayStaffPayrollRecord,
    {},
  );

  return (
    <form action={action} className="min-w-60 space-y-2">
      <input type="hidden" name="schoolPublicId" value={schoolPublicId} />
      <input type="hidden" name="payrollPublicId" value={payrollPublicId} />
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Bank or cash account
        <select name="bankAccountId" required defaultValue={banks[0]?.id ?? ""} className={fieldClass}>
          {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.label}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Expense category
        <select name="categoryAccountId" required defaultValue={defaultExpenseAccountId} className={fieldClass}>
          {expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Payment date
        <input type="date" name="paidDate" required defaultValue={currentDate} className={fieldClass} />
      </label>
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Reference (optional)
        <input name="reference" maxLength={120} className={fieldClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record payment"}
      </button>
      {state.error && <p role="alert" className="text-xs text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-emerald-700">{state.success}</p>}
    </form>
  );
}
