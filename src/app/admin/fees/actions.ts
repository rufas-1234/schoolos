"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, like, ne, or, sql, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  academicTerms,
  auditLogs,
  classLevels,
  classSections,
  feeDiscounts,
  feeAdvanceTransactions,
  feeGroups,
  feePayments,
  feePaymentReversals,
  feeStructures,
  feeTypes,
  schoolCurrencies,
  schools,
  schoolBranches,
  studentEnrollments,
  studentFeeDiscounts,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate, isDateRangeWithin } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  calculateOutstandingInvoiceBalance,
  calculateDiscountMinorUnits,
  calculateFineMinorUnits,
  feeInvoiceStatus,
  feePaymentMethods,
  isPayDateOnOrAfterDueDate,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";

export type FeeActionState = { error?: string; success?: boolean; message?: string; receiptUrl?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const nameField = z.string().trim().min(1).max(120);
const optionalText = z.string().trim().max(500).transform((value) => value || null);
const optionalDescription = z.string().trim().max(1000).transform((value) => value || null);
const amountField = z.string().refine((value) => parseMoneyToMinorUnits(value) !== null);
const dateField = z.string().refine(isCalendarDate);
const currencyField = z.string().regex(/^[A-Z]{3}$/);
const groupSchema = z.object({ name: nameField, description: optionalDescription });
const typeSchema = z.object({
  feeGroupId: idField,
  name: nameField,
  description: optionalDescription,
});
const discountSchema = z.object({
  name: nameField,
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/).transform((value) => value.toUpperCase()),
  description: optionalDescription,
  discountType: z.enum(["fixed", "percentage"]),
  value: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),
  currency: currencyField,
  frequency: z.enum(["one_time", "yearly"]),
});
const studentDiscountSchema = z.object({
  studentId: idField,
  feeTypeId: idField,
  discountId: idField,
  note: optionalText,
});
const structureSchema = z.object({
  branchId: idField,
  academicYearId: idField,
  academicTermId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
  studentId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
  classLevelId: idField,
  feeGroupId: idField,
  feeTypeId: idField,
  amount: amountField,
  currency: currencyField,
  dueDate: dateField,
  fineType: z.enum(["none", "fixed", "percentage"]),
  fineValue: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),
});
const paymentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  invoiceId: idField,
  amount: amountField,
  paymentMethod: z.enum(feePaymentMethods),
  reference: z.string().trim().max(120).transform((value) => value || null),
  notes: optionalText,
});
const advanceCreditSchema = z.object({
  idempotencyKey: z.string().uuid(),
  studentId: idField,
  currency: currencyField,
  amount: amountField,
  paymentMethod: z.enum(feePaymentMethods),
  reference: z.string().trim().max(120).transform((value) => value || null),
  notes: optionalText,
});
const applyAdvanceCreditSchema = z.object({
  idempotencyKey: z.string().uuid(),
  studentId: idField,
  invoiceId: idField,
});
const bulkPaymentSchema = z.object({
  search: z.string().trim().max(100),
  currency: currencyField,
  status: z.enum(["", "unpaid", "partial", "paid"]),
  branchId: z.union([z.literal(""), idField]),
  classLevelId: z.union([z.literal(""), idField]),
  sectionId: z.union([z.literal(""), idField]),
  paymentMethod: z.enum(feePaymentMethods),
  reference: z.string().trim().max(120).transform((value) => value || null),
  notes: optionalText,
});
const invoiceEditSchema = z.object({
  invoiceId: idField,
  amount: amountField,
  discountAmount: amountField,
  dueDate: dateField,
  fineType: z.enum(["none", "fixed", "percentage"]),
  fineValue: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),
});
const reversalSchema = z.object({
  paymentId: idField,
  idempotencyKey: z.string().uuid(),
  amount: amountField,
  reversalType: z.enum(["reversal", "refund"]),
  reason: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(120).transform((value) => value || null),
});

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function readEditId(formData: FormData): number | null | undefined {
  const rawId = value(formData, "recordId");
  if (!rawId) return null;
  const parsed = idField.safeParse(rawId);
  return parsed.success ? parsed.data : undefined;
}

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({ schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields });
}

function revalidateFees() {
  revalidatePath("/admin/fees");
  revalidatePath("/admin/fees/collection");
  revalidatePath("/admin/fees/collection/carry-forward");
  revalidatePath("/admin/fees/reports");
}

function duplicateError(label: string): FeeActionState {
  return { error: `A ${label} with those details already exists.` };
}

type FeeRecordType = "group" | "type" | "discount" | "student-discount" | "structure";

async function deleteFeeRecord(
  type: FeeRecordType,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const recordId = idField.safeParse(value(formData, "recordId"));
  if (!recordId.success) return { error: "Select a valid fee record." };
  const outcome = await db.transaction(async (tx) => {
    if (type === "group") {
      const [record] = await tx.select({ publicId: feeGroups.publicId }).from(feeGroups)
        .where(and(eq(feeGroups.id, recordId.data), eq(feeGroups.schoolId, context.schoolId)))
        .for("update").limit(1);
      if (!record) return "not-found";
      const [linked] = await tx.select({ id: feeTypes.id }).from(feeTypes)
        .where(and(eq(feeTypes.schoolId, context.schoolId), eq(feeTypes.feeGroupId, recordId.data))).limit(1);
      const [structured] = await tx.select({ id: feeStructures.id }).from(feeStructures)
        .where(and(eq(feeStructures.schoolId, context.schoolId), eq(feeStructures.feeGroupId, recordId.data))).limit(1);
      if (linked || structured) return "in-use";
      await tx.delete(feeGroups).where(and(eq(feeGroups.id, recordId.data), eq(feeGroups.schoolId, context.schoolId)));
      await writeAudit(tx, context.schoolId, context.user.id, "fee_group.deleted", "fee_group", record.publicId, ["deleted"]);
    } else if (type === "type") {
      const [record] = await tx.select({ publicId: feeTypes.publicId }).from(feeTypes)
        .where(and(eq(feeTypes.id, recordId.data), eq(feeTypes.schoolId, context.schoolId)))
        .for("update").limit(1);
      if (!record) return "not-found";
      const [linked] = await tx.select({ id: feeStructures.id }).from(feeStructures)
        .where(and(eq(feeStructures.schoolId, context.schoolId), eq(feeStructures.feeTypeId, recordId.data))).limit(1);
      const [assigned] = await tx.select({ id: studentFeeDiscounts.id }).from(studentFeeDiscounts)
        .where(and(eq(studentFeeDiscounts.schoolId, context.schoolId), eq(studentFeeDiscounts.feeTypeId, recordId.data))).limit(1);
      if (linked || assigned) return "in-use";
      await tx.delete(feeTypes).where(and(eq(feeTypes.id, recordId.data), eq(feeTypes.schoolId, context.schoolId)));
      await writeAudit(tx, context.schoolId, context.user.id, "fee_type.deleted", "fee_type", record.publicId, ["deleted"]);
    } else if (type === "discount") {
      const [record] = await tx.select({ publicId: feeDiscounts.publicId }).from(feeDiscounts)
        .where(and(eq(feeDiscounts.id, recordId.data), eq(feeDiscounts.schoolId, context.schoolId)))
        .for("update").limit(1);
      if (!record) return "not-found";
      const [assigned] = await tx.select({ id: studentFeeDiscounts.id }).from(studentFeeDiscounts)
        .where(and(eq(studentFeeDiscounts.schoolId, context.schoolId), eq(studentFeeDiscounts.discountId, recordId.data))).limit(1);
      const [invoiced] = await tx.select({ id: studentFeeInvoices.id }).from(studentFeeInvoices)
        .where(and(eq(studentFeeInvoices.schoolId, context.schoolId), eq(studentFeeInvoices.discountId, recordId.data))).limit(1);
      if (assigned || invoiced) return "in-use";
      await tx.delete(feeDiscounts).where(and(eq(feeDiscounts.id, recordId.data), eq(feeDiscounts.schoolId, context.schoolId)));
      await writeAudit(tx, context.schoolId, context.user.id, "fee_discount.deleted", "fee_discount", record.publicId, ["deleted"]);
    } else if (type === "student-discount") {
      const [record] = await tx.select({
        publicId: studentFeeDiscounts.publicId,
        discountId: studentFeeDiscounts.discountId,
        studentId: studentFeeDiscounts.studentId,
        feeTypeId: studentFeeDiscounts.feeTypeId,
      }).from(studentFeeDiscounts)
        .where(and(eq(studentFeeDiscounts.id, recordId.data), eq(studentFeeDiscounts.schoolId, context.schoolId)))
        .for("update").limit(1);
      if (!record) return "not-found";
      const [invoiced] = await tx.select({ id: studentFeeInvoices.id })
        .from(studentFeeInvoices)
        .innerJoin(feeStructures, and(
          eq(feeStructures.id, studentFeeInvoices.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          eq(studentFeeInvoices.discountId, record.discountId),
          eq(studentFeeInvoices.studentId, record.studentId),
          eq(feeStructures.feeTypeId, record.feeTypeId),
        )).limit(1);
      if (invoiced) return "in-use";
      await tx.delete(studentFeeDiscounts).where(and(
        eq(studentFeeDiscounts.id, recordId.data),
        eq(studentFeeDiscounts.schoolId, context.schoolId),
      ));
      await writeAudit(tx, context.schoolId, context.user.id, "student_fee_discount.deleted", "student_fee_discount", record.publicId, ["deleted"]);
    } else {
      const [record] = await tx.select({ publicId: feeStructures.publicId }).from(feeStructures)
        .where(and(eq(feeStructures.id, recordId.data), eq(feeStructures.schoolId, context.schoolId)))
        .for("update").limit(1);
      if (!record) return "not-found";
      const [invoiced] = await tx.select({ id: studentFeeInvoices.id }).from(studentFeeInvoices)
        .where(and(eq(studentFeeInvoices.schoolId, context.schoolId), eq(studentFeeInvoices.feeStructureId, recordId.data))).limit(1);
      if (invoiced) return "in-use";
      await tx.delete(feeStructures).where(and(
        eq(feeStructures.id, recordId.data),
        eq(feeStructures.schoolId, context.schoolId),
      ));
      await writeAudit(tx, context.schoolId, context.user.id, "fee_structure.deleted", "fee_structure", record.publicId, ["deleted"]);
    }
    return "deleted";
  });
  if (outcome === "not-found") return { error: "Fee record not found for this school." };
  if (outcome === "in-use") return { error: "This fee record is referenced by other setup or financial records and cannot be deleted. Edit it instead so financial history stays intact." };
  revalidateFees();
  return { success: true, message: "Fee record deleted." };
}

export async function deleteFeeGroup(_previousState: FeeActionState, formData: FormData) {
  return deleteFeeRecord("group", formData);
}

export async function deleteFeeType(_previousState: FeeActionState, formData: FormData) {
  return deleteFeeRecord("type", formData);
}

export async function deleteFeeDiscount(_previousState: FeeActionState, formData: FormData) {
  return deleteFeeRecord("discount", formData);
}

export async function deleteStudentFeeDiscount(_previousState: FeeActionState, formData: FormData) {
  return deleteFeeRecord("student-discount", formData);
}

export async function deleteFeeStructure(_previousState: FeeActionState, formData: FormData) {
  return deleteFeeRecord("structure", formData);
}

export async function createFeeGroup(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const recordId = readEditId(formData);
  const result = groupSchema.safeParse({
    name: value(formData, "name"),
    description: value(formData, "description"),
  });
  if (recordId === undefined || !result.success) return { error: "Enter a fee group name and valid description." };
  const publicId = randomUUID();
  try {
    const updated = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [record] = await tx.select({ publicId: feeGroups.publicId }).from(feeGroups)
          .where(and(eq(feeGroups.id, recordId), eq(feeGroups.schoolId, context.schoolId)))
          .for("update").limit(1);
        if (!record) return false;
        await tx.update(feeGroups).set({ name: result.data.name, description: result.data.description })
          .where(and(eq(feeGroups.id, recordId), eq(feeGroups.schoolId, context.schoolId)));
        await writeAudit(tx, context.schoolId, context.user.id, "fee_group.updated", "fee_group", record.publicId, ["name", "description"]);
      } else {
        await tx.insert(feeGroups).values({
          publicId,
          schoolId: context.schoolId,
          name: result.data.name,
          description: result.data.description || null,
        });
        await writeAudit(tx, context.schoolId, context.user.id, "fee_group.created", "fee_group", publicId, ["name", "description"]);
      }
      return true;
    });
    if (!updated) return { error: "Fee group not found for this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("fee group");
    throw error;
  }
  revalidateFees();
  return { success: true };
}

