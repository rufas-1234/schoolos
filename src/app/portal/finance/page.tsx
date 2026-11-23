import Link from "next/link";
import { Children } from "react";
import { and, count, desc, eq, gt, gte, lte, sql } from "drizzle-orm";
import {
  Banknote,
  ChartNoAxesCombined,
  CircleAlert,
  CreditCard,
  Landmark,
  PackageOpen,
  ReceiptText,
} from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ManagementPortalShell } from "@/app/portal/management-portal-shell";
import { db } from "@/db";
import {
  accountTransactions,
  chartOfAccounts,
  feePaymentReversals,
  feePayments,
  fundTransfers,
  inventoryAssets,
  inventoryItems,
  inventoryMovements,
  schoolCurrencies,
  schoolBankAccounts,
  schools,
  studentFeeInvoices,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  buildFinanceTrend,
  getFinanceMonthKeys,
  type FinanceMonthTransaction,
} from "@/lib/finance-overview";
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
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Number(minor) / 100);
}

export default async function FinancePortalPage() {
  const context = await requireSchoolPermission([
    "accounts.manage",
    "fees.manage",
    "payments.record",
    "inventory.manage",
  ]);
  const permissions = new Set(context.grantedPermissions);
  const canManageFees = permissions.has("fees.manage") || permissions.has("payments.record");
  const canManageAccounts = permissions.has("accounts.manage");
  const canManageInventory = permissions.has("inventory.manage");
  const [school] = await db.select({
    currency: schools.currency,
    timezone: schools.timezone,
  }).from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  const currency = school?.currency ?? "USD";
  const configuredCurrencies = await db.select({
    code: schoolCurrencies.code,
    name: schoolCurrencies.name,
  }).from(schoolCurrencies).where(eq(schoolCurrencies.schoolId, context.schoolId));
  const today = dateInTimezone(school?.timezone ?? "UTC");
  const monthStart = `${today.slice(0, 7)}-01`;
  const startAt = new Date(`${monthStart}T00:00:00.000Z`);
  const endAt = new Date(`${today}T23:59:59.999Z`);
  const trendMonths = getFinanceMonthKeys(today, 6);
  const trendStartMonth = trendMonths[0];
  const trendStartAt = new Date(`${trendStartMonth}-01T00:00:00.000Z`);
  const schoolId = context.schoolId;

  const paymentIncomeQuery = db.select({
    currency: studentFeeInvoices.currency,
    total: sql<string>`COALESCE(SUM(${feePayments.amount} + ${feePayments.fineAmount}), 0)`,
  }).from(feePayments)
    .innerJoin(studentFeeInvoices, and(
      eq(studentFeeInvoices.id, feePayments.invoiceId),
      eq(studentFeeInvoices.schoolId, schoolId),
    ))
    .where(and(
    eq(feePayments.schoolId, schoolId),
    gte(feePayments.paidAt, startAt),
    lte(feePayments.paidAt, endAt),
    sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
  )).groupBy(studentFeeInvoices.currency);
  const reversalIncomeQuery = db.select({
    currency: studentFeeInvoices.currency,
    total: sql<string>`COALESCE(SUM(${feePaymentReversals.amount} + ${feePaymentReversals.fineAmount}), 0)`,
  }).from(feePaymentReversals)
    .innerJoin(feePayments, and(
      eq(feePayments.id, feePaymentReversals.paymentId),
      eq(feePayments.schoolId, schoolId),
    ))
    .innerJoin(studentFeeInvoices, and(
      eq(studentFeeInvoices.id, feePayments.invoiceId),
      eq(studentFeeInvoices.schoolId, schoolId),
    ))
    .where(and(
      eq(feePaymentReversals.schoolId, schoolId),
      gte(feePaymentReversals.createdAt, startAt),
      lte(feePaymentReversals.createdAt, endAt),
      sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
    )).groupBy(studentFeeInvoices.currency);

  const paymentTrendQuery = db.select({
    month: sql<string>`DATE_FORMAT(${feePayments.paidAt}, '%Y-%m')`,
    currency: studentFeeInvoices.currency,
    amount: sql<string>`COALESCE(SUM(${feePayments.amount} + ${feePayments.fineAmount}), 0)`,
  }).from(feePayments)
    .innerJoin(studentFeeInvoices, and(
      eq(studentFeeInvoices.id, feePayments.invoiceId),
      eq(studentFeeInvoices.schoolId, schoolId),
    ))
    .where(and(
      eq(feePayments.schoolId, schoolId),
      gte(feePayments.paidAt, trendStartAt),
      lte(feePayments.paidAt, endAt),
      sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
    ))
    .groupBy(sql`DATE_FORMAT(${feePayments.paidAt}, '%Y-%m')`, studentFeeInvoices.currency);
  const reversalTrendQuery = db.select({
    month: sql<string>`DATE_FORMAT(${feePaymentReversals.createdAt}, '%Y-%m')`,
    currency: studentFeeInvoices.currency,
    amount: sql<string>`COALESCE(SUM(${feePaymentReversals.amount} + ${feePaymentReversals.fineAmount}), 0)`,
  }).from(feePaymentReversals)
    .innerJoin(feePayments, and(
      eq(feePayments.id, feePaymentReversals.paymentId),
      eq(feePayments.schoolId, schoolId),
    ))
    .innerJoin(studentFeeInvoices, and(
      eq(studentFeeInvoices.id, feePayments.invoiceId),
      eq(studentFeeInvoices.schoolId, schoolId),
    ))
    .where(and(
      eq(feePaymentReversals.schoolId, schoolId),
      gte(feePaymentReversals.createdAt, trendStartAt),
      lte(feePaymentReversals.createdAt, endAt),
      sql`(${feePayments.notes} IS NULL OR ${feePayments.notes} NOT LIKE 'TEST DATA ONLY -%')`,
    ))
    .groupBy(sql`DATE_FORMAT(${feePaymentReversals.createdAt}, '%Y-%m')`, studentFeeInvoices.currency);
  const accountTrendQuery = db.select({
    month: sql<string>`DATE_FORMAT(${accountTransactions.transactionDate}, '%Y-%m')`,
    currency: accountTransactions.currency,
    transactionType: accountTransactions.transactionType,
    amount: sql<string>`COALESCE(SUM(${accountTransactions.amount}), 0)`,
  }).from(accountTransactions)
    .innerJoin(chartOfAccounts, and(
      eq(chartOfAccounts.id, accountTransactions.categoryAccountId),
      eq(chartOfAccounts.schoolId, schoolId),
    ))
    .where(and(
      eq(accountTransactions.schoolId, schoolId),
      eq(accountTransactions.status, "approved"),
      gte(accountTransactions.transactionDate, `${trendStartMonth}-01`),
      lte(accountTransactions.transactionDate, today),
      sql`(${accountTransactions.transactionType} <> 'income' OR ${chartOfAccounts.code} <> '4000')`,
    ))
    .groupBy(
      sql`DATE_FORMAT(${accountTransactions.transactionDate}, '%Y-%m')`,
      accountTransactions.currency,
      accountTransactions.transactionType,
    );

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

  const [
    paymentIncome,
    reversalIncome,
    invoiceSummary,
    accountSummary,
    pendingSummary,
    recentPayments,
    recentTransactions,
    inventorySummary,
    recentInventoryMovements,
    paymentTrend,
    reversalTrend,
    accountTrend,
    bankAccounts,
    bankTransactionTotals,
    transferDebits,
    transferCredits,
  ] =
    await Promise.all([
      canManageFees ? paymentIncomeQuery : Promise.resolve([] as Array<{ currency: string; total: string }>),
      canManageFees ? reversalIncomeQuery : Promise.resolve([] as Array<{ currency: string; total: string }>),
      canManageFees
        ? db.select({
          currency: studentFeeInvoices.currency,
          count: count(),
          balanceMinor: sql<string>`COALESCE(SUM(${balanceMinor}), 0)`,
          overdueCount: sql<number>`COALESCE(SUM(CASE WHEN ${studentFeeInvoices.dueDate} < ${today} THEN 1 ELSE 0 END), 0)`,
          overdueBalanceMinor: sql<string>`COALESCE(SUM(CASE WHEN ${studentFeeInvoices.dueDate} < ${today} THEN ${balanceMinor} ELSE 0 END), 0)`,
        }).from(studentFeeInvoices)
          .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, studentFeeInvoices.id))
          .where(and(
            eq(studentFeeInvoices.schoolId, schoolId),
            gt(totalDue, paid),
          )).groupBy(studentFeeInvoices.currency)
        : Promise.resolve([]),
      canManageAccounts
        ? db.select({
          currency: accountTransactions.currency,
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
          )).groupBy(accountTransactions.currency)
        : Promise.resolve([] as Array<{ currency: string; income: string; expenses: string }>),
      canManageAccounts
        ? db.select({
          currency: accountTransactions.currency,
          value: count(),
          amount: sql<string>`COALESCE(SUM(${accountTransactions.amount}), 0)`,
        }).from(accountTransactions).where(and(
          eq(accountTransactions.schoolId, schoolId),
          eq(accountTransactions.status, "pending"),
        )).groupBy(accountTransactions.currency)
        : Promise.resolve([]),
      canManageFees
        ? db.select({
          id: feePayments.id,
          receiptNumber: feePayments.receiptNumber,
          amount: feePayments.amount,
          fineAmount: feePayments.fineAmount,
          currency: studentFeeInvoices.currency,
          paidAt: feePayments.paidAt,
        }).from(feePayments)
          .innerJoin(studentFeeInvoices, and(
            eq(studentFeeInvoices.id, feePayments.invoiceId),
            eq(studentFeeInvoices.schoolId, schoolId),
          ))
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
          currency: accountTransactions.currency,
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
      canManageInventory
        ? Promise.all([
          db.select({
            itemCount: count(),
            lowStockCount: sql<number>`COALESCE(SUM(CASE WHEN ${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel} THEN 1 ELSE 0 END), 0)`,
            stockValue: sql<string>`ROUND(COALESCE(SUM(${inventoryItems.quantityOnHand} * ${inventoryItems.averageUnitCost}), 0), 2)`,
          }).from(inventoryItems).where(and(
            eq(inventoryItems.schoolId, schoolId),
            eq(inventoryItems.status, "active"),
          )),
          db.select({
            assetCount: count(),
            assetValue: sql<string>`COALESCE(SUM(${inventoryAssets.acquisitionCost}), 0)`,
          }).from(inventoryAssets).where(and(
            eq(inventoryAssets.schoolId, schoolId),
            eq(inventoryAssets.status, "active"),
          )),
        ])
        : Promise.resolve([
          [{ itemCount: 0, lowStockCount: 0, stockValue: "0" }],
          [{ assetCount: 0, assetValue: "0" }],
        ] as const),
      canManageInventory
        ? db.select({
          id: inventoryMovements.id,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          movementType: inventoryMovements.movementType,
          quantity: inventoryMovements.quantity,
          reference: inventoryMovements.reference,
          createdAt: inventoryMovements.createdAt,
        }).from(inventoryMovements)
          .innerJoin(inventoryItems, and(
            eq(inventoryItems.id, inventoryMovements.itemId),
            eq(inventoryItems.schoolId, schoolId),
          ))
          .where(eq(inventoryMovements.schoolId, schoolId))
          .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
          .limit(5)
        : Promise.resolve([]),
      canManageFees ? paymentTrendQuery : Promise.resolve([]),
      canManageFees ? reversalTrendQuery : Promise.resolve([]),
      canManageAccounts ? accountTrendQuery : Promise.resolve([]),
      canManageAccounts
        ? db.select({
          id: schoolBankAccounts.id,
          accountName: schoolBankAccounts.accountName,
          bankName: schoolBankAccounts.bankName,
          accountNumberLast4: schoolBankAccounts.accountNumberLast4,
          currency: schoolBankAccounts.currency,
          openingBalance: schoolBankAccounts.openingBalance,
        }).from(schoolBankAccounts).where(and(
          eq(schoolBankAccounts.schoolId, schoolId),
          eq(schoolBankAccounts.status, "active"),
        )).orderBy(schoolBankAccounts.accountName)
        : Promise.resolve([]),
      canManageAccounts
        ? db.select({
          bankAccountId: accountTransactions.bankAccountId,
          income: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransactions.transactionType} = 'income' THEN ${accountTransactions.amount} ELSE 0 END), 0)`,
          expenses: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransactions.transactionType} = 'expense' THEN ${accountTransactions.amount} ELSE 0 END), 0)`,
        }).from(accountTransactions).where(and(
          eq(accountTransactions.schoolId, schoolId),
          eq(accountTransactions.status, "approved"),
        )).groupBy(accountTransactions.bankAccountId)
        : Promise.resolve([]),
      canManageAccounts
        ? db.select({
          bankAccountId: fundTransfers.sourceBankAccountId,
          amount: sql<string>`COALESCE(SUM(${fundTransfers.amount}), 0)`,
        }).from(fundTransfers)
          .where(eq(fundTransfers.schoolId, schoolId))
          .groupBy(fundTransfers.sourceBankAccountId)
        : Promise.resolve([]),
      canManageAccounts
        ? db.select({
          bankAccountId: fundTransfers.destinationBankAccountId,
          amount: sql<string>`COALESCE(SUM(${fundTransfers.amount}), 0)`,
        }).from(fundTransfers)
          .where(eq(fundTransfers.schoolId, schoolId))
          .groupBy(fundTransfers.destinationBankAccountId)
        : Promise.resolve([]),
    ]);

  const accountTrendRows: FinanceMonthTransaction[] = accountTrend.map((row) => {
    if (row.transactionType !== "income" && row.transactionType !== "expense") {
      throw new Error("Stored accounting transaction type is invalid.");
    }
    return {
      month: row.month,
      currency: row.currency,
      transactionType: row.transactionType,
      amount: row.amount,
    };
  });
  const bankActivity = new Map<number, { income: bigint; expenses: bigint }>();
  for (const row of bankTransactionTotals) {
    if (row.bankAccountId === null) continue;
    bankActivity.set(row.bankAccountId, {
      income: minorUnits(row.income),
      expenses: minorUnits(row.expenses),
    });
  }
  const debitTotals = new Map(transferDebits.map((row) => [row.bankAccountId, minorUnits(row.amount)]));
  const creditTotals = new Map(transferCredits.map((row) => [row.bankAccountId, minorUnits(row.amount)]));
  const bankBalances = new Map(bankAccounts.map((bank) => {
    const activity = bankActivity.get(bank.id) ?? { income: BigInt(0), expenses: BigInt(0) };
    const balance = minorUnits(bank.openingBalance)
      + activity.income
      - activity.expenses
      - (debitTotals.get(bank.id) ?? BigInt(0))
      + (creditTotals.get(bank.id) ?? BigInt(0));
    return [bank.id, balance] as const;
  }));
  const currencies = new Set([
    currency,
    ...configuredCurrencies.map((item) => item.code),
    ...paymentIncome.map((item) => item.currency),
    ...invoiceSummary.map((item) => item.currency),
    ...accountSummary.map((item) => item.currency),
    ...pendingSummary.map((item) => item.currency),
    ...bankAccounts.map((item) => item.currency),
    ...paymentTrend.map((item) => item.currency),
    ...reversalTrend.map((item) => item.currency),
    ...accountTrendRows.map((item) => item.currency),
  ]);
  const financeSummaries = [...currencies].sort().map((code) => {
    const netFees = paymentIncome.filter((row) => row.currency === code)
      .reduce((total, row) => total + minorUnits(row.total), BigInt(0))
      - reversalIncome.filter((row) => row.currency === code)
        .reduce((total, row) => total + minorUnits(row.total), BigInt(0));
    const outstanding = invoiceSummary.find((row) => row.currency === code);
    const account = accountSummary.find((row) => row.currency === code);
    const pending = pendingSummary.find((row) => row.currency === code);
    const matchingBankAccounts = bankAccounts.filter((row) => row.currency === code);
    const otherIncome = minorUnits(account?.income);
    const expenses = minorUnits(account?.expenses);
    return {
      code,
      name: configuredCurrencies.find((item) => item.code === code)?.name ?? code,
      netFees,
      outstandingBalance: BigInt(outstanding?.balanceMinor ?? "0"),
      outstandingCount: Number(outstanding?.count ?? 0),
      overdueBalance: BigInt(outstanding?.overdueBalanceMinor ?? "0"),
      overdueCount: Number(outstanding?.overdueCount ?? 0),
      otherIncome,
      totalIncome: netFees + otherIncome,
      expenses,
      netSurplus: netFees + otherIncome - expenses,
      pendingCount: Number(pending?.value ?? 0),
      pendingAmount: minorUnits(pending?.amount),
      bankAccountCount: matchingBankAccounts.length,
      bankBalance: matchingBankAccounts.reduce(
        (total, bank) => total + (bankBalances.get(bank.id) ?? BigInt(0)),
        BigInt(0),
      ),
      trend: buildFinanceTrend(trendMonths, code, paymentTrend, reversalTrend, accountTrendRows),
    };
  });
  const reviewCount = pendingSummary.reduce((total, row) => total + Number(row.value), 0);
  const [inventoryCounts, assetCounts] = inventorySummary;
  const activeStockCount = Number(inventoryCounts[0]?.itemCount ?? 0);
  const lowStockCount = Number(inventoryCounts[0]?.lowStockCount ?? 0);
  const stockValue = minorUnits(inventoryCounts[0]?.stockValue);
  const activeAssetCount = Number(assetCounts[0]?.assetCount ?? 0);
  const assetValue = minorUnits(assetCounts[0]?.assetValue);

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
              A single view of fee collections, account activity, and school stock and assets.
            </p>
          </div>
          <PrintButton targetId="finance-overview-report" label="Print finance summary" />
        </header>

        <section id="finance-overview-report" className="print-report-content space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 print:rounded-none print:border-0 print:p-0">
          <header className="print-report-heading">
            <p className="print-report-kicker">Finance · {context.schoolName}</p>
            <h2>Finance dashboard</h2>
            <p>Month to date: {monthStart} through {today} · six-month trend · amounts shown by currency</p>
          </header>

          {financeSummaries.map((summary) => (
            <section key={summary.code} aria-label={`${summary.name} monthly finance summary`} className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {summary.code} · {summary.name}
              </h3>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {canManageFees && <>
                  <SummaryCard label="Net fee collections · month to date" value={currencyAmount(summary.netFees, summary.code)} icon={<CreditCard size={19} />} />
                  <SummaryCard label={`Outstanding fees · ${summary.outstandingCount} invoices`} value={currencyAmount(summary.outstandingBalance, summary.code)} icon={<CircleAlert size={19} />} alert={summary.outstandingBalance > BigInt(0)} />
                  <SummaryCard label={`Overdue fees · ${summary.overdueCount} invoices`} value={currencyAmount(summary.overdueBalance, summary.code)} icon={<CircleAlert size={19} />} alert={summary.overdueBalance > BigInt(0)} />
                </>}
                {canManageAccounts && <>
                  {canManageFees && <SummaryCard label="Total operating income · month to date" value={currencyAmount(summary.totalIncome, summary.code)} icon={<Banknote size={19} />} />}
                  <SummaryCard label="Other approved income · month to date" value={currencyAmount(summary.otherIncome, summary.code)} icon={<Banknote size={19} />} />
                  <SummaryCard label="Approved expenses · month to date" value={currencyAmount(summary.expenses, summary.code)} icon={<ReceiptText size={19} />} />
                  {canManageFees && <SummaryCard label="Operating surplus / (deficit) · month to date" value={currencyAmount(summary.netSurplus, summary.code)} icon={<ChartNoAxesCombined size={19} />} alert={summary.netSurplus < BigInt(0)} />}
                  <SummaryCard label={`Awaiting review · ${summary.pendingCount} transactions`} value={currencyAmount(summary.pendingAmount, summary.code)} icon={<CircleAlert size={19} />} alert={summary.pendingCount > 0} />
                  <SummaryCard label={`Cash & bank · ${summary.bankAccountCount} active accounts`} value={currencyAmount(summary.bankBalance, summary.code)} icon={<Landmark size={19} />} alert={summary.bankBalance < BigInt(0)} />
                </>}
              </div>
              {(canManageFees || canManageAccounts) && (
                <FinanceTrendChart currency={summary.code} points={summary.trend} />
              )}
            </section>
          ))}

          {canManageInventory && <section aria-label="Inventory and asset snapshot" className="space-y-3 border-t border-slate-100 pt-5">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Inventory snapshot</h3>
              <p className="mt-1 text-xs text-slate-500">Active stock valued at average cost; assets shown at acquisition cost.</p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Active stock items" value={String(activeStockCount)} icon={<PackageOpen size={19} />} />
              <SummaryCard label="Stock value" value={currencyAmount(stockValue, currency)} icon={<PackageOpen size={19} />} />
              <SummaryCard label="Items at or below reorder level" value={String(lowStockCount)} icon={<CircleAlert size={19} />} alert={lowStockCount > 0} />
              <SummaryCard label={`Active assets · ${activeAssetCount}`} value={currencyAmount(assetValue, currency)} icon={<Banknote size={19} />} />
            </div>
          </section>}

          {canManageAccounts && bankAccounts.length > 0 && (
            <section aria-label="Bank account balances" className="space-y-3 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Cash and bank position</h3>
                  <p className="mt-1 text-xs text-slate-500">Opening balances plus approved activity and completed transfers.</p>
                </div>
                <Link href="/admin/accounts?section=bank" className="text-sm font-semibold text-violet-700">Manage bank accounts</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {bankAccounts.map((bank) => (
                  <article key={bank.id} className="min-w-0 rounded-xl border border-slate-100 p-4">
                    <p className="break-words text-sm font-semibold text-slate-900">{bank.accountName}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {bank.bankName}{bank.accountNumberLast4 ? ` ···· ${bank.accountNumberLast4}` : ""} · {bank.currency}
                    </p>
                    <p className="mt-3 break-words text-lg font-bold tabular-nums text-slate-950">
                      {currencyAmount(bankBalances.get(bank.id) ?? BigInt(0), bank.currency)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            Fee totals subtract reversals. Operating income and expenses include approved transactions only; fee receipts are shown separately to avoid double counting.
          </p>
        </section>

        {canManageAccounts && reviewCount > 0 && (
          <aside className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CircleAlert size={18} />
              {reviewCount} transaction{reviewCount === 1 ? "" : "s"} awaiting approval
            </p>
            <Link href="/admin/accounts?section=reports&status=pending" className="text-sm font-bold underline underline-offset-2">
              Review transactions
            </Link>
          </aside>
        )}

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
          {canManageInventory && <>
            <ShortcutCard href="/admin/inventory" title="Inventory" description="Open stock levels, items, and recent movements." />
            <ShortcutCard href="/admin/inventory?view=assets" title="Assets" description="Review registered assets, value, and locations." />
          </>}
        </section>

        {(canManageFees || canManageAccounts || canManageInventory) && <section className="grid min-w-0 gap-4 xl:grid-cols-2">
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
                  {currencyAmount(minorUnits(payment.amount) + minorUnits(payment.fineAmount), payment.currency)}
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
                  {currencyAmount(minorUnits(transaction.amount), transaction.currency)}
                </span>
              </article>
            ))}
          </ActivityCard>}
          {canManageInventory && <ActivityCard
            title="Recent stock movements"
            href="/admin/inventory?view=movements"
            linkLabel="Open inventory"
            empty="No stock movements have been recorded yet."
          >
            {recentInventoryMovements.map((movement) => (
              <article key={movement.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-slate-900">{movement.name} <span className="font-normal text-slate-500">· {movement.sku}</span></h3>
                  <p className="mt-1 break-words text-xs capitalize text-slate-500">
                    {movement.movementType.replaceAll("_", " ")} · {movement.createdAt.toLocaleDateString()}{movement.reference ? ` · Ref: ${movement.reference}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-800">{movement.quantity}</span>
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

function FinanceTrendChart({
  currency,
  points,
}: {
  currency: string;
  points: ReturnType<typeof buildFinanceTrend>;
}) {
  const maximum = points.reduce((largest, point) => {
    const income = point.feeCollections + point.otherIncome;
    return [income, point.expenses].reduce(
      (current, value) => value > current ? value : current,
      largest,
    );
  }, BigInt(0));
  const barHeight = (value: bigint) => {
    if (value <= BigInt(0) || maximum <= BigInt(0)) return 0;
    return Math.max(3, Number(value * BigInt(100) / maximum));
  };
  const chartDescription = points.map((point) => {
    const month = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" })
      .format(new Date(`${point.month}-01T00:00:00.000Z`));
    const income = point.feeCollections + point.otherIncome;
    return `${month}: income ${currencyAmount(income, currency)}, expenses ${currencyAmount(point.expenses, currency)}`;
  }).join("; ");

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-label={`${currency} six-month trend`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-900">Six-month income and expense trend</h4>
          <p className="mt-1 text-xs text-slate-500">Income is net fee receipts plus other approved income.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-600" />Income</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Expenses</span>
        </div>
      </div>
      <div
        className="mt-4 grid grid-cols-3 items-end gap-3 sm:grid-cols-6"
        role="img"
        aria-label={`${currency} income and expenses by month. ${chartDescription}`}
      >
        {points.map((point) => {
          const income = point.feeCollections + point.otherIncome;
          const monthLabel = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
            .format(new Date(`${point.month}-01T00:00:00.000Z`));
          return (
            <div key={point.month} className="min-w-0 text-center">
              <div className="flex h-28 items-end justify-center gap-1 border-b border-slate-200 px-1">
                <span
                  className="w-3 rounded-t bg-violet-600 sm:w-4"
                  style={{ height: `${barHeight(income)}%` }}
                  title={`Income ${currencyAmount(income, currency)}`}
                />
                <span
                  className="w-3 rounded-t bg-rose-500 sm:w-4"
                  style={{ height: `${barHeight(point.expenses)}%` }}
                  title={`Expenses ${currencyAmount(point.expenses, currency)}`}
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">{monthLabel}</p>
              <p className="mt-1 truncate text-[10px] tabular-nums text-slate-500" title={currencyAmount(income, currency)}>
                {currencyAmount(income, currency)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
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
