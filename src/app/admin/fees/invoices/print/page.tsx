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
import { calculateFineMinorUnits, feeDisplayName, feeInvoiceStatus, parseMoneyToMinorUnits } from "@/lib/fees-policy";

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

  const [school] = await db.select({
    name: schools.name,
    email: schools.email,
    phone: schools.phone,
    address: schools.address,
    currency: schools.currency,
    timezone: schools.timezone,
  })
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
    guardianName: students.guardianName,
    guardianAddress: students.guardianAddress,
    guardianPhone: students.guardianPhone,
    fatherName: students.fatherName,
    fatherPhone: students.fatherPhone,
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
    <main className="fee-invoice-page mx-auto max-w-5xl space-y-6 p-6 text-slate-900 print:max-w-none print:p-0">
      <header className="fee-invoice-overview flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Student finances</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Fee invoice{invoices.length === 1 ? "" : "s"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · Total outstanding {school.currency} {money(totalOutstanding)}
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
        const billToName = invoice.guardianName || invoice.fatherName || `${invoice.studentName} ${invoice.studentLastName}`;
        const billToPhone = invoice.guardianPhone || invoice.fatherPhone;
        return (
          <article key={invoice.id} className="fee-invoice-card space-y-5 rounded-2xl border border-slate-200 bg-white p-7">
            <header className="fee-invoice-title-row flex flex-wrap items-start justify-between gap-5">
              <div>
                <h2 className="fee-invoice-title">INVOICE</h2>
                <p className="mt-2 text-base font-bold text-slate-900">{school.name}</p>
                {[school.address, school.email, school.phone].filter(Boolean).map((detail, index) => (
                  <p key={`${index}-${detail}`} className="mt-1 text-sm text-slate-600">{detail}</p>
                ))}
              </div>
              <div className="fee-invoice-number-block">
                <span>Invoice #</span>
                <strong>{invoice.invoiceNumber}</strong>
              </div>
            </header>

            <section className="fee-invoice-parties grid gap-5 sm:grid-cols-2">
              <div>
                <h3>BILL TO</h3>
                <p className="font-semibold">{billToName}</p>
                {invoice.guardianAddress && <p>{invoice.guardianAddress}</p>}
                {billToPhone && <p>{billToPhone}</p>}
                {invoice.guardianName && <p>Parent / guardian of {invoice.studentName} {invoice.studentLastName}</p>}
              </div>
              <div>
                <h3>STUDENT</h3>
                <p className="font-semibold">{invoice.studentName} {invoice.studentLastName}</p>
                <p>Admission No. {invoice.admissionNumber || "—"} · Roll {invoice.rollNumber || "—"}</p>
                <p>{invoice.branchName} · {invoice.className} ({invoice.sectionName})</p>
              </div>
            </section>

            <dl className="fee-invoice-meta grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
              <div><dt>Invoice date</dt><dd>{invoice.createdAt.toISOString().slice(0, 10)}</dd></div>
              <div><dt>Academic year</dt><dd>{invoice.yearName}</dd></div>
              <div><dt>Term</dt><dd>{invoice.termName || "—"}</dd></div>
              <div><dt>Due date</dt><dd>{invoice.dueDate}</dd></div>
            </dl>

            <div className="fee-invoice-divider" aria-hidden="true">★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★</div>

            <table className="fee-invoice-items w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th>Qty</th>
                  <th>Description</th>
                  <th className="text-right">Unit price</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>{feeDisplayName(invoice.typeName)}</td>
                  <td className="text-right">{school.currency} {money(amount)}</td>
                  <td className="text-right">{school.currency} {money(amount)}</td>
                </tr>
                {discount > 0 && <tr><td></td><td>Discount</td><td></td><td className="text-right">− {school.currency} {money(discount)}</td></tr>}
                {fine > 0 && <tr><td></td><td>Late fine</td><td></td><td className="text-right">{school.currency} {money(fine)}</td></tr>}
              </tbody>
            </table>

            <div className="fee-invoice-totals ml-auto grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-right text-sm">
              <span>Subtotal</span><strong>{school.currency} {money(amount)}</strong>
              {discount > 0 && <><span>Discount</span><strong>− {school.currency} {money(discount)}</strong></>}
              {fine > 0 && <><span>Late fine</span><strong>{school.currency} {money(fine)}</strong></>}
              <span className="fee-invoice-total-label">Total</span><strong className="fee-invoice-total-amount">{school.currency} {money(total)}</strong>
              <span>Amount paid</span><strong>{school.currency} {money(paid)}</strong>
              <span className="font-semibold">Amount due</span><strong className="fee-invoice-balance">{school.currency} {money(balance)}</strong>
              <span>Payment status</span><strong className="fee-invoice-status capitalize">{status}</strong>
            </div>

            <footer className="fee-invoice-footer grid gap-5 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="fee-invoice-thank-you">Thank you</p>
                <p className="mt-1 text-sm text-slate-600">We appreciate your timely payment.</p>
              </div>
              <div className="sm:text-right">
                <h3>PAYMENT INFORMATION</h3>
                <p>Use invoice number <strong>{invoice.invoiceNumber}</strong> as your payment reference.</p>
                <p>Please keep this invoice for your records.</p>
              </div>
            </footer>
          </article>
        );
      })}
    </main>
  );
}