export async function createFeeType(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const recordId = readEditId(formData);
  const result = typeSchema.safeParse({
    feeGroupId: value(formData, "feeGroupId"),
    name: value(formData, "name"),
    description: value(formData, "description"),
  });
  if (recordId === undefined || !result.success) return { error: "Enter a fee type name and select a fee group." };
  const [group] = await db.select({ id: feeGroups.id }).from(feeGroups)
    .where(and(eq(feeGroups.id, result.data.feeGroupId), eq(feeGroups.schoolId, context.schoolId))).limit(1);
  if (!group) return { error: "Fee group not found for this school." };
  const publicId = randomUUID();
  try {
    const updated = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [record] = await tx.select({ publicId: feeTypes.publicId }).from(feeTypes)
          .where(and(eq(feeTypes.id, recordId), eq(feeTypes.schoolId, context.schoolId)))
          .for("update").limit(1);
        if (!record) return false;
        await tx.update(feeTypes).set({
          feeGroupId: group.id,
          name: result.data.name,
          description: result.data.description,
        }).where(and(eq(feeTypes.id, recordId), eq(feeTypes.schoolId, context.schoolId)));
        await writeAudit(tx, context.schoolId, context.user.id, "fee_type.updated", "fee_type", record.publicId, ["feeGroupId", "name", "description"]);
      } else {
        await tx.insert(feeTypes).values({
          publicId,
          schoolId: context.schoolId,
          feeGroupId: group.id,
          name: result.data.name,
          description: result.data.description || null,
        });
        await writeAudit(tx, context.schoolId, context.user.id, "fee_type.created", "fee_type", publicId, ["feeGroupId", "name", "description"]);
      }
      return true;
    });
    if (!updated) return { error: "Fee type not found for this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("fee type");
    throw error;
  }
  revalidateFees();
  return { success: true };
}

export async function createFeeDiscount(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const recordId = readEditId(formData);
  const result = discountSchema.safeParse({
    name: value(formData, "name"),
    code: value(formData, "code"),
    description: value(formData, "description"),
    discountType: value(formData, "discountType"),
    value: value(formData, "value"),
    currency: value(formData, "currency"),
    frequency: value(formData, "frequency"),
  });
  const discountMinor = result.success ? parseMoneyToMinorUnits(result.data.value) : null;
  if (recordId === undefined || !result.success || discountMinor === null || discountMinor <= 0 ||
    (result.data.discountType === "percentage" && discountMinor > 10000)) {
    return { error: "Enter a valid discount; percentage discounts cannot exceed 100%." };
  }
  const [configuredCurrency] = await db.select({ code: schoolCurrencies.code }).from(schoolCurrencies)
    .where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, result.data.currency),
    )).limit(1);
  if (!configuredCurrency) return { error: "Choose a currency configured for this school." };
  const publicId = randomUUID();
  try {
    const updated = await db.transaction(async (tx) => {
      const values = {
        name: result.data.name,
        code: result.data.code,
        description: result.data.description,
        discountType: result.data.discountType,
        value: result.data.value,
        currency: result.data.currency,
        frequency: result.data.frequency,
      };
      if (recordId !== null) {
        const [record] = await tx.select({ publicId: feeDiscounts.publicId }).from(feeDiscounts)
          .where(and(eq(feeDiscounts.id, recordId), eq(feeDiscounts.schoolId, context.schoolId)))
          .for("update").limit(1);
        if (!record) return false;
        await tx.update(feeDiscounts).set(values)
          .where(and(eq(feeDiscounts.id, recordId), eq(feeDiscounts.schoolId, context.schoolId)));
        await writeAudit(tx, context.schoolId, context.user.id, "fee_discount.updated", "fee_discount", record.publicId,
          ["name", "code", "description", "discountType", "value", "currency", "frequency"]);
      } else {
        await tx.insert(feeDiscounts).values({ publicId, schoolId: context.schoolId, ...values });
        await writeAudit(tx, context.schoolId, context.user.id, "fee_discount.created", "fee_discount", publicId,
          ["name", "code", "description", "discountType", "value", "currency", "frequency"]);
      }
      return true;
    });
    if (!updated) return { error: "Discount not found for this school." };
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("discount");
    throw error;
  }
  revalidateFees();
  return { success: true };
}

export async function assignStudentFeeDiscount(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const result = studentDiscountSchema.safeParse({
    studentId: value(formData, "studentId"),
    feeTypeId: value(formData, "feeTypeId"),
    discountId: value(formData, "discountId"),
    note: value(formData, "note"),
  });
  if (!result.success) return { error: "Select a valid student and discount." };

  const publicId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx.select({ id: students.id }).from(students)
      .where(and(eq(students.id, result.data.studentId), eq(students.schoolId, context.schoolId)))
      .for("update").limit(1);
    const [feeType] = await tx.select({ id: feeTypes.id }).from(feeTypes)
      .where(and(eq(feeTypes.id, result.data.feeTypeId), eq(feeTypes.schoolId, context.schoolId)))
      .limit(1);
    const [discount] = await tx.select({ id: feeDiscounts.id }).from(feeDiscounts)
      .where(and(eq(feeDiscounts.id, result.data.discountId), eq(feeDiscounts.schoolId, context.schoolId)))
      .limit(1);
    if (!student || !feeType || !discount) return "not-found";
    const [existing] = await tx.select({ id: studentFeeDiscounts.id, publicId: studentFeeDiscounts.publicId })
      .from(studentFeeDiscounts)
      .where(and(
        eq(studentFeeDiscounts.schoolId, context.schoolId),
        eq(studentFeeDiscounts.studentId, student.id),
        eq(studentFeeDiscounts.feeTypeId, feeType.id),
      ))
      .for("update").limit(1);
    if (existing) {
      await tx.update(studentFeeDiscounts).set({ discountId: discount.id, note: result.data.note, assignedBy: context.user.id })
        .where(eq(studentFeeDiscounts.id, existing.id));
      await writeAudit(tx, context.schoolId, context.user.id, "fee_discount.assigned", "student_fee_discount", existing.publicId,
        ["feeTypeId", "discountId", "note"]);
    } else {
      await tx.insert(studentFeeDiscounts).values({
        publicId, schoolId: context.schoolId, studentId: student.id, feeTypeId: feeType.id, discountId: discount.id,
        note: result.data.note, assignedBy: context.user.id,
      });
      await writeAudit(tx, context.schoolId, context.user.id, "fee_discount.assigned", "student_fee_discount", publicId,
        ["studentId", "feeTypeId", "discountId", "note"]);
    }
    return "saved";
  });
  if (outcome === "not-found") return { error: "Student or discount was not found for this school." };
  revalidateFees();
  return { success: true };
}

