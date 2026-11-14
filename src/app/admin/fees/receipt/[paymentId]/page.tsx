import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  classLevels,
  classSections,
  feeGroups,
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
import { ReceiptActions } from "../../receipt-actions";
import { FeePaymentReversalForm } from "../../fee-forms";
import { parseMoneyToMinorUnits } from "@/lib/fees-policy";

export default async function FeeReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const { paymentId } = await params;
  const [receipt] = await db.select({
    id: feePayments.id,
    publicId: feePayments.publicId,
    receiptNumber: feePayments.receiptNumber,
    amount: feePayments.amount,
    reversedAmount: feePayments.reversedAmount,
    fineAmount: feePayments.fineAmount,
    paymentMethod: feePayments.paymentMethod,
    reference: feePayments.reference,
    notes: feePayments.notes,
    paidAt: feePayments.paidAt,
    invoiceNumber: studentFeeInvoices.invoiceNumber,
    dueDate: studentFeeInvoices.dueDate,
    studentName: students.firstName,
    studentLastName: students.lastName,
    admissionNumber: students.admissionNumber,
    rollNumber: studentEnrollments.rollNumber,
    branchName: schoolBranches.name,
    className: classLevels.name,
    sectionName: classSections.name,
    groupName: feeGroups.name,
    feeTypeName: feeTypes.name,
    currency: schools.currency,
    schoolName: schools.name,
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
    .innerJoin(feeGroups, and(
      eq(feeGroups.id, feeStructures.feeGroupId),
      eq(feeGroups.schoolId, context.schoolId),
    ))
    .innerJoin(feeTypes, and(
      eq(feeTypes.id, feeStructures.feeTypeId),
      eq(feeTypes.schoolId, context.schoolId),
    ))
    .innerJoin(schools, eq(schools.id, context.schoolId))
    .where(and(
      eq(feePayments.publicId, paymentId),
      eq(feePayments.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!receipt) notFound();
  const reversals = await db.select({
    amount: feePaymentReversals.amount,
    reversalType: feePaymentReversals.reversalType,
    reason: feePaymentReversals.reason,
    reference: feePaymentReversals.reference,
    createdAt: feePaymentReversals.createdAt,
  }).from(feePaymentReversals)
    .where(and(
      eq(feePaymentReversals.paymentId, receipt.id),
      eq(feePaymentReversals.schoolId, context.schoolId),
    ))
    .orderBy(feePaymentReversals.createdAt);
  const originalAmount = parseMoneyToMinorUnits(receipt.amount);
  const reversedAmount = parseMoneyToMinorUnits(receipt.reversedAmount);
  if (originalAmount === null || reversedAmount === null) throw new Error("Stored receipt amount is invalid.");
  const netAmount = (originalAmount - reversedAmount) / 100;

  return (
    <main className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-semibold text-violet-700">Payment receipt</p>
          <h1 className="mt-1 text-2xl font-bold">{receipt.schoolName}</h1>
          <p className="mt-1 text-sm text-slate-500">Receipt {receipt.receiptNumber}</p>
        </div>
        <ReceiptActions />
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        <ReceiptField label="Student" value={`${receipt.studentName} ${receipt.studentLastName}`} />
        <ReceiptField label="Admission / roll number" value={`${receipt.admissionNumber || "—"} / ${receipt.rollNumber || "—"}`} />
        <ReceiptField label="Branch / class / section" value={`${receipt.branchName} / ${receipt.className} / ${receipt.sectionName}`} />
        <ReceiptField label="Fee" value={`${receipt.groupName} / ${receipt.feeTypeName}`} />
        <ReceiptField label="Invoice" value={receipt.invoiceNumber} />
        <ReceiptField label="Payment date" value={receipt.paidAt.toISOString().replace("T", " ").slice(0, 16)} />
        <ReceiptField label="Payment method" value={receipt.paymentMethod.replace("_", " ")} />
        <ReceiptField label="Reference" value={receipt.reference || "—"} />
      </section>
      <section className="space-y-3 rounded-xl bg-slate-50 p-5">
        <div className="flex justify-between gap-4 text-sm">
          <span>Original payment amount</span><strong>{receipt.currency} {receipt.amount}</strong>
        </div>
        <div className="flex justify-between gap-4 text-sm">
          <span>Reversed / refunded</span><strong>{receipt.currency} {(reversedAmount / 100).toFixed(2)}</strong>
        </div>
        <div className="flex justify-between gap-4 text-sm">
          <span>Net payment retained</span><strong>{receipt.currency} {netAmount.toFixed(2)}</strong>
        </div>
        <div className="flex justify-between gap-4 text-sm">
          <span>Late fine included</span><strong>{receipt.currency} {receipt.fineAmount}</strong>
        </div>
      </section>
      {receipt.notes && (
        <div>
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="mt-1 text-sm text-slate-600">{receipt.notes}</p>
        </div>
      )}
      {reversals.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Reversals and refunds</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            {reversals.map((reversal, index) => (
              <li key={`${reversal.createdAt.toISOString()}-${index}`}>
                {reversal.reversalType} · {receipt.currency} {reversal.amount} · {reversal.reason}
                {reversal.reference ? ` · Ref ${reversal.reference}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">Due date: {receipt.dueDate}</p>
      {netAmount > 0 && (
        <div className="print:hidden">
          <FeePaymentReversalForm
            paymentId={receipt.id}
            amount={netAmount.toFixed(2)}
            currency={receipt.currency}
            idempotencyKey={randomUUID()}
          />
        </div>
      )}
    </main>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
