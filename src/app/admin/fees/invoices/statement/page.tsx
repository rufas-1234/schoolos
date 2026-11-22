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
  schoolBranches,
  schools,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { calculateFineMinorUnits, feeDisplayName, feeInvoiceStatus, parseMoneyToMinorUnits } from "@/lib/fees-policy";

type SearchParams = { studentId?: string | string[] };

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

export default async function StudentFeeStatementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [context, params] = await Promise.all([
    requireSchoolPermission(["payments.record", "fees.manage"]),
    searchParams,
  ]);
  const studentId = parseId(params.studentId);
  if (!studentId || typeof params.studentId !== "string") notFound();

  const [school, student] = await Promise.all([
    db.select({ name: schools.name, email: schools.email, phone: schools.phone, address: schools.address, timezone: schools.timezone })
      .from(schools).where(eq(schools.id, context.schoolId)).limit(1).then((rows) => rows[0]),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      guardianName: students.guardianName,
      guardianPhone: students.guardianPhone,
      guardianAddress: students.guardianAddress,
    }).from(students).where(and(
      eq(students.id, studentId),
      eq(students.schoolId, context.schoolId),
    )).limit(1).then((rows) => rows[0]),
  ]);
  if (!school || !student) notFound();

  const invoices = await db.select({
    id: studentFeeInvoices.id,
    invoiceNumber: studentFeeInvoices.invoiceNumber,
    currency: studentFeeInvoices.currency,
    amount: studentFeeInvoices.amount,
    discountAmount: studentFeeInvoices.discountAmount,
    fineType: studentFeeInvoices.fineType,
    fineValue: studentFeeInvoices.fineValue,
    dueDate: studentFeeInvoices.dueDate,
    createdAt: studentFeeInvoices.createdAt,
    yearName: academicYears.name,
    termName: academicTerms.name,
    branchName: schoolBranches.name,
    className: classLevels.name,
    sectionName: classSections.name,
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
      eq(studentFeeInvoices.studentId, student.id),
    ))
    .orderBy(asc(academicYears.startDate), asc(academicTerms.startDate), asc(studentFeeInvoices.dueDate), asc(studentFeeInvoices.invoiceNumber));

  const today = todayInTimezone(school.timezone);
  const paymentTotals = invoices.length ? await db.select({
    invoiceId: feePayments.invoiceId,
    paid: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
  }).from(feePayments).where(and(
    eq(feePayments.schoolId, context.schoolId),
    inArray(feePayments.invoiceId, invoices.map((invoice) => invoice.id)),
  )).groupBy(feePayments.invoiceId) : [];
  const paidByInvoice = new Map(paymentTotals.map((row) => [
    row.invoiceId,
    parseMoneyToMinorUnits(row.paid ?? "0") ?? 0,
  ]));
  const currencyTotals = new Map<string, { amount: number; discount: number; fine: number; paid: number; balance: number }>();
  const statementLines = invoices.map((invoice) => {
    const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
    const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
    const fine = today > invoice.dueDate
      ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    const totalDue = Math.max(0, amount - discount + fine);
    const paid = paidByInvoice.get(invoice.id) ?? 0;
    const balance = Math.max(0, totalDue - paid);
    const currency = currencyTotals.get(invoice.currency) ?? { amount: 0, discount: 0, fine: 0, paid: 0, balance: 0 };
    currency.amount += amount;
    currency.discount += discount;
    currency.fine += fine;
    currency.paid += paid;
    currency.balance += balance;
    currencyTotals.set(invoice.currency, currency);
    return { ...invoice, amount, discount, fine, totalDue, paid, balance, status: feeInvoiceStatus(totalDue, paid) ?? "unpaid" };
  });

  return (
    <main className="fee-invoice-page mx-auto max-w-5xl space-y-5 p-6 text-slate-900 print:max-w-none print:p-0">
      <header className="fee-invoice-overview flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Finance · Student account</p>
          <h1 className="mt-1 text-2xl font-bold">Consolidated fee statement</h1>
          <p className="mt-2 text-sm text-slate-600">One printable summary of all generated invoices and payments for this student.</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Link href="/admin/fees/collection" className="text-sm font-semibold text-violet-700">Back to fee collection</Link>
          <PrintButton label="Print fee statement" disabled={statementLines.length === 0} />
        </div>
      </header>

      {statementLines.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 print:hidden">This student has no generated fee invoices to include in a statement.</p>
      ) : (
        <article className="fee-statement-card space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-violet-800 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Student fee statement</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">{school.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{[school.address, school.email, school.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Statement date</span> · {today}</p>
              <p><span className="font-semibold text-slate-900">Invoices included</span> · {statementLines.length}</p>
            </div>
          </header>

          <section className="fee-invoice-parties grid gap-5 sm:grid-cols-2">
            <div>
              <h3>STUDENT</h3>
              <p className="font-semibold">{student.firstName} {student.lastName}</p>
              <p>Admission No. {student.admissionNumber || "—"}</p>
            </div>
            <div>
              <h3>BILL TO</h3>
              <p className="font-semibold">{student.guardianName || `${student.firstName} ${student.lastName}`}</p>
              {student.guardianPhone && <p>{student.guardianPhone}</p>}
              {student.guardianAddress && <p>{student.guardianAddress}</p>}
            </div>
          </section>

          <div className="overflow-x-auto">
            <table className="fee-invoice-items fee-statement-items w-full min-w-[800px] border-collapse text-left text-sm">
              <thead><tr><th>Invoice / due</th><th>Academic period</th><th>Fee</th><th className="text-right">Amount</th><th className="text-right">Discount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
              <tbody>{statementLines.map((line) => (
                <tr key={line.id}>
                  <td><span className="font-semibold">{line.invoiceNumber}</span><span className="block text-xs text-slate-500">Due {line.dueDate}</span></td>
                  <td>{line.yearName}<span className="block text-xs text-slate-500">{line.termName ?? "Full year"} · {line.branchName} · {line.className} ({line.sectionName})</span></td>
                  <td>{feeDisplayName(line.groupName)}<span className="block text-xs text-slate-500">{feeDisplayName(line.typeName)}{line.fine > 0 ? ` · late fine ${line.currency} ${money(line.fine)}` : ""}</span></td>
                  <td className="text-right">{line.currency} {money(line.amount)}</td>
                  <td className="text-right">{line.currency} {money(line.discount)}</td>
                  <td className="text-right">{line.currency} {money(line.paid)}</td>
                  <td className="text-right font-semibold">{line.currency} {money(line.balance)}</td>
                  <td className="capitalize">{line.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <section className="fee-statement-totals ml-auto grid max-w-xl grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-right text-xs sm:text-sm">
            <span className="text-left font-semibold text-slate-600">Currency</span><span className="font-semibold text-slate-600">Invoiced</span><span className="font-semibold text-slate-600">Paid</span><span className="font-semibold text-slate-600">Balance</span>
            {[...currencyTotals].map(([currency, totals]) => (
              <div key={currency} className="contents">
                <span className="text-left font-semibold text-slate-900">{currency}</span>
                <span>{currency} {money(Math.max(0, totals.amount - totals.discount + totals.fine))}</span>
                <span>{currency} {money(totals.paid)}</span>
                <strong className="text-slate-950">{currency} {money(totals.balance)}</strong>
              </div>
            ))}
          </section>
          <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500">This statement summarizes invoices generated by the school and payments recorded against them. Keep it for your records.</footer>
        </article>
      )}
    </main>
  );
}
