import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
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
import { ReceiptActions } from "../../receipt-actions";

export default async function FeeReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const { paymentId } = await params;
  const [receipt] = await db.select({
    publicId: feePayments.publicId,
    amount: feePayments.amount,
    fineAmount: feePayments.fineAmount,
    paymentMethod: feePayments.paymentMethod,
    reference: feePayments.reference,
    notes: feePayments.notes,
    paidAt: feePayments.paidAt,
    invoiceId: studentFeeInvoices.publicId,
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

  return (
    <main className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-semibold text-violet-700">Payment receipt</p>
          <h1 className="mt-1 text-2xl font-bold">{receipt.schoolName}</h1>
          <p className="mt-1 text-sm text-slate-500">Receipt {receipt.publicId.toUpperCase()}</p>
        </div>
        <ReceiptActions />
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        <ReceiptField label="Student" value={`${receipt.studentName} ${receipt.studentLastName}`} />
        <ReceiptField label="Admission / roll number" value={`${receipt.admissionNumber || "—"} / ${receipt.rollNumber || "—"}`} />
        <ReceiptField label="Branch / class / section" value={`${receipt.branchName} / ${receipt.className} / ${receipt.sectionName}`} />
        <ReceiptField label="Fee" value={`${receipt.groupName} / ${receipt.feeTypeName}`} />
        <ReceiptField label="Invoice" value={receipt.invoiceId.toUpperCase()} />
        <ReceiptField label="Payment date" value={receipt.paidAt.toISOString().replace("T", " ").slice(0, 16)} />
        <ReceiptField label="Payment method" value={receipt.paymentMethod.replace("_", " ")} />
        <ReceiptField label="Reference" value={receipt.reference || "—"} />
      </section>
      <section className="space-y-3 rounded-xl bg-slate-50 p-5">
        <div className="flex justify-between gap-4 text-sm">
          <span>Payment amount</span><strong>{receipt.currency} {receipt.amount}</strong>
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
      <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">Due date: {receipt.dueDate}</p>
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
