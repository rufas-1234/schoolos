import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accountTransactions,
  auditLogs,
  chartOfAccounts,
  schoolBankAccounts,
  schools,
  staffMembers,
  staffPayrollRecords,
} from "@/db/schema";
import { isSchoolAvailable } from "@/lib/school-lifecycle-policy";
import { formatCostMinorUnits, parseCostMinorUnits } from "@/lib/inventory-policy";

export type StaffPayrollPaymentOutcome =
  | "paid"
  | "school-unavailable"
  | "not-found"
  | "already-paid"
  | "invalid-amount"
  | "staff-not-found"
  | "invalid-account"
  | "currency-mismatch";

export type StaffPayrollPaymentInput = {
  schoolPublicId: string;
  actorUserId: string;
  payrollPublicId: string;
  categoryAccountId: number;
  bankAccountId: number;
  paidDate: string;
  reference: string;
};

export async function recordStaffPayrollPayment(
  input: StaffPayrollPaymentInput,
): Promise<StaffPayrollPaymentOutcome> {
  const transactionPublicId = randomUUID();

  return db.transaction(async (tx) => {
    const [school] = await tx.select({
      id: schools.id,
      publicId: schools.publicId,
      status: schools.status,
      archivedAt: schools.archivedAt,
    }).from(schools).where(eq(schools.publicId, input.schoolPublicId)).for("update").limit(1);
    if (!school || !isSchoolAvailable(school.status, school.archivedAt)) return "school-unavailable";

    const [record] = await tx.select({
      id: staffPayrollRecords.id,
      staffId: staffPayrollRecords.staffId,
      publicId: staffPayrollRecords.publicId,
      payPeriod: staffPayrollRecords.payPeriod,
      amount: staffPayrollRecords.amount,
      currency: staffPayrollRecords.currency,
      status: staffPayrollRecords.status,
    }).from(staffPayrollRecords).where(and(
      eq(staffPayrollRecords.publicId, input.payrollPublicId),
      eq(staffPayrollRecords.schoolId, school.id),
    )).for("update").limit(1);
    if (!record) return "not-found";
    if (record.status !== "recorded") return "already-paid";

    const amount = parseCostMinorUnits(record.amount);
    if (amount === null || amount === BigInt(0)) return "invalid-amount";

    const [staff] = await tx.select({
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
    }).from(staffMembers).where(and(
      eq(staffMembers.id, record.staffId),
      eq(staffMembers.schoolId, school.id),
    )).limit(1);
    if (!staff) return "staff-not-found";

    const [category] = await tx.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.id, input.categoryAccountId),
        eq(chartOfAccounts.schoolId, school.id),
        eq(chartOfAccounts.accountType, "expense"),
        eq(chartOfAccounts.status, "active"),
      )).limit(1);
    const [bankAccount] = await tx.select({
      id: schoolBankAccounts.id,
      currency: schoolBankAccounts.currency,
    }).from(schoolBankAccounts).where(and(
      eq(schoolBankAccounts.id, input.bankAccountId),
      eq(schoolBankAccounts.schoolId, school.id),
      eq(schoolBankAccounts.status, "active"),
    )).limit(1);
    if (!category || !bankAccount) return "invalid-account";
    if (bankAccount.currency !== record.currency) return "currency-mismatch";

    const staffName = `${staff.firstName} ${staff.lastName}`;
    await tx.insert(accountTransactions).values({
      publicId: transactionPublicId,
      schoolId: school.id,
      transactionType: "expense",
      categoryAccountId: category.id,
      bankAccountId: bankAccount.id,
      payrollRecordId: record.id,
      currency: record.currency,
      transactionDate: input.paidDate,
      amount: formatCostMinorUnits(amount),
      description: `Staff payroll · ${record.payPeriod}`,
      payee: staffName,
      reference: input.reference || null,
      status: "approved",
      submittedBy: input.actorUserId,
      approvedBy: input.actorUserId,
      approvedAt: new Date(),
    });
    await tx.update(staffPayrollRecords).set({
      status: "paid",
      paidDate: input.paidDate,
    }).where(and(
      eq(staffPayrollRecords.id, record.id),
      eq(staffPayrollRecords.schoolId, school.id),
    ));
    await tx.insert(auditLogs).values({
      schoolId: school.id,
      actorUserId: input.actorUserId,
      action: "account_transaction.payroll_paid",
      resourceType: "account_transaction",
      resourcePublicId: transactionPublicId,
      changedFields: ["transactionType", "categoryAccountId", "bankAccountId", "payrollRecordId", "currency", "transactionDate", "amount", "payee", "reference", "status"],
    });
    await tx.insert(auditLogs).values({
      schoolId: school.id,
      actorUserId: input.actorUserId,
      action: "staff.payroll.paid",
      resourceType: "staff_payroll_record",
      resourcePublicId: record.publicId,
      changedFields: ["status", "paidDate", "accountTransaction"],
    });
    return "paid";
  });
}

export function getStaffPayrollPaymentError(outcome: Exclude<StaffPayrollPaymentOutcome, "paid">) {
  switch (outcome) {
    case "school-unavailable":
      return "This school workspace is not active and cannot record payroll payments.";
    case "not-found":
      return "The payroll record was not found for this school.";
    case "already-paid":
      return "This payroll record has already been paid.";
    case "invalid-amount":
      return "The payroll amount is invalid and cannot be paid.";
    case "staff-not-found":
      return "The payroll staff member could not be found in this school.";
    case "invalid-account":
      return "Choose an active expense category and bank or cash account belonging to this school.";
    case "currency-mismatch":
      return "The bank or cash account currency must match the payroll currency.";
  }
}
