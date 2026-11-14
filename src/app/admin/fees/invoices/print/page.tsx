import Link from "next/link";
import { and, asc, eq, inArray, sql, sum } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
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
import { calculateFineMinorUnits, feeInvoiceStatus, parseMoneyToMinorUnits } from "@/lib/fees-policy";

type SearchParams = {
  invoiceId?: string | string[];
  studentId?: string | string[];
  classLevelId?: string | string[];
  sectionId?: string | string[];
};

function parseId(value: string | string[] | undefined): number | null {
  return typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
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

function money(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

export default async function FeeInvoicePrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const params = await searchParams;
  const invoiceId = typeof params.invoiceId === "string" && params.invoiceId.length <= 36
    ? params.invoiceId
    : null;
  const studentId = parseId(params.studentId);
  const classLevelId = parseId(params.classLevelId);
  const sectionId = parseId(params.sectionId);
  const supplied = [params.invoiceId, params.studentId, params.classLevelId, params.sectionId]
    .filter((value) => value !== undefined).length;
  if (supplied !== 1 ||
    (params.invoiceId !== undefined && !invoiceId) ||
    (params.studentId && !studentId) ||
    (params.classLevelId && !classLevelId) ||
    (params.sectionId && !sectionId)) notFound();

  const [school] = await db.select({ name: schools.name, currency: schools.currency, timezone: schools.timezone })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  if (!school) notFound();
  const invoices = await db.select({
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
    branchName: schoolBranches.name,
    className: classLevels.name,
    sectionName: classSections.name,
    yearName: academicYears.name,
    termName: academicTerms.name,
    groupName: feeGroups.name,
    typeName: feeTypes.name,
  }).from(studentFeeInvoices)
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
    .leftJoin(academicTerms, and(
      eq(academicTerms.id, feeStructures.academicTermId),
      eq(academicTerms.schoolId, context.schoolId),
    ))
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
      ...(invoiceId ? [eq(studentFeeInvoices.publicId, invoiceId)] : []),
      ...(studentId ? [eq(students.id, studentId)] : []),
      ...(classLevelId ? [eq(classLevels.id, classLevelId)] : []),
      ...(sectionId ? [eq(classSections.id, sectionId)] : []),
    ))
    .orderBy(asc(students.lastName), asc(students.firstName), asc(studentFeeInvoices.dueDate));
  if (!invoices.length) notFound();

  const paymentTotals = await db.select({
    invoiceId: feePayments.invoiceId,
    paid: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
  }).from(feePayments)
    .where(and(
      eq(feePayments.schoolId, context.schoolId),
      inArray(feePayments.invoiceId, invoices.map((invoice) => invoice.id)),
    ))
    .groupBy(feePayments.invoiceId);
  const paidByInvoice = new Map(paymentTotals.map((row) => [
    row.invoiceId,
    parseMoneyToMinorUnits(row.paid ?? "0") ?? 0,
  ]));
  const today = todayInTimezone(school.timezone);
  const totalOutstanding = invoices.reduce((sumDue, invoice) => {
    const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
    const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
    const fine = today > invoice.dueDate
      ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    return sumDue + Math.max(0, amount - discount + fine - (paidByInvoice.get(invoice.id) ?? 0));
  }, 0);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-slate-900 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 print:border-black">
        <div>
          <p className="text-sm font-semibold text-violet-700 print:text-black">{school.name}</p>
          <h1 className="mt-1 text-2xl font-bold">Fee invoices</h1>
          <p className="mt-1 text-sm text-slate-600">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · Outstanding {school.currency} {money(totalOutstanding)}
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Link href="/admin/fees/collection" className="text-sm font-semibold text-violet-700">Back to collection</Link>
          <PrintButton label="Print invoices" />
        </div>
      </header>
      {invoices.map((invoice) => {
        const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
        const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
        const paid = paidByInvoice.get(invoice.id) ?? 0;
        const fine = today > invoice.dueDate
          ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
          : 0;
        const total = amount - discount + fine;
        const balance = Math.max(0, total - paid);
        const status = feeInvoiceStatus(total, paid) ?? "unpaid";
        return (
          <article key={invoice.id} className="break-inside-avoid space-y-4 border-b border-slate-300 pb-6">
            <header className="flex justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Invoice {invoice.invoiceNumber}</h2>
                <p className="text-sm">{invoice.studentName} {invoice.studentLastName} · Admission {invoice.admissionNumber || "—"}</p>
                <p className="text-sm">{invoice.branchName} / {invoice.className} / {invoice.sectionName} · {invoice.yearName}{invoice.termName ? ` · ${invoice.termName}` : ""}</p>
              </div>
              <p className="text-sm">Issued {invoice.createdAt.toISOString().slice(0, 10)}<br />Due {invoice.dueDate}</p>
            </header>
            <table className="w-full border-collapse text-left text-sm">
              <thead><tr className="border-y border-slate-300"><th className="px-3 py-2">Fee item</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
              <tbody>
                <tr className="border-b border-slate-200"><td className="px-3 py-2">{invoice.groupName} / {invoice.typeName}</td><td className="px-3 py-2 text-right">{school.currency} {money(amount)}</td></tr>
                {discount > 0 && <tr><td className="px-3 py-2">Discount</td><td className="px-3 py-2 text-right">− {school.currency} {money(discount)}</td></tr>}
                {fine > 0 && <tr><td className="px-3 py-2">Late fine</td><td className="px-3 py-2 text-right">{school.currency} {money(fine)}</td></tr>}
              </tbody>
            </table>
            <div className="ml-auto grid max-w-sm grid-cols-2 gap-2 text-right text-sm">
              <span>Total amount</span><strong>{school.currency} {money(total)}</strong>
              <span>Amount paid</span><strong>{school.currency} {money(paid)}</strong>
              <span>Outstanding balance</span><strong>{school.currency} {money(balance)}</strong>
              <span>Payment status</span><strong className="capitalize">{status}</strong>
            </div>
          </article>
        );
      })}
    </main>
  );
}
