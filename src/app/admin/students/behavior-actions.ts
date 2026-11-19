"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, studentBehaviorRecords, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";

export type BehaviorActionState = { error?: string; success?: boolean; message?: string };

const dateField = z.string().refine(isCalendarDate, "Enter a valid date.");
const optionalDateField = z.union([z.literal(""), dateField]).transform((value) => value || null);
const behaviorFields = z.object({
  studentPublicId: z.string().uuid(),
  incidentDate: dateField,
  category: z.enum([
    "positive",
    "classroom",
    "attendance",
    "uniform",
    "peer_conflict",
    "bullying",
    "property",
    "safety",
    "other",
  ]),
  severity: z.enum(["positive", "low", "moderate", "serious"]),
  details: z.string().trim().min(4).max(3000),
  actionTaken: z.enum([
    "commendation",
    "counselling",
    "verbal_warning",
    "parent_contact",
    "detention",
    "suspension",
    "other",
  ]),
  followUpDate: optionalDateField,
});

function readValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readBehaviorFields(formData: FormData) {
  return behaviorFields.safeParse({
    studentPublicId: readValue(formData, "studentPublicId"),
    incidentDate: readValue(formData, "incidentDate"),
    category: readValue(formData, "category"),
    severity: readValue(formData, "severity"),
    details: readValue(formData, "details"),
    actionTaken: readValue(formData, "actionTaken"),
    followUpDate: readValue(formData, "followUpDate"),
  });
}

export async function createBehaviorRecord(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  const context = await requireSchoolPermission("students.update");
  const parsed = readBehaviorFields(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Review the behaviour record and try again." };

  const [student] = await db.select({ id: students.id })
    .from(students)
    .where(and(
      eq(students.publicId, parsed.data.studentPublicId),
      eq(students.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!student) return { error: "That student could not be found in this school." };

  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(studentBehaviorRecords).values({
        publicId,
        schoolId: context.schoolId,
        studentId: student.id,
        incidentDate: parsed.data.incidentDate,
        category: parsed.data.category,
        severity: parsed.data.severity,
        details: parsed.data.details,
        actionTaken: parsed.data.actionTaken,
        followUpDate: parsed.data.followUpDate,
        recordedBy: context.user.id,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "student.behaviour.recorded",
        resourceType: "student_behavior_record",
        resourcePublicId: publicId,
        changedFields: ["studentId", "incidentDate", "category", "severity", "details", "actionTaken", "followUpDate"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "That behaviour record could not be saved because of a conflicting record." };
    console.error("Student behaviour record could not be saved; transaction rolled back.", error);
    return { error: "The behaviour record could not be saved. No changes were made; try again." };
  }

  revalidatePath("/admin/students/behavior");
  revalidatePath("/admin/students");
  return { success: true, message: "Behaviour record saved." };
}

export async function updateBehaviorRecord(
  _previousState: BehaviorActionState,
  formData: FormData,
): Promise<BehaviorActionState> {
  const context = await requireSchoolPermission("students.update");
  const publicId = z.string().uuid().safeParse(readValue(formData, "publicId"));
  const parsed = readBehaviorFields(formData);
  if (!publicId.success || !parsed.success) {
    return { error: parsed.success ? "This behaviour record is invalid." : parsed.error.issues[0]?.message ?? "Review the behaviour record and try again." };
  }

  const outcome = await db.transaction(async (tx) => {
    const [record] = await tx.select({ id: studentBehaviorRecords.id })
      .from(studentBehaviorRecords)
      .where(and(
        eq(studentBehaviorRecords.publicId, publicId.data),
        eq(studentBehaviorRecords.schoolId, context.schoolId),
      ))
      .for("update")
      .limit(1);
    if (!record) return "record-not-found";
    const [student] = await tx.select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.publicId, parsed.data.studentPublicId),
        eq(students.schoolId, context.schoolId),
      ))
      .limit(1);
    if (!student) return "student-not-found";

    await tx.update(studentBehaviorRecords).set({
      studentId: student.id,
      incidentDate: parsed.data.incidentDate,
      category: parsed.data.category,
      severity: parsed.data.severity,
      details: parsed.data.details,
      actionTaken: parsed.data.actionTaken,
      followUpDate: parsed.data.followUpDate,
    }).where(and(
      eq(studentBehaviorRecords.id, record.id),
      eq(studentBehaviorRecords.schoolId, context.schoolId),
    ));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.behaviour.updated",
      resourceType: "student_behavior_record",
      resourcePublicId: publicId.data,
      changedFields: ["studentId", "incidentDate", "category", "severity", "details", "actionTaken", "followUpDate"],
    });
    return "updated";
  });

  if (outcome === "record-not-found") return { error: "That behaviour record was not found in this school." };
  if (outcome === "student-not-found") return { error: "That student could not be found in this school." };
  revalidatePath("/admin/students/behavior");
  revalidatePath("/admin/students");
  return { success: true, message: "Behaviour record updated." };
}
