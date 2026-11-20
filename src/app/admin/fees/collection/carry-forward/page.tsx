import { and, asc, count, desc, eq, gt, inArray, like, or, sql, sum } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AdminActionDialog, AdminDataTable } from "@/components/admin-data-table";
import { PaginationPageSize } from "@/components/pagination-page-size";
import { parsePageSize } from "@/components/pagination-utils";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
  feeAdvanceTransactions,
  feePayments,
  feeStructures,
  feeTypes,
  schools,
  schoolCurrencies,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { requireSchoolPermission } from "@/lib/access-control";
import { calculateFineMinorUnits, parseMoneyToMinorUnits } from "@/lib/fees-policy";
import { ApplyFeeAdvanceCreditForm, RecordFeeAdvanceCreditForm, type CurrencyOption, type FeeOption } from "../../fee-forms";

type SearchParams = { search?: string | string[]; page?: string | string[]; pageSize?: string | string[] };

function money(minor: number) {
  return (minor / 100).toFixed(2);
}

function minorUnits(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function FeeCarryForwardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const pageSize = parsePageSize(params.pageSize);
  const requestedPage = typeof params.page === "string" && /^\d+$/.test(params.page)
    ? Math.max(1, Number(params.page))
    : 1;
  const [school] = await db.select({ currency: schools.currency, timezone: schools.timezone })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  const currency = school?.currency ?? "";
  const currencyRows = await db.select({
    code: schoolCurrencies.code,
    name: schoolCurrencies.name,
    symbol: schoolCurrencies.symbol,
  }).from(schoolCurrencies).where(eq(schoolCurrencies.schoolId, context.schoolId));
  const currencyOptions: CurrencyOption[] = currencyRows.map((item) => ({
    value: item.code,
    label: `${item.code} · ${item.name} (${item.symbol})`,
  }));
  const currencyNames = new Map(currencyRows.map((item) => [item.code, item.name]));
  const today = todayInTimezone(school?.timezone ?? "UTC");

  const creditBalances = db.select({
    studentId: feeAdvanceTransactions.studentId,
    currency: feeAdvanceTransactions.currency,
    balanceMinor: sql<string>`SUM(CASE WHEN ${feeAdvanceTransactions.transactionType} = 'applied'
      THEN -ROUND(${feeAdvanceTransactions.amount} * 100)
      ELSE ROUND(${feeAdvanceTransactions.amount} * 100) END)`.as("balanceMinor"),
  }).from(feeAdvanceTransactions)
    .where(eq(feeAdvanceTransactions.schoolId, context.schoolId))
    .groupBy(feeAdvanceTransactions.studentId, feeAdvanceTransactions.currency)
    .as("fee_advance_balances");
  const searchFilter = search ? or(
    like(students.firstName, `%${search}%`),
    like(students.lastName, `%${search}%`),
    like(students.admissionNumber, `%${search}%`),
    like(sql`concat(${students.firstName}, ' ', ${students.lastName})`, `%${search}%`),
  ) : undefined;
  const creditConditions = and(gt(creditBalances.balanceMinor, sql`0`), searchFilter);
  const [countRows, totalRows, activeEnrollmentRows, recentTransactions] = await Promise.all([
    db.select({ total: count() }).from(creditBalances)
      .innerJoin(students, and(
        eq(students.id, creditBalances.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .where(creditConditions),
    db.select({ currency: creditBalances.currency, totalMinor: sum(creditBalances.balanceMinor) })
      .from(creditBalances).where(gt(creditBalances.balanceMinor, sql`0`))
      .groupBy(creditBalances.currency),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      className: classLevels.name,
      sectionName: classSections.name,
      yearName: academicYears.name,
    }).from(studentEnrollments)
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
        eq(students.status, "active"),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, studentEnrollments.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
        eq(academicYears.status, "active"),
      ))
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.status, "enrolled"),
      ))
      .orderBy(asc(students.lastName), asc(students.firstName)),
    db.select({
      publicId: feeAdvanceTransactions.publicId,
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      transactionType: feeAdvanceTransactions.transactionType,
      currency: feeAdvanceTransactions.currency,
      amount: feeAdvanceTransactions.amount,
      receiptNumber: feeAdvanceTransactions.receiptNumber,
      reference: feeAdvanceTransactions.reference,
      notes: feeAdvanceTransactions.notes,
      createdAt: feeAdvanceTransactions.createdAt,
      invoiceNumber: studentFeeInvoices.invoiceNumber,
      paymentPublicId: feePayments.publicId,
    }).from(feeAdvanceTransactions)
      .innerJoin(students, and(
        eq(students.id, feeAdvanceTransactions.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .leftJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feeAdvanceTransactions.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      ))
      .leftJoin(feePayments, and(
        eq(feePayments.id, feeAdvanceTransactions.paymentId),
        eq(feePayments.schoolId, context.schoolId),
      ))
      .where(eq(feeAdvanceTransactions.schoolId, context.schoolId))
      .orderBy(desc(feeAdvanceTransactions.createdAt), desc(feeAdvanceTransactions.id))
      .limit(100),
  ]);

  const totalCount = Number(countRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const creditRows = await db.select({
    studentId: students.id,
    currency: creditBalances.currency,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    balanceMinor: creditBalances.balanceMinor,
  }).from(creditBalances)
    .innerJoin(students, and(
      eq(students.id, creditBalances.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .where(creditConditions)
    .orderBy(asc(students.lastName), asc(students.firstName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const activeStudents = new Map<number, FeeOption>();
  for (const enrollment of activeEnrollmentRows) {
    if (!activeStudents.has(enrollment.id)) {
      activeStudents.set(enrollment.id, {
        id: enrollment.id,
        label: `${enrollment.firstName} ${enrollment.lastName} · ${enrollment.admissionNumber || "No admission number"} · ${enrollment.className} ${enrollment.sectionName} · ${enrollment.yearName}`,
      });
    }
  }
  const studentIds = creditRows.map((student) => student.studentId);
  const invoicesByStudent = new Map<string, FeeOption[]>();
  if (studentIds.length) {
    const paymentTotals = db.select({
      invoiceId: feePayments.invoiceId,
      paid: sql<string>`COALESCE(SUM(${feePayments.amount} - ${feePayments.reversedAmount}), 0)`.as("paid"),
    }).from(feePayments)
      .where(eq(feePayments.schoolId, context.schoolId))
      .groupBy(feePayments.invoiceId)
      .as("advance_invoice_payment_totals");
    const invoices = await db.select({
      id: studentFeeInvoices.id,
      studentId: studentFeeInvoices.studentId,
      currency: studentFeeInvoices.currency,
      invoiceNumber: studentFeeInvoices.invoiceNumber,
      amount: studentFeeInvoices.amount,
      discountAmount: studentFeeInvoices.discountAmount,
      fineType: studentFeeInvoices.fineType,
      fineValue: studentFeeInvoices.fineValue,
      dueDate: studentFeeInvoices.dueDate,
      yearName: academicYears.name,
      termName: academicTerms.name,
      feeTypeName: feeTypes.name,
      paidAmount: paymentTotals.paid,
    }).from(studentFeeInvoices)
      .innerJoin(feeStructures, and(
        eq(feeStructures.id, studentFeeInvoices.feeStructureId),
        eq(feeStructures.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, feeStructures.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .leftJoin(academicTerms, eq(academicTerms.id, feeStructures.academicTermId))
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, studentFeeInvoices.id))
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        inArray(studentFeeInvoices.studentId, studentIds),
      ))
      .orderBy(asc(studentFeeInvoices.dueDate), asc(studentFeeInvoices.id));
    for (const invoice of invoices) {
      const amount = parseMoneyToMinorUnits(invoice.amount);
      const discount = parseMoneyToMinorUnits(invoice.discountAmount);
      const paid = parseMoneyToMinorUnits(invoice.paidAmount ?? "0");
      if (amount === null || discount === null || paid === null) continue;
      const fine = today > invoice.dueDate
        ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue)
        : 0;
      if (fine === null) continue;
      const balance = amount - discount + fine - paid;
      if (balance <= 0) continue;
      const key = `${invoice.studentId}:${invoice.currency}`;
      const options = invoicesByStudent.get(key) ?? [];
      options.push({
        id: invoice.id,
        label: `${invoice.invoiceNumber} · ${invoice.feeTypeName}${invoice.termName ? ` · ${invoice.termName}` : ""} · ${invoice.yearName} · ${invoice.currency} ${money(balance)} due`,
      });
      invoicesByStudent.set(key, options);
    }
  }

  const studentsForAdvance = [...activeStudents.values()];
  const activityRows = recentTransactions.map((transaction) => {
    const amountMinor = parseMoneyToMinorUnits(transaction.amount) ?? 0;
    const isApplied = transaction.transactionType === "applied";
    const isRestored = transaction.transactionType === "restored";
    return {
      id: transaction.publicId,
      searchableText: [transaction.firstName, transaction.lastName, transaction.admissionNumber,
        transaction.receiptNumber, transaction.reference, transaction.invoiceNumber, transaction.notes].filter(Boolean).join(" "),
      values: {
        student: `${transaction.firstName} ${transaction.lastName}`,
        admission: transaction.admissionNumber ?? "",
        activity: isApplied ? "Credit applied" : isRestored ? "Credit restored" : "Advance received",
        amount: `${isApplied ? "−" : isRestored ? "+" : ""}${transaction.currency} ${money(amountMinor)}`,
        reference: transaction.invoiceNumber ?? transaction.receiptNumber ?? transaction.reference ?? "—",
        date: transaction.createdAt.toISOString().slice(0, 10),
      },
      actions: transaction.transactionType === "received"
        ? <Link href={`/admin/fees/collection/carry-forward/receipt/${transaction.publicId}`} className="text-xs font-semibold text-violet-700 hover:text-violet-900">Print receipt</Link>
        : transaction.paymentPublicId
          ? <Link href={`/admin/fees/receipt/${transaction.paymentPublicId}`} className="text-xs font-semibold text-violet-700 hover:text-violet-900">View payment receipt</Link>
          : undefined,
    };
  });
  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    query.set("page", String(targetPage));
    query.set("pageSize", String(pageSize));
    return `/admin/fees/collection/carry-forward?${query.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-0 sm:space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-700">Fee collection</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Carry-forward fees</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Add advance payments for future fees; the credit stays on the account until applied.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/fees/collection" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Fee collection
          </Link>
          {studentsForAdvance.length > 0 && (
            <AdminActionDialog label="Record advance payment" title="Record an advance fee payment">
              <RecordFeeAdvanceCreditForm students={studentsForAdvance} currencies={currencyOptions} defaultCurrency={currency} idempotencyKey={randomUUID()} />
            </AdminActionDialog>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {totalRows.map((row) => (
          <SummaryCard key={row.currency} label={`Available carry-forward balance · ${row.currency} · ${currencyNames.get(row.currency) ?? row.currency}`} value={`${row.currency} ${money(minorUnits(row.totalMinor))}`} />
        ))}
        <SummaryCard label="Students with available credit" value={String(totalCount)} />
        <SummaryCard label="Recent credit activity" value={String(recentTransactions.length)} />
      </div>

      {studentsForAdvance.length === 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No actively enrolled students are available for advance payments.
        </p>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Available student credit</h2>
          <p className="mt-1 text-sm text-slate-600">Search for a student to review their balance and apply it to an unpaid invoice.</p>
        </div>
        <SmartFilterForm method="get" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Search students
            <input name="search" type="search" defaultValue={search} autoComplete="off"
              placeholder="Name or admission number"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Search</button>
        </SmartFilterForm>

        {creditRows.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {creditRows.map((student) => {
              const balance = minorUnits(student.balanceMinor);
              const invoices = invoicesByStudent.get(`${student.studentId}:${student.currency}`) ?? [];
              return (
                <article key={student.studentId} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-slate-900">{student.firstName} {student.lastName}</h3>
                      <p className="mt-1 break-words text-sm text-slate-500">Admission {student.admissionNumber || "—"}</p>
                    </div>
                    <div className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 sm:text-right">
                      <p className="text-xs font-medium text-emerald-800">Available credit</p>
                      <p className="mt-0.5 text-lg font-bold text-emerald-900">{student.currency} {money(balance)}</p>
                    </div>
                  </div>
                  {invoices.length ? (
                    <details className="border-t border-slate-100 pt-3">
                      <summary className="cursor-pointer text-sm font-semibold text-violet-700">Apply credit to an invoice</summary>
                      <div className="mt-3">
                        <ApplyFeeAdvanceCreditForm
                          studentId={student.studentId}
                          invoices={invoices}
                          idempotencyKey={randomUUID()}
                        />
                      </div>
                    </details>
                  ) : (
                    <p className="border-t border-slate-100 pt-3 text-sm text-slate-500">
                      No unpaid invoice is available yet. This credit will be ready when future fees are generated.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {search ? "No students with available credit match this search." : "No carry-forward balances are available yet. Record an advance payment to get started."}
          </p>
        )}

        {totalCount > pageSize && (
          <nav aria-label="Carry-forward credit pages" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <p className="text-sm text-slate-600">Page {page} of {pageCount} · {totalCount} students</p>
            <div className="flex flex-wrap items-center gap-2">
              <PaginationPageSize currentPageSize={pageSize} firstPageHref={pageHref(1)} ariaLabel="Carry-forward student balances" />
              <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${page <= 1 ? "pointer-events-none border-slate-100 text-slate-400" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                Previous
              </Link>
              <Link href={pageHref(Math.min(pageCount, page + 1))} aria-disabled={page >= pageCount}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${page >= pageCount ? "pointer-events-none border-slate-100 text-slate-400" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                Next
              </Link>
            </div>
          </nav>
        )}
      </section>

      <AdminDataTable
        title="Recent carry-forward activity"
        columns={[
          { key: "student", label: "Student" },
          { key: "admission", label: "Admission no." },
          { key: "activity", label: "Activity" },
          { key: "amount", label: "Amount" },
          { key: "reference", label: "Receipt / invoice" },
          { key: "date", label: "Date" },
        ]}
        rows={activityRows}
        mobileCardView
        requireSearchCriteria
        emptyMessage="No advance payments or credit applications have been recorded."
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
