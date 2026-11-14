"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  feeDiscounts,
  feeGroups,
  feePayments,
  feeStructures,
  feeTypes,
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
  calculateDiscountMinorUnits,
  calculateFineMinorUnits,
  feeInvoiceStatus,
  feePaymentMethods,
  isPayDateOnOrAfterDueDate,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";

export type FeeActionState = { error?: string; success?: boolean; message?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const nameField = z.string().trim().min(1).max(120);
const optionalText = z.string().trim().max(500).transform((value) => value || null);
const optionalDescription = z.string().trim().max(1000).transform((value) => value || null);
const amountField = z.string().refine((value) => parseMoneyToMinorUnits(value) !== null);
const dateField = z.string().refine(isCalendarDate);
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
  value: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).transform(Number).pipe(z.number().positive()),
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
  classLevelId: idField,
  feeGroupId: idField,
  feeTypeId: idField,
  amount: amountField,
  dueDate: dateField,
  fineType: z.enum(["none", "fixed", "percentage"]),
  fineValue: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).transform(Number).pipe(z.number().nonnegative()),
});
const paymentSchema = z.object({
  invoiceId: idField,
  amount: amountField,
  paymentMethod: z.enum(feePaymentMethods),
  reference: z.string().trim().max(120).transform((value) => value || null),
  notes: optionalText,
});

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
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
  revalidatePath("/admin/fees/reports");
}

function duplicateError(label: string): FeeActionState {
  return { error: `A ${label} with those details already exists.` };
}

