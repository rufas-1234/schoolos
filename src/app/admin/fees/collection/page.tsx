import { and, asc, count, desc, eq, inArray, like, lt, or, sql, sum } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { AdminActionDialog, AdminRecordDialog } from "@/components/admin-data-table";
import Link from "next/link";
import { db } from "@/db";
import {
  classLevels,
  classSections,
  academicYears,
  academicTerms,
  feeGroups,
  feePayments,
  feeStructures,
  feeTypes,
  schools,
  schoolCurrencies,
  schoolBranches,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { resolveBranchFilterId } from "@/lib/branch-selection-policy";
import {
  calculateFineMinorUnits,
  feeDisplayName,
  feeInvoiceStatus,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";
import type { SearchableSelectOption } from "@/components/searchable-select";
import { FeeInvoiceFilters } from "./fee-invoice-filters";
import { BulkFeePaymentForm, EditFeeInvoiceForm, RecordFeePaymentForm, type FeeOption } from "../fee-forms";
import { PaginationPageSize } from "@/components/pagination-page-size";
import { parsePageSize } from "@/components/pagination-utils";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
  overdue?: string | string[];
  branchId?: string | string[];
  classLevelId?: string | string[];
  sectionId?: string | string[];
  currency?: string | string[];
  sort?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
};

function money(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function FeeCollectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const params = await searchParams;
  const pageSize = parsePageSize(params.pageSize);
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const statusFilter = typeof params.status === "string" &&
    ["unpaid", "partial", "paid", "outstanding"].includes(params.status) ? params.status : "";
  const overdueOnly = params.overdue === "true";
  const requestedBranchValue = typeof params.branchId === "string" ? params.branchId : undefined;
  const requestedClass = typeof params.classLevelId === "string" && /^\d+$/.test(params.classLevelId)
    ? Number(params.classLevelId)
    : null;
  const requestedSection = typeof params.sectionId === "string" && /^\d+$/.test(params.sectionId)
    ? Number(params.sectionId)
    : null;
  const requestedPage = typeof params.page === "string" && /^\d+$/.test(params.page)
    ? Math.max(1, Number(params.page))
    : 1;
  const [school] = await db.select({ currency: schools.currency, timezone: schools.timezone })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  const currency = school?.currency ?? "";
  const currencyRows = await db.select({ code: schoolCurrencies.code, name: schoolCurrencies.name, symbol: schoolCurrencies.symbol })
    .from(schoolCurrencies).where(eq(schoolCurrencies.schoolId, context.schoolId));
  const branches = await db.select({ id: schoolBranches.id, name: schoolBranches.name })
    .from(schoolBranches).where(eq(schoolBranches.schoolId, context.schoolId))
    .orderBy(asc(schoolBranches.name));
  const requestedBranch = resolveBranchFilterId(branches, requestedBranchValue);
  const requestedCurrency = typeof params.currency === "string" ? params.currency : "";
  const selectedCurrency = currencyRows.some((item) => item.code === requestedCurrency)
    ? requestedCurrency
    : currency;
  const sort = typeof params.sort === "string" &&
    ["fee-type-asc", "fee-type-desc"].includes(params.sort)
    ? params.sort
    : "recent";
  const currencyOptions: SearchableSelectOption[] = currencyRows.map((item) => ({
    value: item.code,
    label: `${item.code} · ${item.name} (${item.symbol})`,
  }));
  const today = todayInTimezone(school?.timezone ?? "UTC");
  const paymentTotals = db.select({
    invoiceId: feePayments.invoiceId,
    paid: sql<string>`COALESCE(SUM(${feePayments.amount} - ${feePayments.reversedAmount}), 0)`.as("paid"),
  })
    .from(feePayments)
    .where(eq(feePayments.schoolId, context.schoolId))
    .groupBy(feePayments.invoiceId)
    .as("invoice_payment_totals");
  const fineDue = sql`CASE
    WHEN ${studentFeeInvoices.fineType} = 'none' OR ${studentFeeInvoices.dueDate} >= ${today} THEN 0
    WHEN ${studentFeeInvoices.fineType} = 'fixed' THEN ${studentFeeInvoices.fineValue}
    WHEN ${studentFeeInvoices.fineType} = 'percentage'
      THEN ROUND((${studentFeeInvoices.amount} - ${studentFeeInvoices.discountAmount}) * ${studentFeeInvoices.fineValue} / 100, 2)
    ELSE 0
  END`;
  const totalDueSql = sql`(${studentFeeInvoices.amount} - ${studentFeeInvoices.discountAmount} + ${fineDue})`;
  const paidSql = sql<string>`COALESCE(${paymentTotals.paid}, 0)`;
  const invoiceStatusSql = sql<string>`CASE
    WHEN ${paidSql} < 0 OR ${totalDueSql} < 0 OR ${paidSql} > ${totalDueSql} THEN 'unpaid'
    WHEN ${paidSql} = ${totalDueSql} THEN 'paid'
    WHEN ${paidSql} = 0 THEN 'unpaid'
    ELSE 'partial'
  END`;
  const invoiceFilters = [
    eq(studentFeeInvoices.schoolId, context.schoolId),
    eq(studentFeeInvoices.currency, selectedCurrency),
    ...(overdueOnly ? [lt(studentFeeInvoices.dueDate, today)] : []),
    ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
    ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
    ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
    ...(search ? [or(
      like(sql`lower(${studentFeeInvoices.invoiceNumber})`, `%${search.toLocaleLowerCase()}%`),
      like(students.firstName, `%${search}%`),
      like(students.lastName, `%${search}%`),
      like(sql`lower(concat(${students.firstName}, ' ', ${students.lastName}))`, `%${search.toLocaleLowerCase()}%`),
      like(students.admissionNumber, `%${search}%`),
      like(studentEnrollments.rollNumber, `%${search}%`),
      like(students.phone, `%${search}%`),
      like(students.publicId, `%${search}%`),
    )!] : []),
  ];
  const matchingInvoices = db.select({
    id: studentFeeInvoices.id,
    publicId: studentFeeInvoices.publicId,
    invoiceNumber: studentFeeInvoices.invoiceNumber,
    amount: studentFeeInvoices.amount,
    currency: studentFeeInvoices.currency,
    discountAmount: studentFeeInvoices.discountAmount,
    fineType: studentFeeInvoices.fineType,
    fineValue: studentFeeInvoices.fineValue,
    dueDate: studentFeeInvoices.dueDate,
    createdAt: studentFeeInvoices.createdAt,
    studentId: sql<number>`${students.id}`.as("studentId"),
    studentName: sql<string>`${students.firstName}`.as("studentName"),
    studentLastName: sql<string>`${students.lastName}`.as("studentLastName"),
    admissionNumber: students.admissionNumber,
    rollNumber: studentEnrollments.rollNumber,
    className: sql<string>`${classLevels.name}`.as("className"),
    sectionName: sql<string>`${classSections.name}`.as("sectionName"),
    branchId: sql<number>`${schoolBranches.id}`.as("branchId"),
    branchName: sql<string>`${schoolBranches.name}`.as("branchName"),
    yearName: sql<string>`${academicYears.name}`.as("yearName"),
    termName: sql<string>`${academicTerms.name}`.as("termName"),
    groupName: sql<string>`${feeGroups.name}`.as("groupName"),
    typeName: sql<string>`${feeTypes.name}`.as("typeName"),
    paidAmount: paidSql.as("paidAmount"),
    status: invoiceStatusSql.as("status"),
    balanceMinor: sql<string>`GREATEST(0, ROUND((${totalDueSql} - ${paidSql}) * 100))`.as("balanceMinor"),
  })
    .from(studentFeeInvoices)
    .innerJoin(students, and(
      eq(students.id, studentFeeInvoices.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
      eq(studentEnrollments.schoolId, context.schoolId),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .innerJoin(feeStructures, and(
      eq(feeStructures.id, studentFeeInvoices.feeStructureId),
      eq(feeStructures.schoolId, context.schoolId),
    ))
    .innerJoin(academicYears, and(
      eq(academicYears.id, feeStructures.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .leftJoin(academicTerms, eq(academicTerms.id, feeStructures.academicTermId))
    .innerJoin(feeGroups, and(
      eq(feeGroups.id, feeStructures.feeGroupId),
      eq(feeGroups.schoolId, context.schoolId),
    ))
    .innerJoin(feeTypes, and(
      eq(feeTypes.id, feeStructures.feeTypeId),
      eq(feeTypes.schoolId, context.schoolId),
    ))
    .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, studentFeeInvoices.id))
    .where(and(...invoiceFilters))
    .as("matching_invoices");
  const statusFilterCondition = statusFilter === "outstanding"
    ? inArray(matchingInvoices.status, ["unpaid", "partial"])
    : statusFilter
      ? eq(matchingInvoices.status, statusFilter)
      : undefined;
  const [countResult, bulkSummary, classes, sections] = await Promise.all([
    db.select({ total: count() }).from(matchingInvoices).where(statusFilterCondition),
    db.select({
      count: count(),
      outstandingMinor: sum(matchingInvoices.balanceMinor),
    }).from(matchingInvoices).where(and(
      statusFilterCondition,
      inArray(matchingInvoices.status, ["unpaid", "partial"]),
    )),
    db.select({ id: classLevels.id, name: classLevels.name, branchName: schoolBranches.name })
      .from(classLevels)
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .where(eq(classLevels.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name)),
    db.select({
      id: classSections.id,
      name: classSections.name,
      className: classLevels.name,
      branchName: schoolBranches.name,
      yearName: academicYears.name,
    })
      .from(classSections)
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, classSections.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(eq(classSections.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name), asc(classSections.name)),
  ]);
  const matchingCount = Number(countResult[0]?.total ?? 0);
  const bulkInvoiceCount = Number(bulkSummary[0]?.count ?? 0);
  const bulkOutstandingMinor = Number(bulkSummary[0]?.outstandingMinor ?? 0);
  if (!Number.isSafeInteger(bulkOutstandingMinor) || bulkOutstandingMinor < 0) {
    throw new Error("Filtered invoice balance total is invalid.");
  }
  const pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const invoices = await db.select().from(matchingInvoices)
    .where(statusFilterCondition)
    .orderBy(
      ...(sort === "fee-type-asc"
        ? [asc(matchingInvoices.typeName), asc(matchingInvoices.groupName)]
        : sort === "fee-type-desc"
          ? [desc(matchingInvoices.typeName), desc(matchingInvoices.groupName)]
          : []),
      desc(matchingInvoices.createdAt),
      desc(matchingInvoices.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const invoiceRows = invoices.map((invoice) => {
    const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
    const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
    const fine = today > invoice.dueDate
      ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    const paid = parseMoneyToMinorUnits(invoice.paidAmount) ?? 0;
    const totalDue = amount - discount + fine;
    return {
      ...invoice,
      paid,
      totalDue,
      balance: totalDue - paid,
      status: feeInvoiceStatus(totalDue, paid) ?? "unpaid",
    };
  });
  const rows = invoiceRows;
  const receiptsByInvoice = new Map<number, { publicId: string; receiptNumber: string }[]>();
  if (rows.length) {
    const receipts = await db.select({
      invoiceId: feePayments.invoiceId,
      publicId: feePayments.publicId,
      receiptNumber: feePayments.receiptNumber,
    })
      .from(feePayments)
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        inArray(feePayments.invoiceId, rows.map((invoice) => invoice.id)),
      ))
      .orderBy(desc(feePayments.paidAt), desc(feePayments.id));
    for (const receipt of receipts) {
      const invoiceReceipts = receiptsByInvoice.get(receipt.invoiceId) ?? [];
      invoiceReceipts.push({ publicId: receipt.publicId, receiptNumber: receipt.receiptNumber });
      receiptsByInvoice.set(receipt.invoiceId, invoiceReceipts);
    }
  }
  const branchOptions: SearchableSelectOption[] = [
    { value: "", label: "All branches" },
    ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
  ];
  const classOptions: SearchableSelectOption[] = [
    { value: "", label: "All classes" },
    ...classes.map((item) => ({ value: String(item.id), label: item.name })),
  ];
  const sectionOptions: SearchableSelectOption[] = [
    { value: "", label: "All sections" },
    ...sections.map((section) => ({
      value: String(section.id),
      label: `${section.className} / ${section.name} (${section.yearName})`,
    })),
  ];
  const totalOutstanding = rows.reduce((total, invoice) => total + Math.max(0, invoice.balance), 0);
  const payableInvoices: FeeOption[] = invoiceRows
    .filter((invoice) => invoice.balance > 0)
    .map((invoice) => ({
      id: invoice.id,
      label: `${invoice.invoiceNumber} · ${invoice.studentName} ${invoice.studentLastName} · ${invoice.currency} ${money(invoice.balance)} due`,
    }));
  const firstResult = matchingCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, matchingCount);
  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (statusFilter) query.set("status", statusFilter);
    if (overdueOnly) query.set("overdue", "true");
    if (sort !== "recent") query.set("sort", sort);
    if (requestedBranch !== null) query.set("branchId", String(requestedBranch));
    else if (params.branchId === "") query.set("branchId", "");
    if (requestedClass !== null) query.set("classLevelId", String(requestedClass));
    if (requestedSection !== null) query.set("sectionId", String(requestedSection));
    query.set("currency", selectedCurrency);
    query.set("page", String(targetPage));
    query.set("pageSize", String(pageSize));
    return `/admin/fees/collection?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700">Finance</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Fee collection</h1>
          <p className="mt-2 text-sm text-slate-600">Find invoices, review payments and collect full or partial balances.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/fees/collection/carry-forward" className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100">
            Carry-forward fees
          </Link>
          <Link href="/admin/fees" className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fee setup</Link>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <FeeInvoiceFilters
          search={search}
          branches={branchOptions}
          classes={classOptions}
          sections={sectionOptions}
          currencies={currencyOptions}
          selectedBranch={requestedBranch === null ? "" : String(requestedBranch)}
          selectedClass={requestedClass === null ? "" : String(requestedClass)}
          selectedSection={requestedSection === null ? "" : String(requestedSection)}
          selectedStatus={statusFilter}
          overdueOnly={overdueOnly}
          selectedCurrency={selectedCurrency}
          selectedSort={sort}
        />
        <AdminActionDialog label="Quick add payment" title="Quick add payment">
          <RecordFeePaymentForm
            currency={selectedCurrency}
            idempotencyKey={randomUUID()}
            invoices={payableInvoices}
          />
        </AdminActionDialog>
      </div>
      <BulkFeePaymentForm
        search={search}
        status={statusFilter}
        overdue={overdueOnly ? "true" : ""}
        branchId={requestedBranch === null ? "" : String(requestedBranch)}
        classLevelId={requestedClass === null ? "" : String(requestedClass)}
        sectionId={requestedSection === null ? "" : String(requestedSection)}
        invoiceCount={bulkInvoiceCount}
        outstandingMinor={bulkOutstandingMinor}
        currency={selectedCurrency}
      />
      <Link
        href={`/admin/fees/invoices/print?${new URLSearchParams({
          ...(search ? { search } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(overdueOnly ? { overdue: "true" } : {}),
          ...(requestedBranch !== null ? { branchId: String(requestedBranch) } : {}),
          ...(params.branchId === "" ? { branchId: "" } : {}),
          ...(requestedClass !== null ? { classLevelId: String(requestedClass) } : {}),
          ...(requestedSection !== null ? { sectionId: String(requestedSection) } : {}),
          currency: selectedCurrency,
          ...(sort !== "recent" ? { sort } : {}),
        }).toString()}`}
        className="inline-flex rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Print all filtered invoices
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard label="Invoices matching filters" value={String(matchingCount)} />
        <SummaryCard label={`Outstanding on this page · ${selectedCurrency}`} value={`${selectedCurrency} ${money(totalOutstanding)}`} />
      </div>

      <nav aria-label="Invoice pages" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Showing {firstResult}–{lastResult} of {matchingCount} invoices
        </p>
        <div className="flex items-center gap-2">
          <PaginationPageSize currentPageSize={pageSize} firstPageHref={pageHref(1)} ariaLabel="Fee invoices" />
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              page <= 1
                ? "pointer-events-none border-slate-100 text-slate-400"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Previous
          </Link>
          <span className="text-sm text-slate-500">Page {page} of {pageCount}</span>
          <Link
            href={pageHref(Math.min(pageCount, page + 1))}
            aria-disabled={page >= pageCount}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              page >= pageCount
                ? "pointer-events-none border-slate-100 text-slate-400"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Next
          </Link>
        </div>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.length ? rows.map((invoice) => {
          const invoiceReceipts = receiptsByInvoice.get(invoice.id) ?? [];
          const latestReceipt = invoiceReceipts[0];
          return (
          <article key={invoice.id} className="border-b border-slate-100 p-5 last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">{invoice.studentName} {invoice.studentLastName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Admission {invoice.admissionNumber || "—"} · Roll {invoice.rollNumber || "—"} · {invoice.branchName} / {invoice.className} / {invoice.sectionName}
                </p>
                <p className="mt-1 text-sm text-slate-500">{feeDisplayName(invoice.typeName)}{invoice.termName ? ` · ${invoice.termName}` : ""} · due {invoice.dueDate}</p>
                <p className="mt-2 text-xs text-slate-400">Invoice {invoice.invoiceNumber} · {invoice.createdAt.toISOString().slice(0, 10)}</p>
                <div className="mt-2 flex gap-3 text-xs font-semibold text-violet-700">
                  {latestReceipt ? (
                    <>
                      <Link href={`/admin/fees/receipt/${latestReceipt.publicId}`}>Print receipt</Link>
                      {invoiceReceipts.length > 1 && (
                        <details className="relative">
                          <summary className="cursor-pointer">Other receipts</summary>
                          <div className="absolute z-10 mt-1 grid max-h-48 min-w-max gap-2 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                            {invoiceReceipts.slice(1).map((receipt) => (
                              <Link key={receipt.publicId} href={`/admin/fees/receipt/${receipt.publicId}`}>
                                {receipt.receiptNumber}
                              </Link>
                            ))}
                          </div>
                        </details>
                      )}
                      <Link href={`/admin/fees/invoices/print?invoiceId=${invoice.publicId}`}>View invoice</Link>
                    </>
                  ) : (
                    <Link href={`/admin/fees/invoices/print?invoiceId=${invoice.publicId}`}>Print invoice</Link>
                  )}
                  <Link href={`/admin/fees/invoices/print?studentId=${invoice.studentId}`}>Print student invoices</Link>
                  <Link href={`/admin/fees/invoices/statement?studentId=${invoice.studentId}`}>Print consolidated statement</Link>
                  <AdminRecordDialog title={`Edit invoice ${invoice.invoiceNumber}`}>
                    <EditFeeInvoiceForm invoice={{
                      id: invoice.id,
                      amount: invoice.amount,
                      discountAmount: invoice.discountAmount,
                      dueDate: invoice.dueDate,
                      fineType: invoice.fineType,
                      fineValue: invoice.fineValue,
                    }} />
                  </AdminRecordDialog>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm">
                <span className="text-slate-500">Fee</span><span>{invoice.currency} {money(parseMoneyToMinorUnits(invoice.amount) ?? 0)}</span>
                <span className="text-slate-500">Paid</span><span>{invoice.currency} {money(invoice.paid)}</span>
                <span className="font-semibold text-slate-800">Balance</span>
                <span className="font-semibold text-slate-800">{invoice.currency} {money(Math.max(0, invoice.balance))}</span>
                <span>Status</span><span className="capitalize">{invoice.status}</span>
              </div>
            </div>
            {invoice.balance > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-violet-700">Add payment</summary>
                <div className="mt-3 max-w-md">
                  <RecordFeePaymentForm
                    invoiceId={invoice.id}
                    maxAmount={money(invoice.balance)}
                    currency={invoice.currency}
                    idempotencyKey={randomUUID()}
                  />
                </div>
              </details>
            )}
          </article>
        );
        }) : (
          <p className="p-6 text-sm text-slate-500">No fee invoices match these filters. Create a fee structure and generate invoices from fee setup.</p>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
