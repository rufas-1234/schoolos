import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "@/db";
import {
  accountTransactions,
  chartOfAccounts,
  feePaymentReversals,
  feePayments,
  fundTransfers,
  schools,
  schoolBankAccounts,
  user,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { parseCostMinorUnits } from "@/lib/inventory-policy";
import { DownloadCsv } from "@/components/download-csv";
import { PrintReportButton } from "@/app/admin/hr/reports/print-report-button";
import { AccountForms, ProfitLossFilters, ReviewTransactionForm, type AccountOption } from "./account-forms";

export const dynamic = "force-dynamic";

type SearchParams = { section?: string | string[]; from?: string | string[]; to?: string | string[]; status?: string | string[] };
type Section = "profit" | "income" | "expenses" | "chart" | "bank" | "transfers" | "reports";
const approverUser = alias(user, "approver_user");
const sourceBankAccount = alias(schoolBankAccounts, "source_account");
const destinationBankAccount = alias(schoolBankAccounts, "destination_account");

const sections: Array<{ id: Section; label: string }> = [
  { id: "profit", label: "Profit & Loss" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "chart", label: "Chart of accounts" },
  { id: "bank", label: "Bank accounts" },
  { id: "transfers", label: "Fund transfers" },
  { id: "reports", label: "Reports" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function moneyMinor(value: string | null | undefined): bigint {
  if (!value) return BigInt(0);
  const parsed = parseCostMinorUnits(value);
  if (parsed === null) throw new Error("Stored accounting amount is invalid.");
  return parsed;
}

function displayCurrency(minor: bigint, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency })
    .format(Number(minor) / 100);
}

function displayAmount(value: string, currency: string): string {
  return displayCurrency(moneyMinor(value), currency);
}

function displayTimestamp(value: Date | null): string {
  return value ? value.toLocaleString() : "—";
}

function accountOptions(rows: Array<{ id: number; code: string; name: string }>): AccountOption[] {
  return rows.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}` }));
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireSchoolPermission("accounts.manage");
  const query = await searchParams;
  const requestedSection = first(query.section);
  const section: Section = sections.some((item) => item.id === requestedSection)
    ? requestedSection as Section
    : "profit";
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const requestedFrom = first(query.from);
  const requestedTo = first(query.to);
  const requestedStatus = first(query.status);
  const reportStatus = requestedStatus === "pending" || requestedStatus === "approved" || requestedStatus === "rejected"
    ? requestedStatus
    : "all";
  const fromCandidate = validDate(requestedFrom) ? requestedFrom : defaultFrom;
  const toCandidate = validDate(requestedTo) ? requestedTo : today;
  const from = toCandidate >= fromCandidate ? fromCandidate : defaultFrom;
  const to = toCandidate >= fromCandidate ? toCandidate : today;
  const startAt = new Date(`${from}T00:00:00.000Z`);
  const endAt = new Date(`${to}T23:59:59.999Z`);
  const [school, accounts, bankAccounts, transactions, transfers, pnlTransactions, reportTransactions, reportTransfers, feeIncomeRows, reversals, bankTotals, transferDebits, transferCredits] =
    await Promise.all([
      db.select({ currency: schools.currency }).from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
      db.select({
        id: chartOfAccounts.id,
        code: chartOfAccounts.code,
        name: chartOfAccounts.name,
        accountType: chartOfAccounts.accountType,
        description: chartOfAccounts.description,
        status: chartOfAccounts.status,
      }).from(chartOfAccounts)
        .where(eq(chartOfAccounts.schoolId, context.schoolId))
        .orderBy(asc(chartOfAccounts.accountType), asc(chartOfAccounts.code)),
      db.select({
        id: schoolBankAccounts.id,
        bankName: schoolBankAccounts.bankName,
        accountName: schoolBankAccounts.accountName,
        accountNumberLast4: schoolBankAccounts.accountNumberLast4,
        openingBalance: schoolBankAccounts.openingBalance,
        status: schoolBankAccounts.status,
        chartAccountId: schoolBankAccounts.chartAccountId,
        chartCode: chartOfAccounts.code,
        chartName: chartOfAccounts.name,
      }).from(schoolBankAccounts)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, schoolBankAccounts.chartAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .where(eq(schoolBankAccounts.schoolId, context.schoolId))
        .orderBy(asc(schoolBankAccounts.accountName)),
      db.select({
        id: accountTransactions.id,
        transactionType: accountTransactions.transactionType,
        transactionDate: accountTransactions.transactionDate,
        amount: accountTransactions.amount,
        description: accountTransactions.description,
        payee: accountTransactions.payee,
        reference: accountTransactions.reference,
        status: accountTransactions.status,
        accountName: chartOfAccounts.name,
        accountCode: chartOfAccounts.code,
        bankAccountId: accountTransactions.bankAccountId,
        submitterName: user.name,
        approvedAt: accountTransactions.approvedAt,
        approverName: approverUser.name,
      }).from(accountTransactions)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .innerJoin(user, eq(user.id, accountTransactions.submittedBy))
        .leftJoin(approverUser, eq(approverUser.id, accountTransactions.approvedBy))
        .where(eq(accountTransactions.schoolId, context.schoolId))
        .orderBy(desc(accountTransactions.createdAt)).limit(250),
      db.select({
        id: fundTransfers.id,
        transferDate: fundTransfers.transferDate,
        amount: fundTransfers.amount,
        reference: fundTransfers.reference,
        note: fundTransfers.note,
        sourceId: fundTransfers.sourceBankAccountId,
        destinationId: fundTransfers.destinationBankAccountId,
        sourceName: sourceBankAccount.accountName,
        destinationName: destinationBankAccount.accountName,
      }).from(fundTransfers)
        .leftJoin(sourceBankAccount, and(
          eq(sourceBankAccount.id, fundTransfers.sourceBankAccountId),
          eq(sourceBankAccount.schoolId, context.schoolId),
        ))
        .leftJoin(destinationBankAccount, and(
          eq(destinationBankAccount.id, fundTransfers.destinationBankAccountId),
          eq(destinationBankAccount.schoolId, context.schoolId),
        ))
        .where(eq(fundTransfers.schoolId, context.schoolId))
        .orderBy(desc(fundTransfers.transferDate), desc(fundTransfers.id)).limit(250),
      db.select({
        type: accountTransactions.transactionType,
        amount: accountTransactions.amount,
        accountName: chartOfAccounts.name,
        accountCode: chartOfAccounts.code,
        transactionDate: accountTransactions.transactionDate,
        description: accountTransactions.description,
      }).from(accountTransactions)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .where(and(
          eq(accountTransactions.schoolId, context.schoolId),
          eq(accountTransactions.status, "approved"),
          gte(accountTransactions.transactionDate, from),
          lte(accountTransactions.transactionDate, to),
        ))
        .orderBy(asc(accountTransactions.transactionDate)),
      db.select({
        id: accountTransactions.id,
        transactionType: accountTransactions.transactionType,
        transactionDate: accountTransactions.transactionDate,
        amount: accountTransactions.amount,
        description: accountTransactions.description,
        payee: accountTransactions.payee,
        reference: accountTransactions.reference,
        status: accountTransactions.status,
        accountName: chartOfAccounts.name,
        accountCode: chartOfAccounts.code,
        bankAccountId: accountTransactions.bankAccountId,
        submitterName: user.name,
        approvedAt: accountTransactions.approvedAt,
        approverName: approverUser.name,
      }).from(accountTransactions)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .innerJoin(user, eq(user.id, accountTransactions.submittedBy))
        .leftJoin(approverUser, eq(approverUser.id, accountTransactions.approvedBy))
        .where(and(
          eq(accountTransactions.schoolId, context.schoolId),
          gte(accountTransactions.transactionDate, from),
          lte(accountTransactions.transactionDate, to),
          ...(reportStatus === "all" ? [] : [eq(accountTransactions.status, reportStatus)]),
        ))
        .orderBy(desc(accountTransactions.transactionDate), desc(accountTransactions.id)),
      db.select({
        id: fundTransfers.id,
        transferDate: fundTransfers.transferDate,
        amount: fundTransfers.amount,
        reference: fundTransfers.reference,
        note: fundTransfers.note,
        sourceName: sourceBankAccount.accountName,
        destinationName: destinationBankAccount.accountName,
      }).from(fundTransfers)
        .leftJoin(sourceBankAccount, and(
          eq(sourceBankAccount.id, fundTransfers.sourceBankAccountId),
          eq(sourceBankAccount.schoolId, context.schoolId),
        ))
        .leftJoin(destinationBankAccount, and(
          eq(destinationBankAccount.id, fundTransfers.destinationBankAccountId),
          eq(destinationBankAccount.schoolId, context.schoolId),
        ))
        .where(and(
          eq(fundTransfers.schoolId, context.schoolId),
          gte(fundTransfers.transferDate, from),
          lte(fundTransfers.transferDate, to),
        ))
        .orderBy(desc(fundTransfers.transferDate), desc(fundTransfers.id)),
      db.select({ amount: feePayments.amount, fineAmount: feePayments.fineAmount })
        .from(feePayments)
        .where(and(
          eq(feePayments.schoolId, context.schoolId),
          gte(feePayments.paidAt, startAt),
          lte(feePayments.paidAt, endAt),
          sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
        )),
      db.select({ amount: feePaymentReversals.amount, fineAmount: feePaymentReversals.fineAmount })
        .from(feePaymentReversals)
        .innerJoin(feePayments, and(
          eq(feePayments.id, feePaymentReversals.paymentId),
          eq(feePayments.schoolId, context.schoolId),
        ))
        .where(and(
          eq(feePaymentReversals.schoolId, context.schoolId),
          gte(feePaymentReversals.createdAt, startAt),
          lte(feePaymentReversals.createdAt, endAt),
          sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
        )),
      db.select({
        bankAccountId: accountTransactions.bankAccountId,
        income: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransactions.transactionType} = 'income' THEN ${accountTransactions.amount} ELSE 0 END), 0)`,
        expense: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransactions.transactionType} = 'expense' THEN ${accountTransactions.amount} ELSE 0 END), 0)`,
      }).from(accountTransactions)
        .where(and(
          eq(accountTransactions.schoolId, context.schoolId),
          eq(accountTransactions.status, "approved"),
        ))
        .groupBy(accountTransactions.bankAccountId),
      db.select({
        bankAccountId: fundTransfers.sourceBankAccountId,
        amount: sql<string>`COALESCE(SUM(${fundTransfers.amount}), 0)`,
      }).from(fundTransfers)
        .where(eq(fundTransfers.schoolId, context.schoolId))
        .groupBy(fundTransfers.sourceBankAccountId),
      db.select({
        bankAccountId: fundTransfers.destinationBankAccountId,
        amount: sql<string>`COALESCE(SUM(${fundTransfers.amount}), 0)`,
      }).from(fundTransfers)
        .where(eq(fundTransfers.schoolId, context.schoolId))
        .groupBy(fundTransfers.destinationBankAccountId),
    ]);

  const currency = school?.currency ?? "USD";
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const assetAccounts = accountOptions(activeAccounts.filter((account) => account.accountType === "asset"));
  const incomeAccounts = accountOptions(activeAccounts.filter((account) =>
    account.accountType === "income" && account.code !== "4000"
  ));
  const expenseAccounts = accountOptions(activeAccounts.filter((account) => account.accountType === "expense"));
  const bankOptions = bankAccounts.filter((bank) => bank.status === "active").map((bank) => ({
    id: bank.id,
    label: `${bank.accountName} · ${bank.bankName}`,
  }));
  const transactionIncome = pnlTransactions.filter((row) => row.type === "income" && row.accountCode !== "4000");
  const expenses = pnlTransactions.filter((row) => row.type === "expense");
  const otherIncomeTotal = transactionIncome.reduce((total, row) => total + moneyMinor(row.amount), BigInt(0));
  const feeIncome = feeIncomeRows.reduce((total, row) => total + moneyMinor(row.amount) + moneyMinor(row.fineAmount), BigInt(0));
  const reversedFeeIncome = reversals.reduce((total, row) => total + moneyMinor(row.amount) + moneyMinor(row.fineAmount), BigInt(0));
  const feeIncomeTotal = feeIncome - reversedFeeIncome;
  const incomeTotal = otherIncomeTotal + feeIncomeTotal;
  const expenseTotal = expenses.reduce((total, row) => total + moneyMinor(row.amount), BigInt(0));
  const netProfit = incomeTotal - expenseTotal;
  const hasDemoProfitTransactions = pnlTransactions.some((row) => row.description.startsWith("DEMO TEST ONLY - "));
  const hasDemoReportTransactions = reportTransactions.some((row) => row.description.startsWith("DEMO TEST ONLY - "));
  const bankActivity = new Map<number, { income: bigint; expense: bigint }>();
  for (const row of bankTotals) {
    if (row.bankAccountId === null) continue;
    bankActivity.set(row.bankAccountId, { income: moneyMinor(row.income), expense: moneyMinor(row.expense) });
  }
  const transferDebitTotals = new Map(transferDebits.map((row) => [row.bankAccountId, moneyMinor(row.amount)]));
  const transferCreditTotals = new Map(transferCredits.map((row) => [row.bankAccountId, moneyMinor(row.amount)]));
  const bankBalances = new Map(bankAccounts.map((bank) => {
    const activity = bankActivity.get(bank.id) ?? { income: BigInt(0), expense: BigInt(0) };
    const balance = moneyMinor(bank.openingBalance) + activity.income - activity.expense
      - (transferDebitTotals.get(bank.id) ?? BigInt(0))
      + (transferCreditTotals.get(bank.id) ?? BigInt(0));
    return [bank.id, balance] as const;
  }));
  const reviewNeeded = transactions.filter((transaction) => transaction.status === "pending");
  const activeSection = sections.find((item) => item.id === section) ?? sections[0];

  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-violet-700">Finance</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Accounts</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Manage income, operating expenses, bank accounts, transfers, and period-based profit and loss.</p>
      </header>

      <nav aria-label="Accounts sections" className="flex flex-wrap gap-2">
        {sections.map((item) => (
          <a key={item.id} href={`/admin/accounts?section=${item.id}${item.id === "profit" ? `&from=${from}&to=${to}` : ""}`}
            aria-current={section === item.id ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${section === item.id ? "bg-violet-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {item.label}
          </a>
        ))}
      </nav>

      <section>
        <h2 className="mb-3 text-xl font-bold text-slate-900">{activeSection.label}</h2>
        {section === "profit" && (
          <div className="space-y-4">
            <ProfitLossFilters from={from} to={to} />
            <p className="text-xs text-slate-500">Profit and loss includes approved income and expenses, school fee receipts net of refunds, and excludes transactions still awaiting approval and fee-module test payments.</p>
            {hasDemoProfitTransactions && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">DEMO TEST ONLY records are included in these totals as workflow examples; they are not real income or expenses.</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Total income (incl. net fee receipts)" value={displayCurrency(incomeTotal, currency)} />
              <SummaryCard label="Operating expenses" value={displayCurrency(expenseTotal, currency)} />
              <SummaryCard label="Net surplus / (deficit)" value={displayCurrency(netProfit, currency)} tone={netProfit < BigInt(0) ? "rose" : "emerald"} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <SummaryTable title="Income statement" rows={[
                { label: "School fee receipts (net of reversals)", value: displayCurrency(feeIncomeTotal, currency) },
                ...sumByAccount(transactionIncome).map((row) => ({ label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, currency) })),
                { label: "Total income", value: displayCurrency(incomeTotal, currency), strong: true },
              ]} />
              <SummaryTable title="Expenses" rows={[
                ...sumByAccount(expenses).map((row) => ({ label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, currency) })),
                { label: "Total expenses", value: displayCurrency(expenseTotal, currency), strong: true },
              ]} />
            </div>
          </div>
        )}

        {section === "income" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">School fee receipts are included automatically from fee collections in Profit &amp; Loss. Record donations and other non-fee income here to avoid double counting.</p>
            <AccountForms section={section} assetAccounts={assetAccounts} incomeAccounts={incomeAccounts} expenseAccounts={expenseAccounts} banks={bankOptions} currentDate={today} />
            <TransactionTable transactions={transactions.filter((transaction) => transaction.transactionType === "income")} currency={currency} reviewNeeded={reviewNeeded} />
          </div>
        )}
        {section === "expenses" && (
          <div className="space-y-4">
            <AccountForms section={section} assetAccounts={assetAccounts} incomeAccounts={incomeAccounts} expenseAccounts={expenseAccounts} banks={bankOptions} currentDate={today} />
            <TransactionTable transactions={transactions.filter((transaction) => transaction.transactionType === "expense")} currency={currency} reviewNeeded={reviewNeeded} />
          </div>
        )}
        {section === "chart" && (
          <div className="space-y-4">
            <AccountForms section={section} assetAccounts={assetAccounts} incomeAccounts={incomeAccounts} expenseAccounts={expenseAccounts} banks={bankOptions} currentDate={today} />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{accounts.map((account) => (
                  <tr key={account.id}><td className="px-4 py-3 font-mono">{account.code}</td><td className="px-4 py-3 font-semibold">{account.name}</td><td className="px-4 py-3 capitalize">{account.accountType}</td><td className="px-4 py-3">{account.description ?? "—"}</td><td className="px-4 py-3 capitalize">{account.status}</td></tr>
                ))}{!accounts.length && <EmptyRow columns={5} text="Create your chart of accounts to categorize income and expenses." />}</tbody>
              </table>
            </div>
          </div>
        )}
        {section === "bank" && (
          <div className="space-y-4">
            <AccountForms section={section} assetAccounts={assetAccounts} incomeAccounts={incomeAccounts} expenseAccounts={expenseAccounts} banks={bankOptions} currentDate={today} />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Linked chart account</th><th className="px-4 py-3">Opening balance</th><th className="px-4 py-3">Current balance</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{bankAccounts.map((bank) => (
                  <tr key={bank.id}><td className="px-4 py-3 font-semibold">{bank.accountName}<span className="block text-xs text-slate-500">{bank.bankName}{bank.accountNumberLast4 ? ` ···· ${bank.accountNumberLast4}` : ""}</span></td><td className="px-4 py-3">{bank.chartCode} · {bank.chartName}</td><td className="px-4 py-3">{displayAmount(bank.openingBalance, currency)}</td><td className="px-4 py-3 font-semibold">{displayCurrency(bankBalances.get(bank.id) ?? BigInt(0), currency)}</td><td className="px-4 py-3 capitalize">{bank.status}</td></tr>
                ))}{!bankAccounts.length && <EmptyRow columns={5} text="Add a bank or cash account and link it to an asset account." />}</tbody>
              </table>
            </div>
          </div>
        )}
        {section === "transfers" && (
          <div className="space-y-4">
            <AccountForms section={section} assetAccounts={assetAccounts} incomeAccounts={incomeAccounts} expenseAccounts={expenseAccounts} banks={bankOptions} currentDate={today} />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reference / note</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{transfers.map((transfer) => (
                  <tr key={transfer.id}><td className="px-4 py-3">{transfer.transferDate}</td><td className="px-4 py-3">{transfer.sourceName}</td><td className="px-4 py-3">{transfer.destinationName}</td><td className="px-4 py-3 font-semibold">{displayAmount(transfer.amount, currency)}</td><td className="px-4 py-3">{transfer.reference ?? "—"}<span className="block text-xs text-slate-500">{transfer.note ?? ""}</span></td></tr>
                ))}{!transfers.length && <EmptyRow columns={5} text="No fund transfers have been recorded." />}</tbody>
              </table>
            </div>
          </div>
        )}
        {section === "reports" && (
          <div className="space-y-5">
            <form method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="section" value="reports" />
              <label className="text-sm text-slate-700">From<input name="from" type="date" defaultValue={from} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
              <label className="text-sm text-slate-700">To<input name="to" type="date" defaultValue={to} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
              <label className="text-sm text-slate-700">Transaction status
                <select name="status" defaultValue={reportStatus} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3">
                  <option value="all">All statuses</option><option value="approved">Approved</option>
                  <option value="pending">Pending review</option><option value="rejected">Rejected</option>
                </select>
              </label>
              <button className="h-10 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">Update report</button>
              <DownloadCsv
                headers={["Date", "Type", "Account code", "Category", "Description", "Payee", "Reference", "Status", "Amount"]}
                rows={reportTransactions.map((row) => [
                  row.transactionDate, row.transactionType, row.accountCode, row.accountName, row.description,
                  row.payee ?? "", row.reference ?? "", row.status, row.amount,
                ])}
                fileName={`accounts-report-${from}-to-${to}.csv`}
              />
              <DownloadCsv
                headers={["Date", "From account", "To account", "Amount", "Reference", "Note"]}
                rows={reportTransfers.map((transfer) => [
                  transfer.transferDate, transfer.sourceName ?? "", transfer.destinationName ?? "",
                  transfer.amount, transfer.reference ?? "", transfer.note ?? "",
                ])}
                fileName={`fund-transfers-${from}-to-${to}.csv`}
              />
              <PrintReportButton />
            </form>

            <section className="print-report-content space-y-5">
              <header className="print-report-heading">
                <p className="print-report-kicker">Finance · Accounts</p>
                <h2>Accounts activity report</h2>
                <p>{from} through {to} · {reportStatus === "all" ? "All statuses" : `${reportStatus} transactions`} · {reportTransactions.length} transactions</p>
              </header>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Net fee receipts" value={displayCurrency(feeIncomeTotal, currency)} />
                <SummaryCard label="Other approved income" value={displayCurrency(otherIncomeTotal, currency)} />
                <SummaryCard label="Approved expenses" value={displayCurrency(expenseTotal, currency)} />
                <SummaryCard label="Net surplus / (deficit)" value={displayCurrency(netProfit, currency)} tone={netProfit < BigInt(0) ? "rose" : "emerald"} />
              </div>
              <p className="text-xs text-slate-500">Fees are shown separately from non-fee income. Only approved accounting transactions affect the income and expense totals; pending and rejected records remain visible when selected.</p>
              {hasDemoReportTransactions && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">DEMO TEST ONLY records are included in the transaction list and applicable totals as workflow examples; they are not real income or expenses.</p>}
              <TransactionTable
                transactions={reportTransactions}
                currency={currency}
                reviewNeeded={reportTransactions.filter((row) => row.status === "pending")}
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <SummaryTable title="Income by category" rows={[
                  { label: "School fee receipts (net of reversals)", value: displayCurrency(feeIncomeTotal, currency) },
                  ...sumByAccount(transactionIncome).map((row) => ({ label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, currency) })),
                ]} />
                <SummaryTable title="Expenses by category" rows={sumByAccount(expenses).map((row) => ({
                  label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, currency),
                }))} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <h3 className="border-b border-slate-100 p-4 font-bold text-slate-900">Bank and cash balances</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Opening balance</th><th className="px-4 py-3">Current balance</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{bankAccounts.map((bank) => (
                        <tr key={bank.id}><td className="px-4 py-3">{bank.accountName}<span className="block text-xs text-slate-500">{bank.bankName}</span></td><td className="px-4 py-3">{displayAmount(bank.openingBalance, currency)}</td><td className="px-4 py-3 font-semibold">{displayCurrency(bankBalances.get(bank.id) ?? BigInt(0), currency)}</td></tr>
                      ))}{!bankAccounts.length && <EmptyRow columns={3} text="No bank or cash accounts have been set up." />}</tbody>
                    </table>
                  </div>
                </section>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <h3 className="border-b border-slate-100 p-4 font-bold text-slate-900">Fund transfers in period</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / reference</th><th className="px-4 py-3">From / to</th><th className="px-4 py-3">Amount</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{reportTransfers.map((transfer) => (
                        <tr key={transfer.id}><td className="px-4 py-3">{transfer.transferDate}<span className="block text-xs text-slate-500">{transfer.reference ?? transfer.note ?? "—"}</span></td><td className="px-4 py-3">{transfer.sourceName ?? "Unknown"}<span className="block text-xs text-slate-500">to {transfer.destinationName ?? "Unknown"}</span></td><td className="px-4 py-3 font-semibold">{displayAmount(transfer.amount, currency)}</td></tr>
                      ))}{!reportTransfers.length && <EmptyRow columns={3} text="No transfers were recorded for this period." />}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function sumByAccount(rows: Array<{ accountName: string; accountCode: string; amount: string }>) {
  const totals = new Map<string, { name: string; code: string; total: bigint }>();
  for (const row of rows) {
    const entry = totals.get(row.accountCode) ?? { name: row.accountName, code: row.accountCode, total: BigInt(0) };
    entry.total += moneyMinor(row.amount);
    totals.set(row.accountCode, entry);
  }
  return [...totals.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function SummaryCard({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "rose" | "emerald" }) {
  const color = tone === "rose" ? "text-rose-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-950";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: Array<{ label: string; value: string; strong?: boolean }> }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 p-4 font-bold text-slate-900">{title}</h3>
      <div className="divide-y divide-slate-100">{rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className={`flex justify-between gap-4 px-4 py-3 text-sm ${row.strong ? "font-bold text-slate-950" : "text-slate-600"}`}>
          <span>{row.label}</span><span className="tabular-nums">{row.value}</span>
        </div>
      ))}{!rows.length && <p className="p-4 text-sm text-slate-500">No approved transactions for this period.</p>}</div>
    </section>
  );
}

type TransactionRow = {
  id: number;
  transactionType: string;
  transactionDate: string;
  amount: string;
  description: string;
  payee: string | null;
  reference: string | null;
  status: string;
  accountName: string;
  accountCode: string;
  bankAccountId: number | null;
  submitterName: string;
  approvedAt: Date | null;
  approverName: string | null;
};

function TransactionTable({
  transactions,
  currency,
  reviewNeeded,
}: {
  transactions: TransactionRow[];
  currency: string;
  reviewNeeded: TransactionRow[];
}) {
  const reviewIds = new Set(reviewNeeded.map((row) => row.id));
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / description</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status / approval</th><th className="px-4 py-3">Review</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td className="px-4 py-3"><strong>{transaction.transactionDate}</strong><span className="block text-xs text-slate-500">{transaction.description}{transaction.reference ? ` · Ref: ${transaction.reference}` : ""}</span></td>
            <td className="px-4 py-3">{transaction.accountCode} · {transaction.accountName}</td>
            <td className="px-4 py-3">{transaction.payee ?? "—"}</td>
            <td className="px-4 py-3 font-semibold">{displayAmount(transaction.amount, currency)}</td>
            <td className="px-4 py-3 capitalize">{transaction.status}<span className="block text-xs text-slate-500">{transaction.approverName ? `By ${transaction.approverName} · ${displayTimestamp(transaction.approvedAt)}` : `Submitted by ${transaction.submitterName}`}</span></td>
            <td className="px-4 py-3">{reviewIds.has(transaction.id) ? <ReviewTransactionForm transactionId={transaction.id} /> : "—"}</td>
          </tr>
        ))}{!transactions.length && <EmptyRow columns={6} text="No income or expense records yet." />}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-slate-500">{text}</td></tr>;
}