export async function createFeeStructure(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const recordId = readEditId(formData);
  const result = structureSchema.safeParse({
    branchId: value(formData, "branchId"),
    academicYearId: value(formData, "academicYearId"),
    academicTermId: value(formData, "academicTermId"),
    studentId: value(formData, "studentId"),
    classLevelId: value(formData, "classLevelId"),
    feeGroupId: value(formData, "feeGroupId"),
    feeTypeId: value(formData, "feeTypeId"),
    amount: value(formData, "amount"),
    currency: value(formData, "currency"),
    dueDate: value(formData, "dueDate"),
    fineType: value(formData, "fineType"),
    fineValue: value(formData, "fineValue") || "0",
  });
  if (recordId === undefined || !result.success || parseMoneyToMinorUnits(result.data.amount) === 0 ||
      parseMoneyToMinorUnits(result.data.fineValue) === null ||
      (result.data.fineType === "percentage" && (parseMoneyToMinorUnits(result.data.fineValue) ?? 10001) > 10000) ||
      (result.data.fineType === "none" && parseMoneyToMinorUnits(result.data.fineValue) !== 0)) {
    return { error: "Enter a positive fee amount, valid due date, and valid fine settings." };
  }
  const [configuredCurrency] = await db.select({ code: schoolCurrencies.code }).from(schoolCurrencies)
    .where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, result.data.currency),
    )).limit(1);
  if (!configuredCurrency) return { error: "Choose a currency configured for this school." };

  const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches)
    .where(and(eq(schoolBranches.id, result.data.branchId), eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
    .limit(1);
  const [year] = await db.select({ id: academicYears.id, startDate: academicYears.startDate, endDate: academicYears.endDate })
    .from(academicYears)
    .where(and(eq(academicYears.id, result.data.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .limit(1);
  const [classLevel] = await db.select({ id: classLevels.id }).from(classLevels)
    .where(and(
      eq(classLevels.id, result.data.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
      eq(classLevels.branchId, result.data.branchId),
      eq(classLevels.status, "active"),
    ))
    .limit(1);
  const [group] = await db.select({ id: feeGroups.id }).from(feeGroups)
    .where(and(eq(feeGroups.id, result.data.feeGroupId), eq(feeGroups.schoolId, context.schoolId))).limit(1);
  const [type] = await db.select({ id: feeTypes.id, feeGroupId: feeTypes.feeGroupId }).from(feeTypes)
    .where(and(eq(feeTypes.id, result.data.feeTypeId), eq(feeTypes.schoolId, context.schoolId))).limit(1);
  if (!branch) return { error: "The selected branch is unavailable for this school. Choose an active branch." };
  if (!year) return { error: "The selected academic year does not belong to this school." };
  if (!classLevel) return { error: "The selected class does not belong to the selected branch, or is inactive. Choose a class labeled with this branch." };
  if (!group) return { error: "The selected fee group does not belong to this school." };
  if (!type) return { error: "The selected fee type does not belong to this school." };
  if (type.feeGroupId !== group.id) return { error: "The selected fee type belongs to a different fee group. Choose the group shown before the fee type name." };
  const [term] = result.data.academicTermId === null
    ? [null]
    : await db.select({
        id: academicTerms.id,
        academicYearId: academicTerms.academicYearId,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
      }).from(academicTerms)
        .where(and(
          eq(academicTerms.id, result.data.academicTermId),
          eq(academicTerms.schoolId, context.schoolId),
          eq(academicTerms.academicYearId, year.id),
        )).limit(1);
  if (result.data.academicTermId !== null && !term) {
    return { error: "Select a term belonging to the selected academic year." };
  }
  if (!isDateRangeWithin(result.data.dueDate, result.data.dueDate, year.startDate, year.endDate)) {
    return { error: "The due date must fall within the selected academic year." };
  }
  if (term && !isDateRangeWithin(result.data.dueDate, result.data.dueDate, term.startDate, term.endDate)) {
    return { error: "The due date must fall within the selected academic term." };
  }
  if (result.data.studentId !== null) {
    const [enrollment] = await db.select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, year.id),
        eq(studentEnrollments.status, "enrolled"),
        eq(classSections.academicYearId, year.id),
        eq(classSections.classLevelId, classLevel.id),
        eq(students.id, result.data.studentId),
        eq(classLevels.branchId, branch.id),
        inArray(students.status, ["admitted", "active"]),
      ))
      .limit(1);
    if (!enrollment) return { error: "The selected student must be actively enrolled in this class and academic year." };
  }

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      const values = {
        branchId: branch.id,
        academicYearId: year.id,
        academicTermId: term?.id ?? null,
        classLevelId: classLevel.id,
        studentId: result.data.studentId,
        feeGroupId: group.id,
        feeTypeId: type.id,
        amount: result.data.amount, dueDate: result.data.dueDate,
        currency: result.data.currency,
        fineType: result.data.fineType, fineValue: result.data.fineValue,
      };
      const [classLock] = await tx.select({ id: classLevels.id }).from(classLevels)
        .where(and(eq(classLevels.id, classLevel.id), eq(classLevels.schoolId, context.schoolId)))
        .for("update").limit(1);
      if (!classLock) return "not-found";
      const duplicateConditions = [
        eq(feeStructures.schoolId, context.schoolId),
        eq(feeStructures.academicYearId, year.id),
        eq(feeStructures.classLevelId, classLevel.id),
        eq(feeStructures.feeGroupId, group.id),
        eq(feeStructures.feeTypeId, type.id),
        term ? eq(feeStructures.academicTermId, term.id) : isNull(feeStructures.academicTermId),
        result.data.studentId === null
          ? isNull(feeStructures.studentId)
          : eq(feeStructures.studentId, result.data.studentId),
        ...(recordId !== null ? [ne(feeStructures.id, recordId)] : []),
      ];
      const [duplicate] = await tx.select({ id: feeStructures.id }).from(feeStructures)
        .where(and(...duplicateConditions)).limit(1);
      if (duplicate) return "duplicate";
      if (recordId !== null) {
        const [record] = await tx.select().from(feeStructures)
          .where(and(eq(feeStructures.id, recordId), eq(feeStructures.schoolId, context.schoolId)))
          .for("update").limit(1);
        if (!record) return "not-found";
        const [invoice] = await tx.select({ id: studentFeeInvoices.id }).from(studentFeeInvoices)
          .where(and(
            eq(studentFeeInvoices.schoolId, context.schoolId),
            eq(studentFeeInvoices.feeStructureId, record.id),
          )).limit(1);
        if (invoice && (
          record.branchId !== values.branchId ||
          record.academicYearId !== values.academicYearId ||
          record.academicTermId !== values.academicTermId ||
          record.classLevelId !== values.classLevelId ||
          record.studentId !== values.studentId ||
          record.feeGroupId !== values.feeGroupId ||
          record.feeTypeId !== values.feeTypeId ||
          record.currency !== values.currency
        )) return "linked-invoices";
        await tx.update(feeStructures).set(values)
          .where(and(eq(feeStructures.id, record.id), eq(feeStructures.schoolId, context.schoolId)));
        await writeAudit(tx, context.schoolId, context.user.id, "fee_structure.updated", "fee_structure", record.publicId,
          ["branchId", "academicYearId", "academicTermId", "classLevelId", "studentId", "feeGroupId", "feeTypeId", "amount", "currency", "dueDate", "fineType", "fineValue"]);
        return "updated";
      }
      await tx.insert(feeStructures).values({ publicId, schoolId: context.schoolId, ...values });
      await writeAudit(tx, context.schoolId, context.user.id, "fee_structure.created", "fee_structure", publicId,
        ["branchId", "academicYearId", "academicTermId", "classLevelId", "studentId", "feeGroupId", "feeTypeId", "amount", "currency", "dueDate", "fineType", "fineValue"]);
      return "created";
    });
    if (outcome === "not-found") return { error: "Fee structure not found for this school." };
    if (outcome === "linked-invoices") return { error: "Class, year, term, and fee item cannot be changed after invoices have been generated. Amount and due-date edits are safe because invoices retain their original values." };
    if (outcome === "duplicate") return duplicateError("fee structure");
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("fee structure");
    throw error;
  }
  revalidateFees();
  return { success: true };
}