export async function createFeeGroup(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission("fees.manage");
  const result = groupSchema.safeParse({
    name: value(formData, "name"),
    description: value(formData, "description"),
  });
  if (!result.success) return { error: "Enter a fee group name and valid description." };
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(feeGroups).values({
        publicId,
        schoolId: context.schoolId,
        name: result.data.name,
        description: result.data.description || null,
      });
      await writeAudit(tx, context.schoolId, context.user.id, "fee_group.created", "fee_group", publicId, ["name", "description"]);
    });
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
  const result = typeSchema.safeParse({
    feeGroupId: value(formData, "feeGroupId"),
    name: value(formData, "name"),
    description: value(formData, "description"),
  });
  if (!result.success) return { error: "Enter a fee type name and select a fee group." };
  const [group] = await db.select({ id: feeGroups.id }).from(feeGroups)
    .where(and(eq(feeGroups.id, result.data.feeGroupId), eq(feeGroups.schoolId, context.schoolId))).limit(1);
  if (!group) return { error: "Fee group not found for this school." };
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(feeTypes).values({
        publicId,
        schoolId: context.schoolId,
        feeGroupId: group.id,
        name: result.data.name,
        description: result.data.description || null,
      });
      await writeAudit(tx, context.schoolId, context.user.id, "fee_type.created", "fee_type", publicId, ["feeGroupId", "name", "description"]);
    });
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
  const result = discountSchema.safeParse({
    name: value(formData, "name"),
    code: value(formData, "code"),
    description: value(formData, "description"),
    discountType: value(formData, "discountType"),
    value: value(formData, "value"),
    frequency: value(formData, "frequency"),
  });
  if (!result.success || (result.data.discountType === "percentage" && result.data.value > 100)) {
    return { error: "Enter a valid discount; percentage discounts cannot exceed 100%." };
  }
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(feeDiscounts).values({
        publicId,
        schoolId: context.schoolId,
        name: result.data.name,
        code: result.data.code,
        description: result.data.description,
        discountType: result.data.discountType,
        value: result.data.value.toFixed(2),
        frequency: result.data.frequency,
      });
      await writeAudit(tx, context.schoolId, context.user.id, "fee_discount.created", "fee_discount", publicId,
        ["name", "code", "description", "discountType", "value", "frequency"]);
    });
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
  const result = structureSchema.safeParse({
    branchId: value(formData, "branchId"),
    academicYearId: value(formData, "academicYearId"),
    classLevelId: value(formData, "classLevelId"),
    feeGroupId: value(formData, "feeGroupId"),
    feeTypeId: value(formData, "feeTypeId"),
    amount: value(formData, "amount"),
    dueDate: value(formData, "dueDate"),
    fineType: value(formData, "fineType"),
    fineValue: value(formData, "fineValue") || "0",
  });
  if (!result.success || parseMoneyToMinorUnits(result.data.amount) === 0 ||
      (result.data.fineType === "percentage" && result.data.fineValue > 100) ||
      (result.data.fineType === "none" && result.data.fineValue !== 0)) {
    return { error: "Enter a positive fee amount, valid due date, and valid fine settings." };
  }

  const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches)
    .where(and(eq(schoolBranches.id, result.data.branchId), eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
    .limit(1);
  const [year] = await db.select({ id: academicYears.id, startDate: academicYears.startDate, endDate: academicYears.endDate })
    .from(academicYears)
    .where(and(eq(academicYears.id, result.data.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .limit(1);
  const [classLevel] = await db.select({ id: classLevels.id }).from(classLevels)
    .where(and(eq(classLevels.id, result.data.classLevelId), eq(classLevels.schoolId, context.schoolId), eq(classLevels.branchId, result.data.branchId)))
    .limit(1);
  const [group] = await db.select({ id: feeGroups.id }).from(feeGroups)
    .where(and(eq(feeGroups.id, result.data.feeGroupId), eq(feeGroups.schoolId, context.schoolId))).limit(1);
  const [type] = await db.select({ id: feeTypes.id, feeGroupId: feeTypes.feeGroupId }).from(feeTypes)
    .where(and(eq(feeTypes.id, result.data.feeTypeId), eq(feeTypes.schoolId, context.schoolId))).limit(1);
  if (!branch || !year || !classLevel || !group || !type || type.feeGroupId !== group.id) {
    return { error: "Select records belonging to this school and branch; the fee type must match its group." };
  }
  if (!isDateRangeWithin(result.data.dueDate, result.data.dueDate, year.startDate, year.endDate)) {
    return { error: "The due date must fall within the selected academic year." };
  }

  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(feeStructures).values({
        publicId, schoolId: context.schoolId, branchId: branch.id, academicYearId: year.id,
        classLevelId: classLevel.id, feeGroupId: group.id, feeTypeId: type.id,
        amount: result.data.amount, dueDate: result.data.dueDate,
        fineType: result.data.fineType, fineValue: result.data.fineValue.toFixed(2),
      });
      await writeAudit(tx, context.schoolId, context.user.id, "fee_structure.created", "fee_structure", publicId,
        ["branchId", "academicYearId", "classLevelId", "feeGroupId", "feeTypeId", "amount", "dueDate", "fineType", "fineValue"]);
    });
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
      discountFrequency: feeDiscounts.frequency,
    })
      .from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
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
        eq(students.branchId, structure.branchId),
        inArray(students.status, ["admitted", "active"]),
        ...(studentId?.success ? [eq(students.id, studentId.data)] : []),
      ));
    if (!eligible.length) {
      return studentId?.success
        ? { error: "The selected student is not eligible for this fee structure; they must be admitted or active and enrolled in the matching class and year." }
        : { created: 0 };
    }
    const alreadyInvoiced = await tx.select({ enrollmentId: studentFeeInvoices.enrollmentId })
      .from(studentFeeInvoices)
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        eq(studentFeeInvoices.feeStructureId, structure.id),
        inArray(studentFeeInvoices.enrollmentId, eligible.map((row) => row.enrollmentId)),
      ));
    const existing = new Set(alreadyInvoiced.map((row) => row.enrollmentId));
    const oneTimeDiscountIds = [...new Set(eligible
      .filter((row) => row.discountFrequency === "one_time" && row.discountId !== null)
      .map((row) => row.discountId)
      .filter((id): id is number => id !== null))];
    const studentsWithUsedDiscount = new Set<number>();
    if (oneTimeDiscountIds.length) {
      const usedDiscounts = await tx.select({ studentId: studentFeeInvoices.studentId })
        .from(studentFeeInvoices)
        .innerJoin(feeStructures, and(
          eq(feeStructures.id, studentFeeInvoices.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          eq(feeStructures.feeTypeId, structure.feeTypeId),
          inArray(studentFeeInvoices.discountId, oneTimeDiscountIds),
          inArray(studentFeeInvoices.studentId, eligible.map((row) => row.studentId)),
        ));
      for (const row of usedDiscounts) studentsWithUsedDiscount.add(row.studentId);
    }
    const amountMinor = parseMoneyToMinorUnits(structure.amount);
    if (amountMinor === null || amountMinor <= 0) throw new Error("Stored fee structure amount is invalid.");
    const appliedOneTimeDiscounts = new Set(studentsWithUsedDiscount);
    const newInvoices = eligible.filter((row) => !existing.has(row.enrollmentId)).map((row) => {
      const discountValue = row.discountValue === null ? null : Number(row.discountValue);
      const appliesDiscount = row.discountId !== null &&
        !(row.discountFrequency === "one_time" && appliedOneTimeDiscounts.has(row.studentId));
      if (appliesDiscount && row.discountFrequency === "one_time") {
        appliedOneTimeDiscounts.add(row.studentId);
      }
      const discountAmount = !appliesDiscount ? 0 : calculateDiscountMinorUnits(
        amountMinor,
        row.discountType ?? "",
        discountValue ?? Number.NaN,
      );
      if (discountAmount === null) throw new Error("Stored student discount is invalid.");
      return {
        publicId: randomUUID(),
        schoolId: context.schoolId,
        studentId: row.studentId,
        enrollmentId: row.enrollmentId,
        feeStructureId: structure.id,
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

export async function recordFeePayment(
  _previousState: FeeActionState,
  formData: FormData,
): Promise<FeeActionState> {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const result = paymentSchema.safeParse({
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
    const [invoice] = await tx.select().from(studentFeeInvoices)
      .where(and(eq(studentFeeInvoices.id, result.data.invoiceId), eq(studentFeeInvoices.schoolId, context.schoolId)))
      .for("update").limit(1);
    if (!invoice) return "invoice-not-found";
    const [school] = await tx.select({ timezone: schools.timezone }).from(schools)
      .where(eq(schools.id, context.schoolId)).limit(1);
    if (!school) return "school-not-found";

    const [paidTotal] = await tx.select({
      amount: sum(feePayments.amount),
      fineAmount: sum(feePayments.fineAmount),
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
      ? calculateFineMinorUnits(amountMinor - discountMinor, invoice.fineType, Number(invoice.fineValue))
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
    return "saved";
  });
  if (outcome === "invoice-not-found") return { error: "Invoice not found for this school." };
  if (outcome === "school-not-found") return { error: "School settings were not found." };
  if (outcome === "already-paid") return { error: "This invoice has no remaining balance." };
  if (outcome === "overpayment") return { error: "Payment exceeds the invoice's remaining balance." };
  revalidateFees();
  return { success: true, message: "Payment recorded." };
}
