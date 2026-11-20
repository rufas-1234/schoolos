import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { feeAdvanceTransactions, schools, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { parseMoneyToMinorUnits } from "@/lib/fees-policy";
import { ReceiptActions } from "../../../../receipt-actions";

export default async function FeeAdvanceReceiptPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const { publicId } = await params;
  const [receipt] = await db.select({
    receiptNumber: feeAdvanceTransactions.receiptNumber,
    amount: feeAdvanceTransactions.amount,
    paymentMethod: feeAdvanceTransactions.paymentMethod,
    reference: feeAdvanceTransactions.reference,
    notes: feeAdvanceTransactions.notes,
    createdAt: feeAdvanceTransactions.createdAt,
    studentName: students.firstName,
    studentLastName: students.lastName,
    admissionNumber: students.admissionNumber,
    currency: schools.currency,
    schoolName: schools.name,
  }).from(feeAdvanceTransactions)
    .innerJoin(students, and(
      eq(students.id, feeAdvanceTransactions.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .innerJoin(schools, eq(schools.id, context.schoolId))
    .where(and(
      eq(feeAdvanceTransactions.publicId, publicId),
      eq(feeAdvanceTransactions.schoolId, context.schoolId),
      eq(feeAdvanceTransactions.transactionType, "received"),
    ))
    .limit(1);
  if (!receipt || !receipt.receiptNumber) notFound();
  const amountMinor = parseMoneyToMinorUnits(receipt.amount);
  if (amountMinor === null) throw new Error("Stored advance receipt amount is invalid.");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 sm:p-6 print:border-0 print:p-0">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Advance fee receipt</p>
          <h1 className="mt-1 break-words text-2xl font-bold">{receipt.schoolName}</h1>
          <p className="mt-1 break-all text-sm font-medium text-slate-600">Receipt no. {receipt.receiptNumber}</p>
        </div>
        <ReceiptActions />
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received from</p>
          <p className="mt-1 break-words font-semibold">{receipt.studentName} {receipt.studentLastName}</p>
          <p className="mt-1 text-sm text-slate-600">Admission {receipt.admissionNumber || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment details</p>
          <p className="mt-1 text-sm">Date: {receipt.createdAt.toISOString().slice(0, 10)}</p>
          <p className="mt-1 text-sm capitalize">Method: {receipt.paymentMethod?.replaceAll("_", " ") ?? "—"}</p>
          {receipt.reference && <p className="mt-1 break-words text-sm">Reference: {receipt.reference}</p>}
        </div>
      </section>
      <div className="flex flex-col gap-2 rounded-xl bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-semibold text-emerald-950">Advance received for future fees</span>
        <strong className="text-xl text-emerald-950">{receipt.currency} {(amountMinor / 100).toFixed(2)}</strong>
      </div>
      {receipt.notes && <p className="break-words text-sm text-slate-600">Notes: {receipt.notes}</p>}
      <p className="rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
        Advance credited to the student balance. Apply it when a fee invoice is available.
      </p>
      <Link href="/admin/fees/collection/carry-forward" className="print:hidden inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50">
        Back to carry-forward fees
      </Link>
    </main>
  );
}