export async function generateStudentFeeInvoices(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const structureId = idField.safeParse(value(formData, "feeStructureId"));
  if (!structureId.success) return { error: "Select a valid fee structure." };
  const requestedStudent = value(formData, "studentId");
  const studentId = requestedStudent ? idField.safeParse(requestedStudent) : null;
  if (studentId && !studentId.success) return { error: "Select a valid student." };
  const result = await db.transaction(async (tx) => {
    const [structure] = await tx.select().from(feeStructures)
      .where(and(eq(feeStructures.id, structureId.data), eq(feeStructures.schoolId, context.schoolId)))
      .for("update").limit(1);
    if (!structure) return { error: "Fee structure not found." };
    const eligible = await tx.select({
      enrollmentId: studentEnrollments.id,
      studentId: students.id,
      discountId: studentFeeDiscounts.discountId,
      discountType: feeDiscounts.discountType,
      discountValue: feeDiscounts.value,
      discountCurrency: feeDiscounts.currency,
      discountFrequency: feeDiscounts.frequency,
    })
      .from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(students, and(eq(students.id, studentEnrollments.studentId), eq(students.schoolId, context.schoolId)))
      .leftJoin(studentFeeDiscounts, and(
        eq(studentFeeDiscounts.studentId, students.id),
        eq(studentFeeDiscounts.schoolId, context.schoolId),
        eq(studentFeeDiscounts.feeTypeId, structure.feeTypeId),
      ))
      .leftJoin(feeDiscounts, and(
        eq(feeDiscounts.id, studentFeeDiscounts.discountId),
        eq(feeDiscounts.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, structure.academicYearId),
        eq(studentEnrollments.status, "enrolled"),
        eq(classSections.academicYearId, structure.academicYearId),
        eq(classSections.classLevelId, structure.classLevelId),
        eq(classLevels.branchId, structure.branchId),
        inArray(students.status, ["admitted", "active"]),
        ...(structure.studentId !== null ? [eq(students.id, structure.studentId)] : []),
        ...(studentId?.success ? [eq(students.id, studentId.data)] : []),
      ));
    if (!eligible.length) {
      return studentId?.success
        ? { error: "The selected student is not eligible for this fee structure; they must be admitted or active and enrolled in the matching class and year." }
        : { created: 0 };
    }
    if (eligible.some((row) =>
      row.discountType === "fixed" &&
      row.discountId !== null &&
      row.discountCurrency !== structure.currency
    )) {
      return { error: "A fixed discount uses a different currency from this fee structure. Update the discount before generating invoices." };
    }
    const alreadyInvoiced = await tx.select({ enrollmentId: studentFeeInvoices.enrollmentId })
      .from(studentFeeInvoices)
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        eq(studentFeeInvoices.feeStructureId, structure.id),
        inArray(studentFeeInvoices.enrollmentId, eligible.map((row) => row.enrollmentId)),
      ));
    const existing = new Set(alreadyInvoiced.map((row) => row.enrollmentId));
    const limitedFrequencyDiscountIds = [...new Set(eligible
      .filter((row) => (row.discountFrequency === "one_time" || row.discountFrequency === "yearly") && row.discountId !== null)
      .map((row) => row.discountId)
      .filter((id): id is number => id !== null))];
    const appliedDiscountKeys = new Set<string>();
    if (limitedFrequencyDiscountIds.length) {
      const usedDiscounts = await tx.select({
        studentId: studentFeeInvoices.studentId,
        discountId: studentFeeInvoices.discountId,
        academicYearId: feeStructures.academicYearId,
        frequency: feeDiscounts.frequency,
      })
        .from(studentFeeInvoices)
        .innerJoin(feeStructures, and(
          eq(feeStructures.id, studentFeeInvoices.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
        ))
        .innerJoin(feeDiscounts, and(
          eq(feeDiscounts.id, studentFeeInvoices.discountId),
          eq(feeDiscounts.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          eq(feeStructures.feeTypeId, structure.feeTypeId),
          inArray(studentFeeInvoices.discountId, limitedFrequencyDiscountIds),
          inArray(studentFeeInvoices.studentId, eligible.map((row) => row.studentId)),
        ));
      for (const row of usedDiscounts) {
        if (row.discountId === null || (row.frequency !== "one_time" && row.frequency !== "yearly")) continue;
        const key = row.frequency === "one_time"
          ? `once:${row.studentId}:${row.discountId}`
          : `year:${row.academicYearId}:${row.studentId}:${row.discountId}`;
        appliedDiscountKeys.add(key);
      }
    }
    const amountMinor = parseMoneyToMinorUnits(structure.amount);
    if (amountMinor === null || amountMinor <= 0) throw new Error("Stored fee structure amount is invalid.");
    const newInvoices = eligible.filter((row) => !existing.has(row.enrollmentId)).map((row) => {
      const discountValue = row.discountValue;
      const discountKey = row.discountId === null || row.discountFrequency === null
        ? null
        : row.discountFrequency === "one_time"
          ? `once:${row.studentId}:${row.discountId}`
          : `year:${structure.academicYearId}:${row.studentId}:${row.discountId}`;
      const appliesDiscount = row.discountId !== null &&
        !(discountKey !== null && appliedDiscountKeys.has(discountKey));
      if (appliesDiscount && discountKey) {
        appliedDiscountKeys.add(discountKey);
      }
      const discountAmount = !appliesDiscount ? 0 : calculateDiscountMinorUnits(
        amountMinor,
        row.discountType ?? "",
        discountValue ?? "",
      );
      if (discountAmount === null) throw new Error("Stored student discount is invalid.");
      return {
        publicId: randomUUID(),
        schoolId: context.schoolId,
        invoiceNumber: `INV-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        studentId: row.studentId,
        enrollmentId: row.enrollmentId,
        feeStructureId: structure.id,
        currency: structure.currency,
        discountId: appliesDiscount ? row.discountId : null,
        amount: (amountMinor / 100).toFixed(2),
        discountAmount: (discountAmount / 100).toFixed(2),
        fineType: structure.fineType,
        fineValue: structure.fineValue,
        dueDate: structure.dueDate,
        status: discountAmount === amountMinor && structure.fineType === "none" ? "paid" : "unpaid",
        generatedBy: context.user.id,
      };
    });
    for (let offset = 0; offset < newInvoices.length; offset += 250) {
      const batch = newInvoices.slice(offset, offset + 250);
      await tx.insert(studentFeeInvoices).values(batch);
      for (const invoice of batch) {
        await writeAudit(tx, context.schoolId, context.user.id, "fee_invoice.generated", "student_fee_invoice", invoice.publicId,
          ["studentId", "feeStructureId", "amount", "discountAmount", "dueDate"]);
      }
    }
    return { created: newInvoices.length };
  });
  if ("error" in result) return { error: result.error };
  revalidateFees();
  return { success: true, message: `Generated ${result.created} invoice${result.created === 1 ? "" : "s"}.` };
}

export async function updateFeeInvoice(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const result = invoiceEditSchema.safeParse({
    invoiceId: value(formData, "invoiceId"),
    amount: value(formData, "amount"),
    discountAmount: value(formData, "discountAmount"),
    dueDate: value(formData, "dueDate"),
    fineType: value(formData, "fineType"),
    fineValue: value(formData, "fineValue") || "0",
  });
  if (!result.success) return { error: "Enter valid invoice amounts, due date, and fine settings." };
  const amountMinor = parseMoneyToMinorUnits(result.data.amount);
  const discountMinor = parseMoneyToMinorUnits(result.data.discountAmount);
  const fineMinor = parseMoneyToMinorUnits(result.data.fineValue);
  if (amountMinor === null || amountMinor <= 0 || discountMinor === null || discountMinor > amountMinor ||
    fineMinor === null || (result.data.fineType === "percentage" && fineMinor > 10000) ||
    (result.data.fineType === "none" && fineMinor !== 0)) {
    return { error: "Discounts cannot exceed the invoice amount; fine settings must be valid." };
  }

  const outcome = await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(studentFeeInvoices)
      .where(and(
        eq(studentFeeInvoices.id, result.data.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!invoice) return "not-found";
      const [schedule] = await tx.select({
        yearStartDate: academicYears.startDate,
        yearEndDate: academicYears.endDate,
        termStartDate: academicTerms.startDate,
        termEndDate: academicTerms.endDate,
      }).from(feeStructures)
        .innerJoin(academicYears, and(
          eq(academicYears.id, feeStructures.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .leftJoin(academicTerms, and(
          eq(academicTerms.id, feeStructures.academicTermId),
          eq(academicTerms.schoolId, context.schoolId),
        ))
        .where(and(
          eq(feeStructures.id, invoice.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
        )).limit(1);
      if (!schedule) return "structure-not-found";
      if (!isDateRangeWithin(result.data.dueDate, result.data.dueDate, schedule.yearStartDate, schedule.yearEndDate) ||
        (schedule.termStartDate && schedule.termEndDate &&
          !isDateRangeWithin(result.data.dueDate, result.data.dueDate, schedule.termStartDate, schedule.termEndDate))) {
        return "invalid-due-date";
      }
    const [payment] = await tx.select({ id: feePayments.id }).from(feePayments)
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        eq(feePayments.invoiceId, invoice.id),
      )).limit(1);
    const financialTermsChanged =
      invoice.amount !== result.data.amount ||
      invoice.discountAmount !== result.data.discountAmount ||
      invoice.fineType !== result.data.fineType ||
      invoice.fineValue !== result.data.fineValue;
    if (payment && financialTermsChanged) return "has-payments";
    const [school] = await tx.select({ timezone: schools.timezone }).from(schools)
      .where(eq(schools.id, context.schoolId)).limit(1);
    if (!school) return "school-not-found";
    const paidDate = todayInTimezone(school.timezone);
    const currentFine = paidDate > result.data.dueDate
      ? calculateFineMinorUnits(amountMinor - discountMinor, result.data.fineType, result.data.fineValue) ?? 0
      : 0;
    const [paidTotal] = await tx.select({
      amount: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
    }).from(feePayments).where(and(
      eq(feePayments.schoolId, context.schoolId),
      eq(feePayments.invoiceId, invoice.id),
    ));
    const paidMinor = parseMoneyToMinorUnits(paidTotal?.amount ?? "0");
    if (paidMinor === null) throw new Error("Stored invoice payment total is invalid.");
    const status = feeInvoiceStatus(amountMinor - discountMinor + currentFine, paidMinor);
    if (!status) return "paid-exceeds-total";
    await tx.update(studentFeeInvoices).set({
      amount: result.data.amount,
      discountAmount: result.data.discountAmount,
      dueDate: result.data.dueDate,
      fineType: result.data.fineType,
      fineValue: result.data.fineValue,
      status,
    }).where(and(
      eq(studentFeeInvoices.id, invoice.id),
      eq(studentFeeInvoices.schoolId, context.schoolId),
    ));
    await writeAudit(tx, context.schoolId, context.user.id, "fee_invoice.updated", "student_fee_invoice", invoice.publicId,
      ["amount", "discountAmount", "dueDate", "fineType", "fineValue"]);
    return "updated";
  });
  if (outcome === "not-found") return { error: "Invoice not found for this school." };
  if (outcome === "structure-not-found") return { error: "The invoice's fee structure or academic year was not found." };
  if (outcome === "invalid-due-date") return { error: "The due date must remain within the invoice's academic year and term." };
  if (outcome === "has-payments") return { error: "Amounts and fine rules cannot be changed after a payment has been recorded. Update the due date only, or use a payment reversal/refund first." };
  if (outcome === "school-not-found") return { error: "School settings were not found." };
  if (outcome === "paid-exceeds-total") return { error: "The edited invoice total would be lower than the amount already paid. Record an authorized refund instead." };
  revalidateFees();
  return { success: true, message: "Invoice updated." };
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

export async function recordFeeAdvanceCredit(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const result = advanceCreditSchema.safeParse({
    idempotencyKey: value(formData, "idempotencyKey"),
    studentId: value(formData, "studentId"),
    currency: value(formData, "currency"),
    amount: value(formData, "amount"),
    paymentMethod: value(formData, "paymentMethod"),
    reference: value(formData, "reference"),
    notes: value(formData, "notes"),
  });
  const amountMinor = result.success ? parseMoneyToMinorUnits(result.data.amount) : null;
  if (!result.success || amountMinor === null || amountMinor <= 0) {
    return { error: "Enter a valid positive advance amount and payment method." };
  }
  const [configuredCurrency] = await db.select({ code: schoolCurrencies.code }).from(schoolCurrencies)
    .where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, result.data.currency),
    )).limit(1);
  if (!configuredCurrency) return { error: "Choose a currency configured for this school." };

  const transactionPublicId = randomUUID();
  const receiptNumber = `ADV-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx.select({ id: students.id, status: students.status })
      .from(students).where(and(
        eq(students.id, result.data.studentId),
        eq(students.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!student) return { state: "student-not-found" as const };

    const [duplicate] = await tx.select({
      publicId: feeAdvanceTransactions.publicId,
      receiptNumber: feeAdvanceTransactions.receiptNumber,
      transactionType: feeAdvanceTransactions.transactionType,
      studentId: feeAdvanceTransactions.studentId,
      currency: feeAdvanceTransactions.currency,
      amount: feeAdvanceTransactions.amount,
      paymentMethod: feeAdvanceTransactions.paymentMethod,
      reference: feeAdvanceTransactions.reference,
      notes: feeAdvanceTransactions.notes,
    }).from(feeAdvanceTransactions).where(and(
      eq(feeAdvanceTransactions.schoolId, context.schoolId),
      eq(feeAdvanceTransactions.idempotencyKey, result.data.idempotencyKey),
    )).limit(1);
    if (duplicate) {
      if (duplicate.transactionType !== "received" || duplicate.studentId !== result.data.studentId ||
        duplicate.currency !== result.data.currency ||
        parseMoneyToMinorUnits(duplicate.amount) !== amountMinor ||
        duplicate.paymentMethod !== result.data.paymentMethod ||
        duplicate.reference !== result.data.reference || duplicate.notes !== result.data.notes ||
        !duplicate.receiptNumber) return { state: "conflict" as const };
      return { state: "saved" as const, publicId: duplicate.publicId, receiptNumber: duplicate.receiptNumber };
    }
    if (student.status !== "active") return { state: "student-not-found" as const };
    const [activeEnrollment] = await tx.select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .innerJoin(academicYears, and(
        eq(academicYears.id, studentEnrollments.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.studentId, student.id),
        eq(studentEnrollments.status, "enrolled"),
        eq(academicYears.status, "active"),
      )).limit(1);
    if (!activeEnrollment) return { state: "no-active-enrollment" as const };

    await tx.insert(feeAdvanceTransactions).values({
      publicId: transactionPublicId,
      schoolId: context.schoolId,
      studentId: student.id,
      currency: result.data.currency,
      transactionType: "received",
      amount: result.data.amount,
      receiptNumber,
      idempotencyKey: result.data.idempotencyKey,
      paymentMethod: result.data.paymentMethod,
      reference: result.data.reference,
      notes: result.data.notes,
      recordedBy: context.user.id,
    });
    await writeAudit(tx, context.schoolId, context.user.id, "fee_advance.received", "fee_advance_transaction", transactionPublicId,
      ["studentId", "amount", "paymentMethod", "reference"]);
    return { state: "saved" as const, publicId: transactionPublicId, receiptNumber };
  });
  if (outcome.state === "conflict") return { error: "This advance receipt request was already used with different details. Refresh and try again." };
  if (outcome.state === "student-not-found") return { error: "Choose an active student in this school." };
  if (outcome.state === "no-active-enrollment") return { error: "This student needs an active enrollment before an advance can be recorded." };
  revalidateFees();
  return {
    success: true,
    message: `Advance payment recorded. Receipt ${outcome.receiptNumber}.`,
    receiptUrl: `/admin/fees/collection/carry-forward/receipt/${outcome.publicId}`,
  };
}

export async function applyFeeAdvanceCredit(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const result = applyAdvanceCreditSchema.safeParse({
    idempotencyKey: value(formData, "idempotencyKey"),
    studentId: value(formData, "studentId"),
    invoiceId: value(formData, "invoiceId"),
  });
  if (!result.success) return { error: "Choose a valid student invoice to receive the advance credit." };

  const paymentPublicId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx.select({ id: students.id }).from(students).where(and(
      eq(students.id, result.data.studentId),
      eq(students.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!student) return { state: "student-not-found" as const };

    const [duplicate] = await tx.select({
      transactionType: feeAdvanceTransactions.transactionType,
      studentId: feeAdvanceTransactions.studentId,
      invoiceId: feeAdvanceTransactions.invoiceId,
      paymentId: feeAdvanceTransactions.paymentId,
    }).from(feeAdvanceTransactions).where(and(
      eq(feeAdvanceTransactions.schoolId, context.schoolId),
      eq(feeAdvanceTransactions.idempotencyKey, result.data.idempotencyKey),
    )).limit(1);
    if (duplicate) {
      if (duplicate.transactionType !== "applied" || duplicate.studentId !== result.data.studentId ||
        duplicate.invoiceId !== result.data.invoiceId || duplicate.paymentId === null) return { state: "conflict" as const };
      const [existing] = await tx.select({ publicId: feePayments.publicId, receiptNumber: feePayments.receiptNumber })
        .from(feePayments).where(and(
          eq(feePayments.id, duplicate.paymentId),
          eq(feePayments.schoolId, context.schoolId),
        )).limit(1);
      return existing
        ? { state: "saved" as const, publicId: existing.publicId, receiptNumber: existing.receiptNumber, amountMinor: 0 }
        : { state: "conflict" as const };
    }

    const [invoice] = await tx.select().from(studentFeeInvoices).where(and(
      eq(studentFeeInvoices.id, result.data.invoiceId),
      eq(studentFeeInvoices.schoolId, context.schoolId),
      eq(studentFeeInvoices.studentId, student.id),
    )).for("update").limit(1);
    if (!invoice) return { state: "invoice-not-found" as const };

    const [creditTotal] = await tx.select({ balance: sum(sql`
      CASE WHEN ${feeAdvanceTransactions.transactionType} = 'applied'
        THEN -${feeAdvanceTransactions.amount} ELSE ${feeAdvanceTransactions.amount} END
    `) }).from(feeAdvanceTransactions).where(and(
      eq(feeAdvanceTransactions.schoolId, context.schoolId),
      eq(feeAdvanceTransactions.studentId, student.id),
      eq(feeAdvanceTransactions.currency, invoice.currency),
    ));
    const availableCreditMinor = parseMoneyToMinorUnits(creditTotal?.balance ?? "0");
    if (availableCreditMinor === null) throw new Error("Stored advance credit balance is invalid.");
    if (availableCreditMinor <= 0) return { state: "no-credit" as const };

    const invoicePayments = await tx.select({
      amount: feePayments.amount,
      reversedAmount: feePayments.reversedAmount,
      fineAmount: feePayments.fineAmount,
    }).from(feePayments).where(and(
      eq(feePayments.schoolId, context.schoolId),
      eq(feePayments.invoiceId, invoice.id),
    )).for("update");
    const paymentTotals = invoicePayments.map((payment) => ({
      amount: parseMoneyToMinorUnits(payment.amount),
      reversed: parseMoneyToMinorUnits(payment.reversedAmount),
      fine: parseMoneyToMinorUnits(payment.fineAmount),
    }));
    if (paymentTotals.some((payment) => payment.amount === null || payment.reversed === null || payment.fine === null)) {
      throw new Error("Stored invoice payment total is invalid.");
    }
    const totalPaidMinor = paymentTotals.reduce((total, payment) => total + (payment.amount! - payment.reversed!), 0);
    const totalFinePaidMinor = paymentTotals.reduce((total, payment) =>
      total + Math.max(0, payment.fine! - Math.min(payment.reversed!, payment.fine!)), 0);
    const amountMinor = parseMoneyToMinorUnits(invoice.amount);
    const discountMinor = parseMoneyToMinorUnits(invoice.discountAmount);
    if (amountMinor === null || discountMinor === null) {
      throw new Error("Stored invoice amount is invalid.");
    }
    const [school] = await tx.select({ timezone: schools.timezone }).from(schools)
      .where(eq(schools.id, context.schoolId)).limit(1);
    if (!school) return { state: "school-not-found" as const };
    const paidDate = todayInTimezone(school.timezone);
    const fineMinor = paidDate > invoice.dueDate
      ? calculateFineMinorUnits(amountMinor - discountMinor, invoice.fineType, invoice.fineValue)
      : 0;
    if (fineMinor === null) throw new Error("Stored fee fine is invalid.");
    const totalDueMinor = amountMinor - discountMinor + fineMinor;
    const remainingMinor = totalDueMinor - totalPaidMinor;
    if (remainingMinor <= 0) return { state: "invoice-paid" as const };
    const appliedMinor = Math.min(availableCreditMinor, remainingMinor);
    const appliedAmount = (appliedMinor / 100).toFixed(2);
    const receiptNumber = `RCT-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    await tx.insert(feePayments).values({
      publicId: paymentPublicId,
      schoolId: context.schoolId,
      invoiceId: invoice.id,
      receiptNumber,
      idempotencyKey: result.data.idempotencyKey,
      amount: appliedAmount,
      fineAmount: (
        Math.min(
          Math.max(0, fineMinor - totalFinePaidMinor),
          Math.max(0, appliedMinor - Math.max(0, amountMinor - discountMinor - totalPaidMinor)),
        ) / 100
      ).toFixed(2),
      paymentMethod: "advance_credit",
      reference: "Advance fee credit",
      notes: "Applied from the student carry-forward balance.",
      recordedBy: context.user.id,
    });
    const [payment] = await tx.select({ id: feePayments.id, receiptNumber: feePayments.receiptNumber })
      .from(feePayments).where(and(
        eq(feePayments.publicId, paymentPublicId),
        eq(feePayments.schoolId, context.schoolId),
      )).limit(1);
    if (!payment) throw new Error("Advance credit payment could not be loaded.");
    const transactionId = randomUUID();
    await tx.insert(feeAdvanceTransactions).values({
      publicId: transactionId,
      schoolId: context.schoolId,
      studentId: student.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      currency: invoice.currency,
      transactionType: "applied",
      amount: appliedAmount,
      idempotencyKey: result.data.idempotencyKey,
      notes: `Applied to invoice ${invoice.invoiceNumber}.`,
      recordedBy: context.user.id,
    });
    const status = feeInvoiceStatus(totalDueMinor, totalPaidMinor + appliedMinor);
    if (!status) throw new Error("Invoice balance is inconsistent.");
    await tx.update(studentFeeInvoices).set({ status }).where(eq(studentFeeInvoices.id, invoice.id));
    await writeAudit(tx, context.schoolId, context.user.id, "fee_advance.applied", "fee_advance_transaction", transactionId,
      ["studentId", "invoiceId", "amount"]);
    return { state: "saved" as const, publicId: paymentPublicId, receiptNumber: payment.receiptNumber, amountMinor: appliedMinor };
  });
  if (outcome.state === "conflict") return { error: "This advance-credit request was already used with different details. Refresh and try again." };
  if (outcome.state === "student-not-found") return { error: "Student record was not found in this school." };
  if (outcome.state === "invoice-not-found") return { error: "Choose an outstanding invoice belonging to this student." };
  if (outcome.state === "no-credit") return { error: "This student has no available carry-forward credit." };
  if (outcome.state === "invoice-paid") return { error: "This invoice has no remaining balance." };
  if (outcome.state === "school-not-found") return { error: "School settings were not found." };
  revalidateFees();
  const suffix = outcome.amountMinor > 0
    ? ` ${(outcome.amountMinor / 100).toFixed(2)} was applied.`
    : " This request had already been applied.";
  return {
    success: true,
    message: `Advance credit applied. Receipt ${outcome.receiptNumber}.${suffix}`,
    receiptUrl: `/admin/fees/receipt/${outcome.publicId}`,
  };
}

export async function recordFeePayment(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const result = paymentSchema.safeParse({
    idempotencyKey: value(formData, "idempotencyKey"),
    invoiceId: value(formData, "invoiceId"),
    amount: value(formData, "amount"),
    paymentMethod: value(formData, "paymentMethod"),
    reference: value(formData, "reference"),
    notes: value(formData, "notes"),
  });
  const paymentMinor = result.success ? parseMoneyToMinorUnits(result.data.amount) : null;
  if (!result.success || paymentMinor === null || paymentMinor <= 0) return { error: "Enter a valid positive payment amount and method." };

  const paymentId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [existingPayment] = await tx.select({
      publicId: feePayments.publicId,
      receiptNumber: feePayments.receiptNumber,
      invoiceId: feePayments.invoiceId,
      amount: feePayments.amount,
      paymentMethod: feePayments.paymentMethod,
      reference: feePayments.reference,
      notes: feePayments.notes,
    }).from(feePayments)
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        eq(feePayments.idempotencyKey, result.data.idempotencyKey),
      )).limit(1);
    if (existingPayment) {
      if (existingPayment.invoiceId !== result.data.invoiceId ||
        parseMoneyToMinorUnits(existingPayment.amount) !== paymentMinor ||
        existingPayment.paymentMethod !== result.data.paymentMethod ||
        existingPayment.reference !== result.data.reference ||
        existingPayment.notes !== result.data.notes) return "idempotency-conflict";
      return { state: "saved" as const, publicId: existingPayment.publicId, receiptNumber: existingPayment.receiptNumber };
    }
    const [invoice] = await tx.select().from(studentFeeInvoices)
      .where(and(eq(studentFeeInvoices.id, result.data.invoiceId), eq(studentFeeInvoices.schoolId, context.schoolId)))
      .for("update").limit(1);
    if (!invoice) return "invoice-not-found";
    const [school] = await tx.select({ timezone: schools.timezone }).from(schools)
      .where(eq(schools.id, context.schoolId)).limit(1);
    if (!school) return "school-not-found";

    const [paidTotal] = await tx.select({
      amount: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
      fineAmount: sum(sql`greatest(0, ${feePayments.fineAmount} - least(${feePayments.reversedAmount}, ${feePayments.fineAmount}))`),
    }).from(feePayments)
      .where(and(eq(feePayments.schoolId, context.schoolId), eq(feePayments.invoiceId, invoice.id)));
    const totalPaid = parseMoneyToMinorUnits(paidTotal?.amount ?? "0");
    const totalFinePaid = parseMoneyToMinorUnits(paidTotal?.fineAmount ?? "0");
    const amountMinor = parseMoneyToMinorUnits(invoice.amount);
    const discountMinor = parseMoneyToMinorUnits(invoice.discountAmount);
    if (totalPaid === null || totalFinePaid === null || amountMinor === null || discountMinor === null) {
      throw new Error("Stored invoice amount is invalid.");
    }
    const paidDate = todayInTimezone(school.timezone);
    const fineMinor = isPayDateOnOrAfterDueDate(paidDate, invoice.dueDate) && paidDate > invoice.dueDate
      ? calculateFineMinorUnits(amountMinor - discountMinor, invoice.fineType, invoice.fineValue)
      : 0;
    if (fineMinor === null) throw new Error("Stored fee fine is invalid.");
    const baseDue = amountMinor - discountMinor;
    const totalDue = baseDue + fineMinor;
    const remaining = totalDue - totalPaid;
    if (remaining <= 0) return "already-paid";
    if (paymentMinor > remaining) return "overpayment";

    await tx.insert(feePayments).values({
      publicId: paymentId,
      schoolId: context.schoolId,
      invoiceId: invoice.id,
      receiptNumber: `RCT-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      idempotencyKey: result.data.idempotencyKey,
      amount: result.data.amount,
      fineAmount: (
        Math.min(
          Math.max(0, fineMinor - totalFinePaid),
          Math.max(0, paymentMinor - Math.max(0, baseDue - totalPaid)),
        ) / 100
      ).toFixed(2),
      paymentMethod: result.data.paymentMethod,
      reference: result.data.reference,
      notes: result.data.notes,
      recordedBy: context.user.id,
    });
    const status = feeInvoiceStatus(totalDue, totalPaid + paymentMinor);
    if (!status) throw new Error("Invoice balance is inconsistent.");
    await tx.update(studentFeeInvoices).set({ status }).where(eq(studentFeeInvoices.id, invoice.id));
    await writeAudit(tx, context.schoolId, context.user.id, "fee_payment.recorded", "fee_payment", paymentId,
      ["invoiceId", "amount", "fineAmount", "paymentMethod", "reference"]);
    const [createdPayment] = await tx.select({ receiptNumber: feePayments.receiptNumber })
      .from(feePayments).where(eq(feePayments.publicId, paymentId)).limit(1);
    if (!createdPayment) throw new Error("Recorded payment receipt could not be loaded.");
    return { state: "saved" as const, publicId: paymentId, receiptNumber: createdPayment.receiptNumber };
  });
  if (outcome === "invoice-not-found") return { error: "Invoice not found for this school." };
  if (outcome === "school-not-found") return { error: "School settings were not found." };
  if (outcome === "already-paid") return { error: "This invoice has no remaining balance." };
  if (outcome === "overpayment") return { error: "Payment exceeds the invoice's remaining balance." };
  if (outcome === "idempotency-conflict") return { error: "This payment request key was already used with different payment details. Refresh and try again." };
  revalidateFees();
  return {
    success: true,
    message: outcome.state === "saved" ? `Payment recorded. Receipt ${outcome.receiptNumber}.` : "Payment recorded.",
    receiptUrl: `/admin/fees/receipt/${outcome.publicId}`,
  };
}

export async function recordBulkFeePayments(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const result = bulkPaymentSchema.safeParse({
    search: value(formData, "search"),
    currency: value(formData, "currency"),
    status: value(formData, "status"),
    branchId: value(formData, "branchId"),
    classLevelId: value(formData, "classLevelId"),
    sectionId: value(formData, "sectionId"),
    paymentMethod: value(formData, "paymentMethod"),
    reference: value(formData, "reference"),
    notes: value(formData, "notes"),
  });
  if (!result.success) return { error: "Review the invoice filters and payment details, then try again." };

  const { search, currency, status, branchId, classLevelId, sectionId } = result.data;
  const searchTerm = search.toLocaleLowerCase();
  const today = await db.select({ timezone: schools.timezone })
    .from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  if (!today[0]) return { error: "School settings were not found." };
  const paidDate = todayInTimezone(today[0].timezone);
  const paymentId = () => randomUUID();

  const outcome = await db.transaction(async (tx) => {
    const paymentTotals = tx.select({
      invoiceId: feePayments.invoiceId,
      paid: sql<string>`COALESCE(SUM(${feePayments.amount} - ${feePayments.reversedAmount}), 0)`.as("paid"),
    })
      .from(feePayments)
      .where(eq(feePayments.schoolId, context.schoolId))
      .groupBy(feePayments.invoiceId)
      .as("bulk_invoice_payment_totals");
    const fineDue = sql`CASE
      WHEN ${studentFeeInvoices.fineType} = 'none' OR ${studentFeeInvoices.dueDate} >= ${paidDate} THEN 0
      WHEN ${studentFeeInvoices.fineType} = 'fixed' THEN ${studentFeeInvoices.fineValue}
      WHEN ${studentFeeInvoices.fineType} = 'percentage'
        THEN ROUND((${studentFeeInvoices.amount} - ${studentFeeInvoices.discountAmount}) * ${studentFeeInvoices.fineValue} / 100, 2)
      ELSE 0
    END`;
    const totalDue = sql`(${studentFeeInvoices.amount} - ${studentFeeInvoices.discountAmount} + ${fineDue})`;
    const paid = sql<string>`COALESCE(${paymentTotals.paid}, 0)`;
    const computedStatus = sql<string>`CASE
      WHEN ${paid} < 0 OR ${totalDue} < 0 OR ${paid} > ${totalDue} THEN 'unpaid'
      WHEN ${paid} = ${totalDue} THEN 'paid'
      WHEN ${paid} = 0 THEN 'unpaid'
      ELSE 'partial'
    END`;
    const matchingIds = await tx.select({ id: studentFeeInvoices.id })
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
      .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, studentFeeInvoices.id))
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        eq(studentFeeInvoices.currency, currency),
        ...(branchId ? [eq(schoolBranches.id, branchId)] : []),
        ...(classLevelId ? [eq(classLevels.id, classLevelId)] : []),
        ...(sectionId ? [eq(classSections.id, sectionId)] : []),
        inArray(computedStatus, ["unpaid", "partial"]),
        ...(search ? [or(
          like(sql`lower(${studentFeeInvoices.invoiceNumber})`, `%${searchTerm}%`),
          like(students.firstName, `%${search}%`),
          like(students.lastName, `%${search}%`),
          like(sql`lower(concat(${students.firstName}, ' ', ${students.lastName}))`, `%${searchTerm}%`),
          like(students.admissionNumber, `%${search}%`),
          like(studentEnrollments.rollNumber, `%${search}%`),
          like(students.phone, `%${search}%`),
          like(students.publicId, `%${search}%`),
        )!] : []),
        ...(status ? [eq(computedStatus, status)] : []),
      ))
      .orderBy(asc(studentFeeInvoices.id))
      .limit(501);
    if (matchingIds.length > 500) return "too-many";
    if (!matchingIds.length) return "no-matches";

    let paymentsRecorded = 0;
    let totalCollected = 0;
    for (const candidate of matchingIds) {
      const [invoice] = await tx.select().from(studentFeeInvoices)
        .where(and(
          eq(studentFeeInvoices.id, candidate.id),
          eq(studentFeeInvoices.schoolId, context.schoolId),
        ))
        .for("update")
        .limit(1);
      if (!invoice) continue;

      const [totals] = await tx.select({
        paid: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
        finePaid: sum(sql`greatest(0, ${feePayments.fineAmount} - least(${feePayments.reversedAmount}, ${feePayments.fineAmount}))`),
      }).from(feePayments)
        .where(and(
          eq(feePayments.schoolId, context.schoolId),
          eq(feePayments.invoiceId, invoice.id),
        ));
      const paidMinor = parseMoneyToMinorUnits(totals?.paid ?? "0");
      const finePaidMinor = parseMoneyToMinorUnits(totals?.finePaid ?? "0");
      if (paidMinor === null || finePaidMinor === null) {
        throw new Error("Stored invoice payment total is invalid.");
      }
      const balance = calculateOutstandingInvoiceBalance({
        amount: invoice.amount,
        discountAmount: invoice.discountAmount,
        fineType: invoice.fineType,
        fineValue: invoice.fineValue,
        dueDate: invoice.dueDate,
        paidMinor,
        today: paidDate,
      });
      if (balance === null) throw new Error("Stored invoice balance is invalid.");
      const totalDueMinor = balance + paidMinor;
      const currentStatus = feeInvoiceStatus(totalDueMinor, paidMinor);
      if (balance <= 0 || !currentStatus || (status && currentStatus !== status)) continue;

      const amountMinor = parseMoneyToMinorUnits(invoice.amount);
      const discountMinor = parseMoneyToMinorUnits(invoice.discountAmount);
      if (amountMinor === null || discountMinor === null) throw new Error("Stored invoice amount is invalid.");
      const fineMinor = paidDate > invoice.dueDate
        ? calculateFineMinorUnits(amountMinor - discountMinor, invoice.fineType, invoice.fineValue)
        : 0;
      if (fineMinor === null) throw new Error("Stored fee fine is invalid.");
      const fineAmountMinor = Math.min(
        Math.max(0, fineMinor - finePaidMinor),
        Math.max(0, balance - Math.max(0, amountMinor - discountMinor - paidMinor)),
      );
      const id = paymentId();
      await tx.insert(feePayments).values({
        publicId: id,
        schoolId: context.schoolId,
        invoiceId: invoice.id,
        receiptNumber: `RCT-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        idempotencyKey: randomUUID(),
        amount: (balance / 100).toFixed(2),
        fineAmount: (fineAmountMinor / 100).toFixed(2),
        paymentMethod: result.data.paymentMethod,
        reference: result.data.reference,
        notes: result.data.notes,
        recordedBy: context.user.id,
      });
      await tx.update(studentFeeInvoices).set({ status: "paid" })
        .where(eq(studentFeeInvoices.id, invoice.id));
      await writeAudit(tx, context.schoolId, context.user.id, "fee_payment.bulk_recorded", "fee_payment", id,
        ["invoiceId", "amount", "fineAmount", "paymentMethod", "reference"]);
      paymentsRecorded += 1;
      totalCollected += balance;
    }
    return paymentsRecorded
      ? { paymentsRecorded, totalCollected }
      : "no-payable-invoices";
  });

  if (outcome === "too-many") return { error: "This filter matches more than 500 invoices. Narrow the search filters before recording bulk payments." };
  if (outcome === "no-matches") return { error: "No invoices match the selected filters." };
  if (outcome === "no-payable-invoices") return { error: "No matching invoices have an outstanding balance. Refresh the list and try again." };
  revalidateFees();
  return {
    success: true,
    message: `Recorded ${outcome.paymentsRecorded} payment${outcome.paymentsRecorded === 1 ? "" : "s"} totaling ${(outcome.totalCollected / 100).toFixed(2)}.`,
  };
}

export async function reverseFeePayment(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const result = reversalSchema.safeParse({
    paymentId: value(formData, "paymentId"),
    idempotencyKey: value(formData, "idempotencyKey"),
    amount: value(formData, "amount"),
    reversalType: value(formData, "reversalType"),
    reason: value(formData, "reason"),
    reference: value(formData, "reference"),
  });
  const reversalMinor = result.success ? parseMoneyToMinorUnits(result.data.amount) : null;
  if (!result.success || reversalMinor === null || reversalMinor <= 0) {
    return { error: "Enter a valid reversal or refund amount, type, and reason." };
  }

  const reversalPublicId = randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const [duplicate] = await tx.select({
      paymentPublicId: feePayments.publicId,
      receiptNumber: feePayments.receiptNumber,
      amount: feePaymentReversals.amount,
      reversalType: feePaymentReversals.reversalType,
      reason: feePaymentReversals.reason,
      reference: feePaymentReversals.reference,
    }).from(feePaymentReversals)
      .innerJoin(feePayments, and(
        eq(feePayments.id, feePaymentReversals.paymentId),
        eq(feePayments.schoolId, feePaymentReversals.schoolId),
      ))
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        eq(feePaymentReversals.idempotencyKey, result.data.idempotencyKey),
      )).limit(1);
    if (duplicate) {
      if (parseMoneyToMinorUnits(duplicate.amount) !== reversalMinor ||
        duplicate.reversalType !== result.data.reversalType ||
        duplicate.reason !== result.data.reason ||
        duplicate.reference !== result.data.reference) return { state: "conflict" as const, paymentPublicId: duplicate.paymentPublicId };
      return { state: "duplicate" as const, paymentPublicId: duplicate.paymentPublicId };
    }
    const [paymentReference] = await tx.select({
      id: feePayments.id,
      invoiceId: feePayments.invoiceId,
    }).from(feePayments).where(and(
      eq(feePayments.id, result.data.paymentId),
      eq(feePayments.schoolId, context.schoolId),
    )).limit(1);
    if (!paymentReference) return { state: "not-found" as const };
    const [invoiceReference] = await tx.select({
      id: studentFeeInvoices.id,
      studentId: studentFeeInvoices.studentId,
    }).from(studentFeeInvoices).where(and(
      eq(studentFeeInvoices.id, paymentReference.invoiceId),
      eq(studentFeeInvoices.schoolId, context.schoolId),
    )).limit(1);
    if (!invoiceReference) return { state: "not-found" as const };
    const [student] = await tx.select({ id: students.id }).from(students).where(and(
      eq(students.id, invoiceReference.studentId),
      eq(students.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!student) return { state: "not-found" as const };
    const [invoice] = await tx.select().from(studentFeeInvoices)
      .where(and(
        eq(studentFeeInvoices.id, paymentReference.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!invoice) return { state: "not-found" as const };
    const [payment] = await tx.select().from(feePayments)
      .where(and(
        eq(feePayments.id, paymentReference.id),
        eq(feePayments.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!payment) return { state: "not-found" as const };
    const paymentMinor = parseMoneyToMinorUnits(payment.amount);
    const reversedMinor = parseMoneyToMinorUnits(payment.reversedAmount);
    const paymentFineMinor = parseMoneyToMinorUnits(payment.fineAmount);
    if (paymentMinor === null || reversedMinor === null || paymentFineMinor === null) {
      throw new Error("Stored payment amount is invalid.");
    }
    if (reversalMinor > paymentMinor - reversedMinor) return { state: "exceeds" as const };
    const [priorReversals] = await tx.select({ fineAmount: sum(feePaymentReversals.fineAmount) })
      .from(feePaymentReversals)
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        eq(feePaymentReversals.paymentId, payment.id),
      ));
    const priorReversedFine = parseMoneyToMinorUnits(priorReversals?.fineAmount ?? "0");
    if (priorReversedFine === null || priorReversedFine > paymentFineMinor) {
      throw new Error("Stored payment reversal totals are invalid.");
    }
    const reversedFine = Math.min(reversalMinor, paymentFineMinor - priorReversedFine);

    await tx.insert(feePaymentReversals).values({
      publicId: reversalPublicId,
      schoolId: context.schoolId,
      paymentId: payment.id,
      amount: result.data.amount,
      fineAmount: (reversedFine / 100).toFixed(2),
      reversalType: result.data.reversalType,
      reason: result.data.reason,
      reference: result.data.reference,
      idempotencyKey: result.data.idempotencyKey,
      recordedBy: context.user.id,
    });
    const [advanceApplication] = await tx.select({
      studentId: feeAdvanceTransactions.studentId,
      invoiceId: feeAdvanceTransactions.invoiceId,
      amount: feeAdvanceTransactions.amount,
    }).from(feeAdvanceTransactions).where(and(
      eq(feeAdvanceTransactions.schoolId, context.schoolId),
      eq(feeAdvanceTransactions.paymentId, payment.id),
      eq(feeAdvanceTransactions.transactionType, "applied"),
    )).limit(1);
    if (advanceApplication) {
      const appliedCreditMinor = parseMoneyToMinorUnits(advanceApplication.amount);
      if (appliedCreditMinor === null) {
        throw new Error("Stored advance credit reversal total is invalid.");
      }
      const restoreMinor = Math.min(reversalMinor, Math.max(0, appliedCreditMinor - reversedMinor));
      if (restoreMinor > 0) {
        await tx.insert(feeAdvanceTransactions).values({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          studentId: advanceApplication.studentId,
          invoiceId: advanceApplication.invoiceId,
          paymentId: payment.id,
          currency: invoice.currency,
          transactionType: "restored",
          amount: (restoreMinor / 100).toFixed(2),
          idempotencyKey: `reversal-${result.data.idempotencyKey}`,
          notes: `Credit restored from ${result.data.reversalType}.`,
          recordedBy: context.user.id,
        });
      }
    }
    const nextReversed = reversedMinor + reversalMinor;
    await tx.update(feePayments).set({ reversedAmount: (nextReversed / 100).toFixed(2) })
      .where(eq(feePayments.id, payment.id));
    const [paidTotal] = await tx.select({
      amount: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
    }).from(feePayments).where(and(
      eq(feePayments.schoolId, context.schoolId),
      eq(feePayments.invoiceId, invoice.id),
    ));
    const paidMinor = parseMoneyToMinorUnits(paidTotal?.amount ?? "0");
    const amountMinor = parseMoneyToMinorUnits(invoice.amount);
    const discountMinor = parseMoneyToMinorUnits(invoice.discountAmount);
    if (paidMinor === null || amountMinor === null || discountMinor === null) {
      throw new Error("Stored invoice balance is invalid.");
    }
    const [school] = await tx.select({ timezone: schools.timezone }).from(schools)
      .where(eq(schools.id, context.schoolId)).limit(1);
    if (!school) throw new Error("School settings were not found.");
    const paidDate = todayInTimezone(school.timezone);
    const fineMinor = paidDate > invoice.dueDate
      ? calculateFineMinorUnits(amountMinor - discountMinor, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    const status = feeInvoiceStatus(amountMinor - discountMinor + fineMinor, paidMinor);
    if (!status) throw new Error("Invoice balance is inconsistent after reversal.");
    await tx.update(studentFeeInvoices).set({ status }).where(eq(studentFeeInvoices.id, invoice.id));
    await writeAudit(tx, context.schoolId, context.user.id,
      result.data.reversalType === "refund" ? "fee_payment.refund_recorded" : "fee_payment.reversal_recorded",
      "fee_payment", payment.publicId,
      ["reversedAmount", "reversalType", "reason", "reference"]);
    return { state: "saved" as const, paymentPublicId: payment.publicId };
  });
  if (outcome.state === "not-found") return { error: "Payment not found for this school." };
  if (outcome.state === "exceeds") return { error: "The reversal amount exceeds the unreversed payment amount." };
  if (outcome.state === "conflict") return { error: "This reversal request key was already used with different details. Refresh and try again." };
  revalidateFees();
  return {
    success: true,
    message: outcome.state === "duplicate" ? "This reversal was already recorded." : "Reversal or refund recorded.",
    receiptUrl: `/admin/fees/receipt/${outcome.paymentPublicId}`,
  };
}
