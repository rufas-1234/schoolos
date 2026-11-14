import { and, asc, desc, eq, inArray, like, or, sql, sum } from "drizzle-orm";
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
  schoolBranches,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  calculateFineMinorUnits,
  feeInvoiceStatus,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";
import type { SearchableSelectOption } from "@/components/searchable-select";
import { FeeInvoiceFilters } from "./fee-invoice-filters";
import { EditFeeInvoiceForm, RecordFeePaymentForm, type FeeOption } from "../fee-forms";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
  branchId?: string | string[];
  classLevelId?: string | string[];
  sectionId?: string | string[];
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
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const statusFilter = typeof params.status === "string" &&
    ["unpaid", "partial", "paid"].includes(params.status) ? params.status : "";
  const requestedBranch = typeof params.branchId === "string" && /^\d+$/.test(params.branchId)
    ? Number(params.branchId)
    : null;
  const requestedClass = typeof params.classLevelId === "string" && /^\d+$/.test(params.classLevelId)
    ? Number(params.classLevelId)
    : null;
  const requestedSection = typeof params.sectionId === "string" && /^\d+$/.test(params.sectionId)
    ? Number(params.sectionId)
    : null;
  const [school, branches, classes, sections, invoices] = await Promise.all([
    db.select({ currency: schools.currency, timezone: schools.timezone })
      .from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
    db.select({ id: schoolBranches.id, name: schoolBranches.name })
      .from(schoolBranches).where(eq(schoolBranches.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name)),
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
    db.select({
      id: studentFeeInvoices.id,
      publicId: studentFeeInvoices.publicId,
      invoiceNumber: studentFeeInvoices.invoiceNumber,
      amount: studentFeeInvoices.amount,
      discountAmount: studentFeeInvoices.discountAmount,
      fineType: studentFeeInvoices.fineType,
      fineValue: studentFeeInvoices.fineValue,
      dueDate: studentFeeInvoices.dueDate,
      createdAt: studentFeeInvoices.createdAt,
      studentId: students.id,
      studentName: students.firstName,
      studentLastName: students.lastName,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      className: classLevels.name,
      sectionName: classSections.name,
      branchId: schoolBranches.id,
      branchName: schoolBranches.name,
      yearName: academicYears.name,
      termName: academicTerms.name,
      groupName: feeGroups.name,
      typeName: feeTypes.name,
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
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
        ...(search ? [or(
          like(students.firstName, `%${search}%`),
          like(students.lastName, `%${search}%`),
          like(sql`lower(concat(${students.firstName}, ' ', ${students.lastName}))`, `%${search.toLocaleLowerCase()}%`),
          like(students.admissionNumber, `%${search}%`),
          like(studentEnrollments.rollNumber, `%${search}%`),
          like(students.phone, `%${search}%`),
          like(students.publicId, `%${search}%`),
        )!] : []),
      ))
      .orderBy(desc(studentFeeInvoices.createdAt))
      .limit(250),
  ]);
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = invoiceIds.length
    ? await db.select({
        invoiceId: feePayments.invoiceId,
        amount: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
      })
      .from(feePayments)
      .where(and(eq(feePayments.schoolId, context.schoolId), inArray(feePayments.invoiceId, invoiceIds)))
      .groupBy(feePayments.invoiceId)
    : [];
  const paidByInvoice = new Map(payments.map((payment) => [
    payment.invoiceId,
    parseMoneyToMinorUnits(payment.amount ?? "0") ?? 0,
  ]));
  const today = todayInTimezone(school?.timezone ?? "UTC");
  const invoiceRows = invoices.map((invoice) => {
    const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
    const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
    const fine = today > invoice.dueDate
      ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    const paid = paidByInvoice.get(invoice.id) ?? 0;
    const totalDue = amount - discount + fine;
    return {
      ...invoice,
      paid,
      totalDue,
      balance: totalDue - paid,
      status: feeInvoiceStatus(totalDue, paid) ?? "unpaid",
    };
  });
  const rows = invoiceRows.filter((invoice) => !statusFilter || invoice.status === statusFilter);
  const currency = school?.currency ?? "";
  const branchOptions: SearchableSelectOption[] = [
    { value: "", label: "All branches" },
    ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
  ];
  const classOptions: SearchableSelectOption[] = [
    { value: "", label: "All classes" },
    ...classes.map((item) => ({ value: String(item.id), label: `${item.branchName} — ${item.name}` })),
  ];
  const sectionOptions: SearchableSelectOption[] = [
    { value: "", label: "All sections" },
    ...sections.map((section) => ({
      value: String(section.id),
      label: `${section.branchName} — ${section.className} / ${section.name} (${section.yearName})`,
    })),
  ];
  const totalOutstanding = rows.reduce((total, invoice) => total + Math.max(0, invoice.balance), 0);
  const payableInvoices: FeeOption[] = invoiceRows
    .filter((invoice) => invoice.balance > 0)
    .map((invoice) => ({
      id: invoice.id,
      label: `${invoice.invoiceNumber} · ${invoice.studentName} ${invoice.studentLastName} · ${currency} ${money(invoice.balance)} due`,
    }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700">Finance</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Fee collection</h1>
          <p className="mt-2 text-sm text-slate-600">Find invoices, review payments and collect full or partial balances.</p>
        </div>
        <Link href="/admin/fees" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Fee setup</Link>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <FeeInvoiceFilters
          search={search}
          branches={branchOptions}
          classes={classOptions}
          sections={sectionOptions}
          selectedBranch={requestedBranch === null ? "" : String(requestedBranch)}
          selectedClass={requestedClass === null ? "" : String(requestedClass)}
          selectedSection={requestedSection === null ? "" : String(requestedSection)}
          selectedStatus={statusFilter}
        />
        <AdminActionDialog label="Quick add payment" title="Quick add payment">
          <RecordFeePaymentForm
            currency={currency}
            idempotencyKey={randomUUID()}
            invoices={payableInvoices}
          />
        </AdminActionDialog>
      </div>
      {(requestedClass !== null || requestedSection !== null) && (
        <Link
          href={`/admin/fees/invoices/print?${requestedSection !== null ? `sectionId=${requestedSection}` : `classLevelId=${requestedClass}`}`}
          className="inline-flex rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Print filtered invoices
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Invoices shown" value={String(rows.length)} />
        <SummaryCard label="Outstanding shown" value={`${currency} ${money(totalOutstanding)}`} />
        <SummaryCard label="Showing up to" value="250 recent invoices" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.length ? rows.map((invoice) => (
          <article key={invoice.id} className="border-b border-slate-100 p-5 last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">{invoice.studentName} {invoice.studentLastName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Admission {invoice.admissionNumber || "—"} · Roll {invoice.rollNumber || "—"} · {invoice.branchName} / {invoice.className} / {invoice.sectionName}
                </p>
                <p className="mt-1 text-sm text-slate-500">{invoice.groupName} / {invoice.typeName}{invoice.termName ? ` · ${invoice.termName}` : ""} · due {invoice.dueDate}</p>
                <p className="mt-2 text-xs text-slate-400">Invoice {invoice.invoiceNumber} · {invoice.createdAt.toISOString().slice(0, 10)}</p>
                <div className="mt-2 flex gap-3 text-xs font-semibold text-violet-700">
                  <Link href={`/admin/fees/invoices/print?invoiceId=${invoice.publicId}`}>Print invoice</Link>
                  <Link href={`/admin/fees/invoices/print?studentId=${invoice.studentId}`}>Print student invoices</Link>
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
                <span className="text-slate-500">Fee</span><span>{currency} {money(parseMoneyToMinorUnits(invoice.amount) ?? 0)}</span>
                <span className="text-slate-500">Paid</span><span>{currency} {money(invoice.paid)}</span>
                <span className="font-semibold text-slate-800">Balance</span>
                <span className="font-semibold text-slate-800">{currency} {money(Math.max(0, invoice.balance))}</span>
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
                    currency={currency}
                    idempotencyKey={randomUUID()}
                  />
                </div>
              </details>
            )}
          </article>
        )) : (
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
