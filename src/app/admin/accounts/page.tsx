import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "@/db";
import {
  accountTransactions,
  chartOfAccounts,
  feePaymentReversals,
  feePayments,
  fundTransfers,
  schoolCurrencies,
  schools,
  schoolBankAccounts,
  studentFeeInvoices,
  staffMembers,
  staffPayrollRecords,
  user,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { parseCostMinorUnits } from "@/lib/inventory-policy";
import { DownloadCsv } from "@/components/download-csv";
import { PrintButton } from "@/components/print-button";
import {
  AccountForms,
  PayrollPaymentForm,
  ProfitLossFilters,
  ReviewTransactionForm,
  type AccountOption,
} from "./account-forms";
import { TablePagination } from "@/components/table-pagination";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { parsePageSize } from "@/components/pagination-utils";

export const dynamic = "force-dynamic";
type SearchParams = {
  section?: string | string[];
  from?: string | string[];
  to?: string | string[];
  status?: string | string[];
  search?: string | string[];
  period?: string | string[];
  payrollPage?: string | string[];
  incomePage?: string | string[];
  expensePage?: string | string[];
  chartPage?: string | string[];
  bankPage?: string | string[];
  transfersPage?: string | string[];
  reportTransactionsPage?: string | string[];
  reportTransfersPage?: string | string[];
  pageSize?: string | string[];
};
type Section = "profit" | "income" | "expenses" | "chart" | "bank" | "transfers" | "payroll" | "reports";
const approverUser = alias(user, "approver_user");
const sourceBankAccount = alias(schoolBankAccounts, "source_account");
const destinationBankAccount = alias(schoolBankAccounts, "destination_account");

const sections: Array<{ id: Section; label: string }> = [
  { id: "chart", label: "Chart of accounts" },
  { id: "profit", label: "Profit & Loss" },
  { id: "bank", label: "Bank accounts" },
  { id: "transfers", label: "Fund transfers" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "payroll", label: "Staff payroll" },
  { id: "reports", label: "Reports" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestedPage(value: string | undefined): number {
  return value && /^\d+$/.test(value) ? Math.max(1, Number(value)) : 1;
}

function paginateRows<T>(rows: T[], requested: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requested, pageCount);
  return {
    page,
    pageSize,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
  };
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
  const pageSize = parsePageSize(query.pageSize);
  const requestedSection = first(query.section);
  const section: Section = sections.some((item) => item.id === requestedSection)
    ? requestedSection as Section
    : "profit";
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const requestedFrom = first(query.from);
  const requestedTo = first(query.to);
  const requestedStatus = first(query.status);
  const search = first(query.search)?.trim().slice(0, 120) ?? "";
  const searchTerm = search.toLocaleLowerCase();
  const requestedPayrollPeriod = first(query.period);
  const payrollPeriod = requestedPayrollPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPayrollPeriod)
    ? requestedPayrollPeriod
    : today.slice(0, 7);
  const reportStatus = requestedStatus === "pending" || requestedStatus === "approved" || requestedStatus === "rejected"
    ? requestedStatus
    : "all";
  const fromCandidate = validDate(requestedFrom) ? requestedFrom : defaultFrom;
  const toCandidate = validDate(requestedTo) ? requestedTo : today;
  const from = toCandidate >= fromCandidate ? fromCandidate : defaultFrom;
  const to = toCandidate >= fromCandidate ? toCandidate : today;
  const startAt = new Date(`${from}T00:00:00.000Z`);
  const endAt = new Date(`${to}T23:59:59.999Z`);
  const [school, accounts, bankAccounts, transactions, transfers, pnlTransactions, accountReportTransactions, reportTransfers, feeIncomeRows, reversals, bankTotals, transferDebits, transferCredits] =
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
        currency: schoolBankAccounts.currency,
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
        publicId: accountTransactions.publicId,
        transactionType: accountTransactions.transactionType,
        transactionDate: accountTransactions.transactionDate,
        amount: accountTransactions.amount,
        currency: accountTransactions.currency,
        description: accountTransactions.description,
        payee: accountTransactions.payee,
        reference: accountTransactions.reference,
        status: accountTransactions.status,
        accountName: chartOfAccounts.name,
        accountCode: chartOfAccounts.code,
        bankAccountId: accountTransactions.bankAccountId,
        bankAccountName: schoolBankAccounts.accountName,
        submitterName: user.name,
        approvedAt: accountTransactions.approvedAt,
        approverName: approverUser.name,
      }).from(accountTransactions)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .innerJoin(user, eq(user.id, accountTransactions.submittedBy))
        .leftJoin(schoolBankAccounts, and(
          eq(schoolBankAccounts.id, accountTransactions.bankAccountId),
          eq(schoolBankAccounts.schoolId, context.schoolId),
        ))
        .leftJoin(approverUser, eq(approverUser.id, accountTransactions.approvedBy))
        .where(eq(accountTransactions.schoolId, context.schoolId))
        .orderBy(desc(accountTransactions.createdAt), desc(accountTransactions.id)),
      db.select({
        id: fundTransfers.id,
        transferDate: fundTransfers.transferDate,
        amount: fundTransfers.amount,
        currency: fundTransfers.currency,
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
        .orderBy(desc(fundTransfers.transferDate), desc(fundTransfers.id)),
      db.select({
        type: accountTransactions.transactionType,
        amount: accountTransactions.amount,
        currency: accountTransactions.currency,
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
        publicId: accountTransactions.publicId,
        transactionType: accountTransactions.transactionType,
        transactionDate: accountTransactions.transactionDate,
        amount: accountTransactions.amount,
        currency: accountTransactions.currency,
        description: accountTransactions.description,
        payee: accountTransactions.payee,
        reference: accountTransactions.reference,
        status: accountTransactions.status,
        accountName: chartOfAccounts.name,
        accountCode: chartOfAccounts.code,
        bankAccountId: accountTransactions.bankAccountId,
        bankAccountName: schoolBankAccounts.accountName,
        submitterName: user.name,
        approvedAt: accountTransactions.approvedAt,
        approverName: approverUser.name,
      }).from(accountTransactions)
        .innerJoin(chartOfAccounts, and(
          eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
          eq(chartOfAccounts.schoolId, context.schoolId),
        ))
        .innerJoin(user, eq(user.id, accountTransactions.submittedBy))
        .leftJoin(schoolBankAccounts, and(
          eq(schoolBankAccounts.id, accountTransactions.bankAccountId),
          eq(schoolBankAccounts.schoolId, context.schoolId),
        ))
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
        currency: fundTransfers.currency,
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
      db.select({
        amount: feePayments.amount,
        fineAmount: feePayments.fineAmount,
        currency: studentFeeInvoices.currency,
      })
        .from(feePayments)
        .innerJoin(studentFeeInvoices, and(
          eq(studentFeeInvoices.id, feePayments.invoiceId),
          eq(studentFeeInvoices.schoolId, context.schoolId),
        ))
        .where(and(
          eq(feePayments.schoolId, context.schoolId),
          gte(feePayments.paidAt, startAt),
          lte(feePayments.paidAt, endAt),
          sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
        )),
      db.select({
        amount: feePaymentReversals.amount,
        fineAmount: feePaymentReversals.fineAmount,
        currency: studentFeeInvoices.currency,
      })
        .from(feePaymentReversals)
        .innerJoin(feePayments, and(
          eq(feePayments.id, feePaymentReversals.paymentId),
          eq(feePayments.schoolId, context.schoolId),
        ))
        .innerJoin(studentFeeInvoices, and(
          eq(studentFeeInvoices.id, feePayments.invoiceId),
          eq(studentFeeInvoices.schoolId, context.schoolId),
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
  const payrollRecords = section === "payroll"
    ? await db.select({
      publicId: staffPayrollRecords.publicId,
      payPeriod: staffPayrollRecords.payPeriod,
      amount: staffPayrollRecords.amount,
      currency: staffPayrollRecords.currency,
      status: staffPayrollRecords.status,
      paidDate: staffPayrollRecords.paidDate,
      paymentTransactionId: accountTransactions.id,
      staffName: staffMembers.firstName,
      staffLastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
    }).from(staffPayrollRecords)
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, staffPayrollRecords.staffId),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .leftJoin(accountTransactions, and(
        eq(accountTransactions.payrollRecordId, staffPayrollRecords.id),
        eq(accountTransactions.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffPayrollRecords.schoolId, context.schoolId),
        eq(staffPayrollRecords.payPeriod, payrollPeriod),
        ...(searchTerm ? [or(
          like(staffMembers.firstName, `%${searchTerm}%`),
          like(staffMembers.lastName, `%${searchTerm}%`),
          like(staffMembers.employeeCode, `%${searchTerm}%`),
        )!] : []),
      ))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName))
    : [];
  const currencyRows = await db.select({
    code: schoolCurrencies.code,
    name: schoolCurrencies.name,
    symbol: schoolCurrencies.symbol,
  }).from(schoolCurrencies).where(eq(schoolCurrencies.schoolId, context.schoolId))
    .orderBy(asc(schoolCurrencies.code));
  const currencyOptions = currencyRows.map((row) => ({
    code: row.code,
    label: `${row.code} · ${row.name} (${row.symbol})`,
  }));
  const currencyNames = new Map(currencyRows.map((row) => [row.code, row.name]));

  const reportTransactions = accountReportTransactions.filter((transaction) =>
    !searchTerm || `${transaction.description} ${transaction.accountName} ${transaction.accountCode} ${transaction.payee ?? ""} ${transaction.reference ?? ""}`
      .toLocaleLowerCase().includes(searchTerm)
  );
  const incomeTransactions = transactions.filter((transaction) => transaction.transactionType === "income");
  const expenseTransactions = transactions.filter((transaction) => transaction.transactionType === "expense");
  const incomeTransactionPage = paginateRows(incomeTransactions, requestedPage(first(query.incomePage)), pageSize);
  const expenseTransactionPage = paginateRows(expenseTransactions, requestedPage(first(query.expensePage)), pageSize);
  const chartPage = paginateRows(accounts, requestedPage(first(query.chartPage)), pageSize);
  const bankPage = paginateRows(bankAccounts, requestedPage(first(query.bankPage)), pageSize);
  const transferPage = paginateRows(transfers, requestedPage(first(query.transfersPage)), pageSize);
  const payrollPage = paginateRows(payrollRecords, requestedPage(first(query.payrollPage)), pageSize);
  const reportTransactionPage = paginateRows(reportTransactions, requestedPage(first(query.reportTransactionsPage)), pageSize);
  const reportTransferPage = paginateRows(reportTransfers, requestedPage(first(query.reportTransfersPage)), pageSize);
  const pageHref = (parameter: string, page: number) => {
    const params = new URLSearchParams({ section, from, to });
    if (search) params.set("search", search);
    if (section === "payroll") params.set("period", payrollPeriod);
    if (reportStatus !== "all") params.set("status", reportStatus);
    params.set("pageSize", String(pageSize));
    params.set(parameter, String(page));
    return `/admin/accounts?${params.toString()}`;
  };
  const currency = school?.currency ?? "USD";
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const assetAccounts = accountOptions(activeAccounts.filter((account) => account.accountType === "asset"));
  const incomeAccounts = accountOptions(activeAccounts.filter((account) =>
    account.accountType === "income" && account.code !== "4000"
  ));
  const expenseAccounts = accountOptions(activeAccounts.filter((account) => account.accountType === "expense"));
  const bankOptions = bankAccounts.filter((bank) => bank.status === "active").map((bank) => ({
    id: bank.id,
    label: `${bank.accountName} · ${bank.bankName} · ${bank.currency}`,
  }));
  const accountFormProps = {
    assetAccounts,
    incomeAccounts,
    expenseAccounts,
    banks: bankOptions,
    currencies: currencyOptions,
    defaultCurrency: currency,
    currentDate: today,
  };
  const defaultPayrollExpense = expenseAccounts.find((account) =>
    /salary|staff|payroll/i.test(account.label)
  ) ?? expenseAccounts[0];
  const pnlCurrencyCodes = new Set([
    currency,
    ...currencyRows.map((row) => row.code),
    ...pnlTransactions.map((row) => row.currency),
    ...feeIncomeRows.map((row) => row.currency),
    ...reversals.map((row) => row.currency),
  ]);
  const pnlSummaries = [...pnlCurrencyCodes].sort().map((code) => {
    const incomeRows = pnlTransactions.filter((row) => row.currency === code && row.type === "income" && row.accountCode !== "4000");
    const expenseRows = pnlTransactions.filter((row) => row.currency === code && row.type === "expense");
    const netFees = feeIncomeRows
      .filter((row) => row.currency === code)
      .reduce((total, row) => total + moneyMinor(row.amount) + moneyMinor(row.fineAmount), BigInt(0))
      - reversals.filter((row) => row.currency === code)
        .reduce((total, row) => total + moneyMinor(row.amount) + moneyMinor(row.fineAmount), BigInt(0));
    const otherIncome = incomeRows.reduce((total, row) => total + moneyMinor(row.amount), BigInt(0));
    const expensesTotal = expenseRows.reduce((total, row) => total + moneyMinor(row.amount), BigInt(0));
    const incomeTotal = netFees + otherIncome;
    return {
      code,
      netFees,
      incomeRows,
      expenseRows,
      otherIncome,
      expensesTotal,
      incomeTotal,
      netProfit: incomeTotal - expensesTotal,
    };
  });
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
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-violet-700">Finance · Accounts</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          {section === "expenses"
            ? "Expenses"
            : section === "payroll"
              ? "Staff payroll payments"
              : section === "reports"
                ? "Accounts reports"
                : "Accounts"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          {section === "expenses"
            ? "Record and review operating expenses with approval status, categories, payees, and references."
            : section === "payroll"
              ? "Finance records staff payments against a bank or cash account and posts each payment to expenses."
            : section === "reports"
              ? "Review date-filtered income and expense activity, approval status, cash balances, and transfers."
              : "Monitor school income, balances, transfers, and period-based profit and loss."}
        </p>
      </header>

      {section !== "reports" && <nav aria-label="Accounts sections" className="flex flex-wrap gap-2">
        {sections.filter((item) => item.id !== "reports").map((item) => (
          <a key={item.id} href={`/admin/accounts?section=${item.id}${item.id === "profit" ? `&from=${from}&to=${to}` : ""}`}
            aria-current={section === item.id ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${section === item.id ? "bg-violet-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {item.label}
          </a>
        ))}
      </nav>}
      {section === "reports" && (
        <a href="/admin/accounts?section=profit" className="inline-flex rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">
          ← Accounts
        </a>
      )}

      <div className="flex justify-end print:hidden">
        <PrintButton
          label={`Print ${section === "reports" ? "Accounts activity report" : activeSection.label}`}
          targetId="accounts-section-print"
        />
      </div>
      <section id="accounts-section-print" className="print-report-content space-y-5">
        <header className="print-report-heading">
          <p className="print-report-kicker">Finance · Accounts</p>
          <h2>{section === "reports" ? "Accounts activity report" : activeSection.label}</h2>
          <p>
            {section === "reports"
              ? `${from} through ${to} · ${reportStatus === "all" ? "All statuses" : `${reportStatus} transactions`} · ${reportTransactions.length} transactions${search ? ` · Search: ${search}` : ""}`
              : section === "profit"
                ? `${from} through ${to} · Approved activity`
                : section === "payroll"
                  ? `Pay period ${payrollPeriod}`
                  : `Generated ${today}`}
          </p>
        </header>
        {section === "profit" && (
          <div className="space-y-4">
            <div className="print:hidden"><ProfitLossFilters from={from} to={to} /></div>
            <p className="text-xs text-slate-500">P&amp;L uses approved activity and fee receipts net of refunds; pending and test items are excluded.</p>
            {hasDemoProfitTransactions && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Demo test records appear in totals but are not real income or expenses.</p>}
            {pnlSummaries.map((summary) => (
              <section key={summary.code} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  {summary.code} · {currencyNames.get(summary.code) ?? summary.code}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <SummaryCard label="Total income (incl. net fee receipts)" value={displayCurrency(summary.incomeTotal, summary.code)} />
                  <SummaryCard label="Operating expenses" value={displayCurrency(summary.expensesTotal, summary.code)} />
                  <SummaryCard label="Net surplus / (deficit)" value={displayCurrency(summary.netProfit, summary.code)} tone={summary.netProfit < BigInt(0) ? "rose" : "emerald"} />
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <SummaryTable title="Income statement" rows={[
                    { label: "School fee receipts (net of reversals)", value: displayCurrency(summary.netFees, summary.code) },
                    ...sumByAccount(summary.incomeRows).map((row) => ({ label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, summary.code) })),
                    { label: "Total income", value: displayCurrency(summary.incomeTotal, summary.code), strong: true },
                  ]} />
                  <SummaryTable title="Expenses" rows={[
                    ...sumByAccount(summary.expenseRows).map((row) => ({ label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, summary.code) })),
                    { label: "Total expenses", value: displayCurrency(summary.expensesTotal, summary.code), strong: true },
                  ]} />
                </div>
              </section>
            ))}
          </div>
        )}

        {section === "income" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Fee receipts are added automatically. Record other income here to avoid double counting.</p>
            <div className="print:hidden"><AccountForms section={section} {...accountFormProps} /></div>
            <TransactionTable transactions={incomeTransactionPage.rows} reviewNeeded={reviewNeeded} schoolName={context.schoolName} />
            <TablePagination ariaLabel="Income transactions" currentPage={incomeTransactionPage.page} pageSize={incomeTransactionPage.pageSize} totalRows={incomeTransactions.length}
              hrefForPage={(page) => pageHref("incomePage", page)} />
          </div>
        )}
        {section === "expenses" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Select an existing expense category or create one in the form below. New categories are added to the chart automatically.
            </p>
            <div className="print:hidden"><AccountForms section={section} {...accountFormProps} /></div>
            <TransactionTable transactions={expenseTransactionPage.rows} reviewNeeded={reviewNeeded} schoolName={context.schoolName} />
            <TablePagination ariaLabel="Expense transactions" currentPage={expenseTransactionPage.page} pageSize={expenseTransactionPage.pageSize} totalRows={expenseTransactions.length}
              hrefForPage={(page) => pageHref("expensePage", page)} />
          </div>
        )}
        {section === "payroll" && (
          <div className="space-y-4">
            <SmartFilterForm method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="section" value="payroll" />
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Pay period
                <input type="month" name="period" defaultValue={payrollPeriod}
                  className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
              </label>
              <label className="min-w-52 flex-1 text-sm font-medium text-slate-700">
                Search staff
                <input type="search" name="search" maxLength={120} defaultValue={search}
                  placeholder="Name or staff number"
                  className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3" />
              </label>
              <button className="h-10 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">View payroll</button>
            </SmartFilterForm>
            <p className="print:hidden rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              After paying staff through your bank or cash process, confirm it here. SchoolOS records the approved expense and marks payroll paid; it does not transfer funds automatically.
            </p>
            <section className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label={`Payroll records · ${payrollPeriod}`} value={String(payrollRecords.length)} />
              <SummaryCard label="Awaiting payment" value={String(payrollRecords.filter((record) => record.status === "recorded").length)} />
              <SummaryCard label="Paid" value={String(payrollRecords.filter((record) => record.status === "paid").length)} />
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-5">
                <h3 className="font-semibold text-slate-900">Staff payroll · {payrollPeriod}</h3>
                <p className="mt-1 text-sm text-slate-500">Prepared by Human resources; paid and posted to Accounts by Finance.</p>
              </div>
              {payrollRecords.length === 0 ? (
                <p className="p-7 text-center text-sm text-slate-500">No payroll records match this period and search.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Staff member</th>
                        <th className="px-4 py-3">Pay period</th>
                        <th className="px-4 py-3">Net pay</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="print:hidden px-4 py-3">Payment details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payrollPage.rows.map((record) => {
                        const matchingBanks = bankAccounts
                          .filter((bank) => bank.status === "active" && bank.currency === record.currency)
                          .map((bank) => ({
                            id: bank.id,
                            label: `${bank.accountName} · ${bank.bankName}`,
                          }));
                        return (
                          <tr key={record.publicId}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{record.staffName} {record.staffLastName}</p>
                              {record.employeeCode && <p className="text-xs text-slate-500">{record.employeeCode}</p>}
                            </td>
                            <td className="px-4 py-3">{record.payPeriod}</td>
                            <td className="px-4 py-3 font-semibold">{displayAmount(record.amount, record.currency)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                record.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}>
                                {record.status === "paid" ? `Paid · ${record.paidDate ?? "date not recorded"}` : "Awaiting payment"}
                              </span>
                            </td>
                            <td className="print:hidden px-4 py-3">
                              {record.status === "paid" ? (
                                <span className="text-sm text-slate-500">
                                  {record.paymentTransactionId
                                    ? "Payment recorded in Accounts."
                                    : "Previously marked paid; no linked Finance transaction."}
                                </span>
                              ) : !matchingBanks.length || !expenseAccounts.length ? (
                                <p className="max-w-sm text-sm text-amber-800">
                                  Set up a matching bank/cash account and expense category before paying this record.{" "}
                                  {!matchingBanks.length && <a className="font-semibold underline" href="/admin/accounts?section=bank">Bank accounts</a>}
                                  {!matchingBanks.length && !expenseAccounts.length && " · "}
                                  {!expenseAccounts.length && <a className="font-semibold underline" href="/admin/accounts?section=chart">Chart of accounts</a>}
                                </p>
                              ) : (
                                <PayrollPaymentForm
                                  payrollPublicId={record.publicId}
                                  banks={matchingBanks}
                                  expenseAccounts={expenseAccounts}
                                  defaultExpenseAccountId={String(defaultPayrollExpense?.id ?? "")}
                                  currentDate={today}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination ariaLabel="Staff payroll payments" currentPage={payrollPage.page} pageSize={payrollPage.pageSize} totalRows={payrollRecords.length}
                hrefForPage={(page) => pageHref("payrollPage", page)} />
            </section>
          </div>
        )}
        {section === "chart" && (
          <div className="space-y-4">
            <div className="print:hidden"><AccountForms section={section} {...accountFormProps} /></div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{chartPage.rows.map((account) => (
                  <tr key={account.id}><td className="px-4 py-3 font-mono">{account.code}</td><td className="px-4 py-3 font-semibold">{account.name}</td><td className="px-4 py-3 capitalize">{account.accountType}</td><td className="px-4 py-3">{account.description ?? "—"}</td><td className="px-4 py-3 capitalize">{account.status}</td></tr>
                ))}{!accounts.length && <EmptyRow columns={5} text="Create your chart of accounts to categorize income and expenses." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Chart of accounts" currentPage={chartPage.page} pageSize={chartPage.pageSize} totalRows={accounts.length}
              hrefForPage={(page) => pageHref("chartPage", page)} />
          </div>
        )}
        {section === "bank" && (
          <div className="space-y-4">
            <div className="print:hidden"><AccountForms section={section} {...accountFormProps} /></div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Linked chart account</th><th className="px-4 py-3">Opening balance</th><th className="px-4 py-3">Current balance</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{bankPage.rows.map((bank) => (
                  <tr key={bank.id}><td className="px-4 py-3 font-semibold">{bank.accountName}<span className="block text-xs text-slate-500">{bank.bankName}{bank.accountNumberLast4 ? ` ···· ${bank.accountNumberLast4}` : ""}</span></td><td className="px-4 py-3">{bank.chartCode} · {bank.chartName}</td><td className="px-4 py-3">{displayAmount(bank.openingBalance, bank.currency)}</td><td className="px-4 py-3 font-semibold">{displayCurrency(bankBalances.get(bank.id) ?? BigInt(0), bank.currency)}</td><td className="px-4 py-3 capitalize">{bank.status}</td></tr>
                ))}{!bankAccounts.length && <EmptyRow columns={5} text="Add a bank or cash account and link it to an asset account." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Bank accounts" currentPage={bankPage.page} pageSize={bankPage.pageSize} totalRows={bankAccounts.length}
              hrefForPage={(page) => pageHref("bankPage", page)} />
          </div>
        )}
        {section === "transfers" && (
          <div className="space-y-4">
            <div className="print:hidden"><AccountForms section={section} {...accountFormProps} /></div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reference / note</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{transferPage.rows.map((transfer) => (
                  <tr key={transfer.id}><td className="px-4 py-3">{transfer.transferDate}</td><td className="px-4 py-3">{transfer.sourceName}</td><td className="px-4 py-3">{transfer.destinationName}</td><td className="px-4 py-3 font-semibold">{displayAmount(transfer.amount, transfer.currency)}</td><td className="px-4 py-3">{transfer.reference ?? "—"}<span className="block text-xs text-slate-500">{transfer.note ?? ""}</span></td></tr>
                ))}{!transfers.length && <EmptyRow columns={5} text="No fund transfers have been recorded." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Fund transfers" currentPage={transferPage.page} pageSize={transferPage.pageSize} totalRows={transfers.length}
              hrefForPage={(page) => pageHref("transfersPage", page)} />
          </div>
        )}
        {section === "reports" && (
          <div className="space-y-5">
            <SmartFilterForm method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="section" value="reports" />
              <label className="min-w-52 flex-1 text-sm font-medium text-slate-700">Search transactions
                <input type="search" name="search" maxLength={120} defaultValue={search}
                  placeholder="Description, category, payee, or reference"
                  className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3" />
              </label>
              <label className="text-sm text-slate-700">From<input name="from" type="date" defaultValue={from} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
              <label className="text-sm text-slate-700">To<input name="to" type="date" defaultValue={to} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
              <label className="text-sm text-slate-700">Transaction status
                <select name="status" defaultValue={reportStatus} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3">
                  <option value="all">All statuses</option><option value="approved">Approved</option>
                  <option value="pending">Pending review</option><option value="rejected">Rejected</option>
                </select>
              </label>
              <button className="h-10 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">Update report</button>
              <a href="/admin/accounts?section=reports" className="h-10 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</a>
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
            </SmartFilterForm>

            <section className="space-y-5">
              {pnlSummaries.map((summary) => (
                <section key={summary.code} className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                    {summary.code} · {currencyNames.get(summary.code) ?? summary.code}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Net fee receipts" value={displayCurrency(summary.netFees, summary.code)} />
                    <SummaryCard label="Other approved income" value={displayCurrency(summary.otherIncome, summary.code)} />
                    <SummaryCard label="Approved expenses" value={displayCurrency(summary.expensesTotal, summary.code)} />
                    <SummaryCard label="Net surplus / (deficit)" value={displayCurrency(summary.netProfit, summary.code)} tone={summary.netProfit < BigInt(0) ? "rose" : "emerald"} />
                  </div>
                </section>
              ))}
              <p className="text-xs text-slate-500">Selected-date totals use approved activity. Filters affect only the register and CSV; fees are separate.</p>
              {hasDemoReportTransactions && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Demo test records appear in the register and totals as examples, not real transactions.</p>}
              <TransactionTable
                transactions={reportTransactionPage.rows}
                reviewNeeded={reportTransactions.filter((row) => row.status === "pending")}
                schoolName={context.schoolName}
              />
              <TablePagination ariaLabel="Accounts report transactions" currentPage={reportTransactionPage.page} pageSize={reportTransactionPage.pageSize} totalRows={reportTransactions.length}
                hrefForPage={(page) => pageHref("reportTransactionsPage", page)} />
              <div className="grid gap-4 xl:grid-cols-2">
                {pnlSummaries.map((summary) => (
                  <div key={summary.code} className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                      {summary.code} · {currencyNames.get(summary.code) ?? summary.code}
                    </h3>
                    <SummaryTable title="Income by category" rows={[
                      { label: "School fee receipts (net of reversals)", value: displayCurrency(summary.netFees, summary.code) },
                      ...sumByAccount(summary.incomeRows).map((row) => ({ label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, summary.code) })),
                    ]} />
                    <SummaryTable title="Expenses by category" rows={sumByAccount(summary.expenseRows).map((row) => ({
                      label: `${row.code} · ${row.name}`, value: displayCurrency(row.total, summary.code),
                    }))} />
                  </div>
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <h3 className="border-b border-slate-100 p-4 font-bold text-slate-900">Bank and cash balances</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Opening balance</th><th className="px-4 py-3">Current balance</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{bankAccounts.map((bank) => (
                        <tr key={bank.id}><td className="px-4 py-3">{bank.accountName}<span className="block text-xs text-slate-500">{bank.bankName}</span></td><td className="px-4 py-3">{displayAmount(bank.openingBalance, bank.currency)}</td><td className="px-4 py-3 font-semibold">{displayCurrency(bankBalances.get(bank.id) ?? BigInt(0), bank.currency)}</td></tr>
                      ))}{!bankAccounts.length && <EmptyRow columns={3} text="No bank or cash accounts have been set up." />}</tbody>
                    </table>
                  </div>
                </section>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <h3 className="border-b border-slate-100 p-4 font-bold text-slate-900">Fund transfers in period</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / reference</th><th className="px-4 py-3">From / to</th><th className="px-4 py-3">Amount</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{reportTransferPage.rows.map((transfer) => (
                        <tr key={transfer.id}><td className="px-4 py-3">{transfer.transferDate}<span className="block text-xs text-slate-500">{transfer.reference ?? transfer.note ?? "—"}</span></td><td className="px-4 py-3">{transfer.sourceName ?? "Unknown"}<span className="block text-xs text-slate-500">to {transfer.destinationName ?? "Unknown"}</span></td><td className="px-4 py-3 font-semibold">{displayAmount(transfer.amount, transfer.currency)}</td></tr>
                      ))}{!reportTransfers.length && <EmptyRow columns={3} text="No transfers were recorded for this period." />}</tbody>
                    </table>
                  </div>
                  <TablePagination ariaLabel="Accounts report transfers" currentPage={reportTransferPage.page} pageSize={reportTransferPage.pageSize} totalRows={reportTransfers.length}
                    hrefForPage={(page) => pageHref("reportTransfersPage", page)} />
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
  publicId: string;
  transactionType: string;
  transactionDate: string;
  amount: string;
  currency: string;
  description: string;
  payee: string | null;
  reference: string | null;
  status: string;
  accountName: string;
  accountCode: string;
  bankAccountId: number | null;
  bankAccountName: string | null;
  submitterName: string;
  approvedAt: Date | null;
  approverName: string | null;
};

function TransactionTable({
  transactions,
  reviewNeeded,
  schoolName,
}: {
  transactions: TransactionRow[];
  reviewNeeded: TransactionRow[];
  schoolName: string;
}) {
  const reviewIds = new Set(reviewNeeded.map((row) => row.id));
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / description</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status / approval</th><th className="print:hidden px-4 py-3">Receipt</th><th className="print:hidden px-4 py-3">Review</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td className="px-4 py-3"><strong>{transaction.transactionDate}</strong><span className="block text-xs text-slate-500">{transaction.description}{transaction.reference ? ` · Ref: ${transaction.reference}` : ""}</span></td>
            <td className="px-4 py-3">{transaction.accountCode} · {transaction.accountName}</td>
            <td className="px-4 py-3">{transaction.payee ?? "—"}</td>
            <td className="px-4 py-3 font-semibold">{displayAmount(transaction.amount, transaction.currency)}</td>
            <td className="px-4 py-3 capitalize">{transaction.status}<span className="block text-xs text-slate-500">{transaction.approverName ? `By ${transaction.approverName} · ${displayTimestamp(transaction.approvedAt)}` : `Submitted by ${transaction.submitterName}`}</span></td>
            <td className="print:hidden px-4 py-3">{transaction.transactionType === "income" && transaction.status === "approved"
              ? <PrintButton label="Print receipt" targetId={`income-receipt-${transaction.publicId}`} includeQrCode={false} />
              : "—"}</td>
            <td className="print:hidden px-4 py-3">{reviewIds.has(transaction.id) ? <ReviewTransactionForm transactionId={transaction.id} /> : "—"}</td>
          </tr>
        ))}{!transactions.length && <EmptyRow columns={7} text="No income or expense records yet." />}</tbody>
      </table>
      {transactions.filter((transaction) => transaction.transactionType === "income" && transaction.status === "approved").map((transaction) => (
        <article
          key={transaction.publicId}
          id={`income-receipt-${transaction.publicId}`}
          data-print-qr-document=""
          className="hidden space-y-7 bg-white p-8 text-slate-900"
        >
          <header data-print-qr-header="" className="border-b-2 border-violet-700 pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Official income receipt</p>
            <h1 className="mt-2 text-3xl font-bold">{schoolName}</h1>
            <p className="mt-2 text-sm text-slate-600">Receipt no. RCPT-{transaction.publicId.toUpperCase()}</p>
          </header>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <ReceiptField label="Received from" value={transaction.payee ?? "Not specified"} />
            <ReceiptField label="Date received" value={transaction.transactionDate} />
            <ReceiptField label="Income category" value={`${transaction.accountCode} · ${transaction.accountName}`} />
            <ReceiptField label="Deposited into" value={transaction.bankAccountName ?? "Not specified"} />
            <ReceiptField label="Payment reference" value={transaction.reference ?? "Not provided"} />
            <ReceiptField label="Description" value={transaction.description} />
          </dl>
          <p className="border-y border-slate-200 py-5 text-lg font-bold">
            Amount received: {displayAmount(transaction.amount, transaction.currency)}
          </p>
          <footer className="text-sm text-slate-600">
            Approved by {transaction.approverName ?? "Finance"} on {displayTimestamp(transaction.approvedAt)}.
          </footer>
        </article>
      ))}
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-slate-500">{text}</td></tr>;
}
