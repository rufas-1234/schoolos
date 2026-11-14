import { and, asc, desc, eq, gte, inArray, lt, lte, sql, sum } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/db";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import {
  academicYears,
  classLevels,
  classSections,
  feePayments,
  feePaymentReversals,
  feeStructures,
  feeTypes,
  schools,
  schoolBranches,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import {
  calculateFineMinorUnits,
  feePaymentDateRangeInTimezone,
  feeInvoiceStatus,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
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

export default async function FeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const params = await searchParams;
  const [school, branches, classes, sections] = await Promise.all([
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
  ]);
  const today = todayInTimezone(school?.timezone ?? "UTC");
  const firstDay = `${today.slice(0, 7)}-01`;
  const requestedFrom = typeof params.from === "string" && isCalendarDate(params.from) ? params.from : firstDay;
  const requestedTo = typeof params.to === "string" && isCalendarDate(params.to) && params.to >= requestedFrom
    ? params.to
    : today;
  const from = requestedFrom <= today ? requestedFrom : today;
  const to = requestedTo <= today ? requestedTo : today;
  const requestedBranch = typeof params.branchId === "string" && /^\d+$/.test(params.branchId)
    ? Number(params.branchId)
    : null;
  const requestedClass = typeof params.classLevelId === "string" && /^\d+$/.test(params.classLevelId)
    ? Number(params.classLevelId)
    : null;
  const requestedSection = typeof params.sectionId === "string" && /^\d+$/.test(params.sectionId)
    ? Number(params.sectionId)
    : null;
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
  const dateRange = feePaymentDateRangeInTimezone(from, to, school?.timezone ?? "UTC");
  if (!dateRange) throw new Error("The requested fee report date range is invalid.");
  const [payments, dueInvoices, paymentTotals, reversals, reversalTotals] = await Promise.all([
    db.select({
      publicId: feePayments.publicId,
      amount: feePayments.amount,
      reversedAmount: feePayments.reversedAmount,
      fineAmount: feePayments.fineAmount,
      receiptNumber: feePayments.receiptNumber,
      paymentMethod: feePayments.paymentMethod,
      reference: feePayments.reference,
      paidAt: feePayments.paidAt,
      studentName: students.firstName,
      studentLastName: students.lastName,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      branchName: schoolBranches.name,
      className: classLevels.name,
      sectionName: classSections.name,
      yearName: academicYears.name,
      feeTypeName: feeTypes.name,
    })
      .from(feePayments)
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      ))
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
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        gte(feePayments.paidAt, dateRange.start),
        lt(feePayments.paidAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
      ))
      .orderBy(desc(feePayments.paidAt))
      .limit(500),
    db.select({
      id: studentFeeInvoices.id,
      amount: studentFeeInvoices.amount,
      discountAmount: studentFeeInvoices.discountAmount,
      fineType: studentFeeInvoices.fineType,
      fineValue: studentFeeInvoices.fineValue,
      dueDate: studentFeeInvoices.dueDate,
      studentName: students.firstName,
      studentLastName: students.lastName,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      branchName: schoolBranches.name,
      className: classLevels.name,
      sectionName: classSections.name,
      feeTypeName: feeTypes.name,
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
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        gte(studentFeeInvoices.dueDate, from),
        lte(studentFeeInvoices.dueDate, to),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
      ))
      .orderBy(asc(studentFeeInvoices.dueDate)),
    db.select({
      amount: sum(feePayments.amount),
      fineAmount: sum(feePayments.fineAmount),
    })
      .from(feePayments)
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
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
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        gte(feePayments.paidAt, dateRange.start),
        lt(feePayments.paidAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
      ))
      .then((rows) => rows[0]),
    db.select({
      publicId: feePaymentReversals.publicId,
      amount: feePaymentReversals.amount,
      fineAmount: feePaymentReversals.fineAmount,
      reversalType: feePaymentReversals.reversalType,
      reason: feePaymentReversals.reason,
      reference: feePaymentReversals.reference,
      createdAt: feePaymentReversals.createdAt,
      receiptNumber: feePayments.receiptNumber,
      paymentPublicId: feePayments.publicId,
      studentName: students.firstName,
      studentLastName: students.lastName,
      branchName: schoolBranches.name,
      className: classLevels.name,
      sectionName: classSections.name,
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
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        gte(feePaymentReversals.createdAt, dateRange.start),
        lt(feePaymentReversals.createdAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
      ))
      .orderBy(desc(feePaymentReversals.createdAt))
      .limit(500),
    db.select({
      amount: sum(feePaymentReversals.amount),
      fineAmount: sum(feePaymentReversals.fineAmount),
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
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        gte(feePaymentReversals.createdAt, dateRange.start),
        lt(feePaymentReversals.createdAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
      ))
      .then((rows) => rows[0]),
  ]);
  const invoiceIds = dueInvoices.map((invoice) => invoice.id);
  const invoicePayments = [];
  for (let offset = 0; offset < invoiceIds.length; offset += 500) {
    const batch = invoiceIds.slice(offset, offset + 500);
    const batchPayments = await db.select({
      invoiceId: feePayments.invoiceId,
      amount: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
      fineAmount: sum(sql`greatest(0, ${feePayments.fineAmount} - least(${feePayments.reversedAmount}, ${feePayments.fineAmount}))`),
    })
      .from(feePayments)
      .where(and(eq(feePayments.schoolId, context.schoolId), inArray(feePayments.invoiceId, batch)))
      .groupBy(feePayments.invoiceId)
    invoicePayments.push(...batchPayments);
  }
  const paidByInvoice = new Map(invoicePayments.map((item) => [
    item.invoiceId,
    {
      paid: parseMoneyToMinorUnits(item.amount ?? "0") ?? 0,
      fine: parseMoneyToMinorUnits(item.fineAmount ?? "0") ?? 0,
    },
  ]));
  const outstanding = dueInvoices.map((invoice) => {
    const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
    const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
    const dueFine = today > invoice.dueDate
      ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    const payment = paidByInvoice.get(invoice.id) ?? { paid: 0, fine: 0 };
    const totalDue = amount - discount + dueFine;
    const balance = Math.max(0, totalDue - payment.paid);
    return { ...invoice, paid: payment.paid, balance, status: feeInvoiceStatus(totalDue, payment.paid) ?? "unpaid" };
  }).filter((invoice) => invoice.balance > 0);
  const totalCollected =
    (parseMoneyToMinorUnits(paymentTotals?.amount ?? "0") ?? 0) -
    (parseMoneyToMinorUnits(reversalTotals?.amount ?? "0") ?? 0);
  const totalFines =
    (parseMoneyToMinorUnits(paymentTotals?.fineAmount ?? "0") ?? 0) -
    (parseMoneyToMinorUnits(reversalTotals?.fineAmount ?? "0") ?? 0);
  const totalOutstanding = outstanding.reduce((total, item) => total + item.balance, 0);
  const currency = school?.currency ?? "";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-violet-700">Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Fee reports</h1>
        <p className="mt-2 text-sm text-slate-600">Review payments, reversals, refunds, fines and outstanding balances by date, branch and class.</p>
      </header>

      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-6">
        <label className="text-sm font-medium text-slate-700">From
          <input type="date" name="from" defaultValue={from} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input type="date" name="to" defaultValue={to} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <SearchableSelect
          label="Branch"
          name="branchId"
          options={branchOptions}
          defaultValue={requestedBranch === null ? "" : String(requestedBranch)}
          placeholder="Search branches..."
        />
        <SearchableSelect
          label="Class"
          name="classLevelId"
          options={classOptions}
          defaultValue={requestedClass === null ? "" : String(requestedClass)}
          placeholder="Search classes..."
        />
        <SearchableSelect
          label="Section"
          name="sectionId"
          options={sectionOptions}
          defaultValue={requestedSection === null ? "" : String(requestedSection)}
          placeholder="Search sections..."
        />
        <div className="flex items-end">
          <button className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Apply filters</button>
        </div>
      </form>

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Collected in period" value={`${currency} ${money(totalCollected)}`} />
        <SummaryCard label="Fines collected" value={`${currency} ${money(totalFines)}`} />
        <SummaryCard label="Outstanding due in period" value={`${currency} ${money(totalOutstanding)}`} />
      </section>

      <ReportTable
        title="Payment report"
        description={`Payments recorded ${from} through ${to}; up to 500 most recent entries.`}
        empty="No payments were recorded during this date range."
        headings={["Student", "Class / section", "Fee type", "Date", "Method", "Payment", "Reversed", "Fine", "Receipt"]}
        hasRows={payments.length > 0}
      >
        {payments.map((payment) => (
          <tr key={payment.publicId} className="border-t border-slate-100">
            <td className="px-4 py-3">{payment.studentName} {payment.studentLastName}<span className="block text-xs text-slate-500">{payment.admissionNumber || "—"} · {payment.rollNumber || "—"}</span></td>
            <td className="px-4 py-3">{payment.branchName} / {payment.className} / {payment.sectionName}</td>
            <td className="px-4 py-3">{payment.feeTypeName}</td>
            <td className="px-4 py-3">{payment.paidAt.toISOString().slice(0, 10)}</td>
            <td className="px-4 py-3 capitalize">{payment.paymentMethod.replace("_", " ")}</td>
            <td className="px-4 py-3">{currency} {payment.amount}</td>
            <td className="px-4 py-3">{currency} {payment.reversedAmount}</td>
            <td className="px-4 py-3">{currency} {payment.fineAmount}</td>
            <td className="px-4 py-3"><Link className="font-semibold text-violet-700 hover:text-violet-900" href={`/admin/fees/receipt/${payment.publicId}`}>{payment.receiptNumber}</Link></td>
          </tr>
        ))}
      </ReportTable>

      <ReportTable
        title="Reversals and refunds"
        description={`Reversals recorded ${from} through ${to}; up to 500 most recent entries.`}
        empty="No payment reversals or refunds were recorded during this date range."
        headings={["Student", "Class / section", "Date", "Type", "Amount", "Reason", "Receipt"]}
        hasRows={reversals.length > 0}
      >
        {reversals.map((reversal) => (
          <tr key={reversal.publicId} className="border-t border-slate-100">
            <td className="px-4 py-3">{reversal.studentName} {reversal.studentLastName}</td>
            <td className="px-4 py-3">{reversal.branchName} / {reversal.className} / {reversal.sectionName}</td>
            <td className="px-4 py-3">{reversal.createdAt.toISOString().slice(0, 10)}</td>
            <td className="px-4 py-3 capitalize">{reversal.reversalType}</td>
            <td className="px-4 py-3">{currency} {reversal.amount}</td>
            <td className="px-4 py-3">{reversal.reason}{reversal.reference ? ` · Ref ${reversal.reference}` : ""}</td>
            <td className="px-4 py-3"><Link className="font-semibold text-violet-700 hover:text-violet-900" href={`/admin/fees/receipt/${reversal.paymentPublicId}`}>{reversal.receiptNumber}</Link></td>
          </tr>
        ))}
      </ReportTable>

      <ReportTable
        title="Balance / fees due report"
        description={`Invoices due ${from} through ${to}; balance includes applicable late fines.`}
        empty="No outstanding invoices are due in this date range."
        headings={["Student", "Class / section", "Fee type", "Due date", "Paid", "Balance", "Status"]}
        hasRows={outstanding.length > 0}
      >
        {outstanding.map((invoice) => (
          <tr key={invoice.id} className="border-t border-slate-100">
            <td className="px-4 py-3">{invoice.studentName} {invoice.studentLastName}<span className="block text-xs text-slate-500">{invoice.admissionNumber || "—"} · {invoice.rollNumber || "—"}</span></td>
            <td className="px-4 py-3">{invoice.branchName} / {invoice.className} / {invoice.sectionName}</td>
            <td className="px-4 py-3">{invoice.feeTypeName}</td>
            <td className="px-4 py-3">{invoice.dueDate}</td>
            <td className="px-4 py-3">{currency} {money(invoice.paid)}</td>
            <td className="px-4 py-3 font-semibold">{currency} {money(invoice.balance)}</td>
            <td className="px-4 py-3 capitalize">{invoice.status}</td>
          </tr>
        ))}
      </ReportTable>
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

function ReportTable({
  title,
  description,
  headings,
  empty,
  hasRows,
  children,
}: {
  title: string;
  description: string;
  headings: string[];
  empty: string;
  hasRows: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="p-5">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {hasRows ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{headings.map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody className="text-slate-700">{children}</tbody>
          </table>
        </div>
      ) : <p className="px-5 pb-5 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}
