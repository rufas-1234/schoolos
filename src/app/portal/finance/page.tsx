import Link from "next/link";
import { Children } from "react";
import { and, count, desc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { Banknote, ChartNoAxesCombined, CircleAlert, CreditCard, ReceiptText } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ManagementPortalShell } from "@/app/portal/management-portal-shell";
import { db } from "@/db";
import {
  accountTransactions,
  chartOfAccounts,
  feePaymentReversals,
  feePayments,
  schools,
  studentFeeInvoices,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { parseCostMinorUnits } from "@/lib/inventory-policy";

export const dynamic = "force-dynamic";

function dateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function minorUnits(value: string | null | undefined): bigint {
  if (!value) return BigInt(0);
  const parsed = parseCostMinorUnits(value);
  if (parsed === null) throw new Error("Stored finance amount is invalid.");
  return parsed;
}

function currencyAmount(minor: bigint, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency })
    .format(Number(minor) / 100);
}

export default async function FinancePortalPage() {
  const context = await requireSchoolPermission([
    "accounts.manage",
    "fees.manage",
    "payments.record",
  ]);
  const permissions = new Set(context.grantedPermissions);
  const canManageFees = permissions.has("fees.manage") || permissions.has("payments.record");
  const canManageAccounts = permissions.has("accounts.manage");
  const [school] = await db.select({
    currency: schools.currency,
    timezone: schools.timezone,
  }).from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  const currency = school?.currency ?? "USD";
  const today = dateInTimezone(school?.timezone ?? "UTC");
  const monthStart = `${today.slice(0, 7)}-01`;
  const startAt = new Date(`${monthStart}T00:00:00.000Z`);
  const endAt = new Date(`${today}T23:59:59.999Z`);
  const schoolId = context.schoolId;

  const paymentIncomeQuery = db.select({
    total: sql<string>`COALESCE(SUM(${feePayments.amount} + ${feePayments.fineAmount}), 0)`,
  }).from(feePayments).where(and(
    eq(feePayments.schoolId, schoolId),
    gte(feePayments.paidAt, startAt),
    lte(feePayments.paidAt, endAt),
    sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
  ));
  const reversalIncomeQuery = db.select({
    total: sql<string>`COALESCE(SUM(${feePaymentReversals.amount} + ${feePaymentReversals.fineAmount}), 0)`,
  }).from(feePaymentReversals)
    .innerJoin(feePayments, and(
      eq(feePayments.id, feePaymentReversals.paymentId),
      eq(feePayments.schoolId, schoolId),
    ))
    .where(and(
      eq(feePaymentReversals.schoolId, schoolId),
      gte(feePaymentReversals.createdAt, startAt),
      lte(feePaymentReversals.createdAt, endAt),
      sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
    ));

  const paymentTotals = db.select({
    invoiceId: feePayments.invoiceId,
    paid: sql<string>`COALESCE(SUM(${feePayments.amount} - ${feePayments.reversedAmount}), 0)`.as("paid"),
  }).from(feePayments)
    .where(eq(feePayments.schoolId, schoolId))
    .groupBy(feePayments.invoiceId)
    .as("finance_invoice_payment_totals");
  const fineDue = sql`CASE
    WHEN ${studentFeeInvoices.fineType} = 'none' OR ${studentFeeInvoices.dueDate} >= ${today} THEN 0
    WHEN ${studentFeeInvoices.fineType} = 'fixed' THEN ${studentFeeInvoices.fineValue}
    WHEN ${studentFeeInvoices.fineType} = 'percentage'
      THEN ROUND((${studentFeeInvoices.amount} - ${studentFeeInvoices.discountAmount}) * ${studentFeeInvoices.fineValue} / 100, 2)
    ELSE 0
  END`;
  const totalDue = sql`(${studentFeeInvoices.amount} - ${studentFeeInvoices.discountAmount} + ${fineDue})`;
  const paid = sql`COALESCE(${paymentTotals.paid}, 0)`;
  const balanceMinor = sql<number>`GREATEST(0, ROUND((${totalDue} - ${paid}) * 100))`;

  const [paymentIncome, reversalIncome, invoiceSummary, accountSummary, pendingSummary, recentPayments, recentTransactions] =
    await Promise.all([
      canManageFees ? paymentIncomeQuery : Promise.resolve([{ total: "0" }]),
      canManageFees ? reversalIncomeQuery : Promise.resolve([{ total: "0" }]),
      canManageFees
        ? db.select({
          count: count(),
          balanceMinor: sql<string>`COALESCE(SUM(${balanceMinor}), 0)`,
        }).from(studentFeeInvoices)
          .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, studentFeeInvoices.id))
          .where(and(
            eq(studentFeeInvoices.schoolId, schoolId),
            gt(totalDue, paid),
          ))
        : Promise.resolve([{ count: 0, balanceMinor: "0" }]),
      canManageAccounts
        ? db.select({
          income: sql<string>`COALESCE(SUM(CASE
            WHEN ${accountTransactions.transactionType} = 'income' AND ${chartOfAccounts.code} <> '4000'
              THEN ${accountTransactions.amount}
            ELSE 0
          END), 0)`,
          expenses: sql<string>`COALESCE(SUM(CASE
            WHEN ${accountTransactions.transactionType} = 'expense' THEN ${accountTransactions.amount}
            ELSE 0
          END), 0)`,
        }).from(accountTransactions)
          .innerJoin(chartOfAccounts, and(
            eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
            eq(chartOfAccounts.schoolId, schoolId),
          ))
          .where(and(
            eq(accountTransactions.schoolId, schoolId),
            eq(accountTransactions.status, "approved"),
            gte(accountTransactions.transactionDate, monthStart),
            lte(accountTransactions.transactionDate, today),
          ))
        : Promise.resolve([{ income: "0", expenses: "0" }]),
      canManageAccounts
        ? db.select({ value: count() }).from(accountTransactions).where(and(
          eq(accountTransactions.schoolId, schoolId),
          eq(accountTransactions.status, "pending"),
        ))
        : Promise.resolve([{ value: 0 }]),
      canManageFees
        ? db.select({
          id: feePayments.id,
          receiptNumber: feePayments.receiptNumber,
          amount: feePayments.amount,
          fineAmount: feePayments.fineAmount,
          paidAt: feePayments.paidAt,
        }).from(feePayments)
          .where(and(
            eq(feePayments.schoolId, schoolId),
            sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
          ))
          .orderBy(desc(feePayments.paidAt), desc(feePayments.id))
          .limit(5)
        : Promise.resolve([]),
      canManageAccounts
        ? db.select({
          id: accountTransactions.id,
          transactionType: accountTransactions.transactionType,
          transactionDate: accountTransactions.transactionDate,
          amount: accountTransactions.amount,
          description: accountTransactions.description,
          status: accountTransactions.status,
          accountName: chartOfAccounts.name,
        }).from(accountTransactions)
          .innerJoin(chartOfAccounts, and(
            eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
            eq(chartOfAccounts.schoolId, schoolId),
          ))
          .where(eq(accountTransactions.schoolId, schoolId))
          .orderBy(desc(accountTransactions.createdAt), desc(accountTransactions.id))
          .limit(5)
        : Promise.resolve([]),
    ]);

  const netFees = minorUnits(paymentIncome[0]?.total) - minorUnits(reversalIncome[0]?.total);
  const outstandingBalance = BigInt(invoiceSummary[0]?.balanceMinor ?? "0");
  const outstandingCount = Number(invoiceSummary[0]?.count ?? 0);
  const otherIncome = minorUnits(accountSummary[0]?.income);
  const expenses = minorUnits(accountSummary[0]?.expenses);
  const netSurplus = netFees + otherIncome - expenses;
  const reviewCount = Number(pendingSummary[0]?.value ?? 0);

  return (
    <ManagementPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalType="finance"
      permissions={context.grantedPermissions}
    >
      <main className="print-report-page min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="print:hidden flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-violet-700">School operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Finance overview</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              A single view of fee collections, outstanding balances, and approved accounts activity.
            </p>
          </div>
          <PrintButton targetId="finance-overview-report" label="Print finance summary" />
        </header>

        <section id="finance-overview-report" className="print-report-content space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 print:rounded-none print:border-0 print:p-0">
          <header className="print-report-heading">
            <p className="print-report-kicker">Finance · {context.schoolName}</p>
            <h2>Monthly finance summary</h2>
            <p>{monthStart} through {today} · {currency}</p>
          </header>

          <section aria-label="Monthly finance summary" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {canManageFees && <>
              <SummaryCard label="Net fee collections this month" value={currencyAmount(netFees, currency)} icon={<CreditCard size={19} />} />
              <SummaryCard label={`Outstanding invoices · ${outstandingCount}`} value={currencyAmount(outstandingBalance, currency)} icon={<CircleAlert size={19} />} alert={outstandingBalance > BigInt(0)} />
            </>}
            {canManageAccounts && <>
              <SummaryCard label="Other approved income this month" value={currencyAmount(otherIncome, currency)} icon={<Banknote size={19} />} />
              <SummaryCard label="Approved expenses this month" value={currencyAmount(expenses, currency)} icon={<ReceiptText size={19} />} />
              {canManageFees && <SummaryCard label="Net surplus / (deficit)" value={currencyAmount(netSurplus, currency)} icon={<ChartNoAxesCombined size={19} />} alert={netSurplus < BigInt(0)} />}
            </>}
            {canManageAccounts && <SummaryCard label="Transactions awaiting review" value={String(reviewCount)} icon={<CircleAlert size={19} />} alert={reviewCount > 0} />}
          </section>

          <p className="text-xs leading-relaxed text-slate-500">
            Fee totals are net of recorded reversals. Accounts income and expense totals include approved transactions only; school fee receipts are counted separately to avoid double counting.
          </p>
        </section>

        <section aria-label="Finance workspace shortcuts" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {canManageFees && <>
            <ShortcutCard href="/admin/fees/collection" title="Fee collection" description="Find student invoices, record payments, and review balances." />
            <ShortcutCard href="/admin/fees/reports" title="Fee reports" description="Review fee collections, reversals, and outstanding balances." />
            {permissions.has("fees.manage") && <ShortcutCard href="/admin/fees" title="Fee setup" description="Manage fee structures, discounts, and scholarships." />}
          </>}
          {canManageAccounts && <>
            <ShortcutCard href="/admin/accounts?section=profit" title="Profit & loss" description="Review income and expense totals for a selected period." />
            <ShortcutCard href="/admin/accounts?section=expenses" title="Expenses" description="Record expenses and review approval status." />
            <ShortcutCard href="/admin/accounts?section=bank" title="Bank accounts" description="Review school cash and bank account balances." />
            <ShortcutCard href="/admin/accounts?section=reports" title="Accounts reports" description="Filter, print, and export finance activity." />
          </>}
        </section>

        {(canManageFees || canManageAccounts) && <section className="grid min-w-0 gap-4 xl:grid-cols-2">
          {canManageFees && <ActivityCard
            title="Recent fee receipts"
            href="/admin/fees/reports"
            linkLabel="Open fee reports"
            empty="No fee receipts have been recorded yet."
          >
            {recentPayments.map((payment) => (
              <article key={payment.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-slate-900">{payment.receiptNumber}</h3>
                  <p className="mt-1 text-xs text-slate-500">{payment.paidAt.toLocaleDateString()}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-800">
                  {currencyAmount(minorUnits(payment.amount) + minorUnits(payment.fineAmount), currency)}
                </span>
              </article>
            ))}
          </ActivityCard>}
          {canManageAccounts && <ActivityCard
            title="Recent account activity"
            href="/admin/accounts?section=reports"
            linkLabel="Open accounts reports"
            empty="No accounting transactions have been recorded yet."
          >
            {recentTransactions.map((transaction) => (
              <article key={transaction.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-slate-900">{transaction.description}</h3>
                  <p className="mt-1 break-words text-xs text-slate-500">
                    {transaction.transactionDate} · {transaction.accountName} · {transaction.status}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-800">
                  {currencyAmount(minorUnits(transaction.amount), currency)}
                </span>
              </article>
            ))}
          </ActivityCard>}
        </section>}
      </main>
    </ManagementPortalShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 text-sm font-medium leading-snug text-slate-600">{label}</p>
      <span className={alert ? "shrink-0 text-rose-600" : "shrink-0 text-violet-700"}>{icon}</span>
    </div>
    <p className={`mt-3 break-words text-xl font-bold tabular-nums sm:text-2xl ${alert ? "text-rose-700" : "text-slate-950"}`}>{value}</p>
  </article>;
}

function ShortcutCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return <Link href={href}
    className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700">
    <h2 className="break-words font-semibold text-slate-950">{title}</h2>
    <p className="mt-1 break-words text-sm text-slate-600">{description}</p>
  </Link>;
}

function ActivityCard({
  title,
  href,
  linkLabel,
  empty,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  empty: string;
  children: React.ReactNode;
}) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <Link href={href} className="text-sm font-semibold text-violet-700">{linkLabel}</Link>
    </header>
    <div className="space-y-2 p-3 sm:p-4">
      {Children.count(children) > 0 ? children : <p className="py-5 text-center text-sm text-slate-500">{empty}</p>}
    </div>
  </section>;
}
