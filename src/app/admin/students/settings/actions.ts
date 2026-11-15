"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, studentEnrollments, studentSettings, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  defaultStudentFieldSettings,
  formatStudentIdentifier,
  isValidStudentIdentifierFormat,
  studentSettingFields,
} from "@/lib/student-settings";
import type { StudentFieldSettings } from "@/db/schema";

export type StudentSettingsActionState = { error?: string; success?: string };

function readString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function saveStudentSettings(
  _previousState: StudentSettingsActionState,
  formData: FormData,
): Promise<StudentSettingsActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "students.update"]);
  const admissionFormat = readString(formData, "admissionFormat").trim();
  const rollFormat = readString(formData, "rollFormat").trim();
  if (!isValidStudentIdentifierFormat(admissionFormat) || !isValidStudentIdentifierFormat(rollFormat)) {
    return { error: "Use a format with a sequence token, such as STU-{YY}-{SEQ:4}. Supported tokens: {SEQ}, {SEQ:n}, {YYYY}, {YY}, {MM}, and {DD}." };
  }

  const fields: StudentFieldSettings = Object.fromEntries(studentSettingFields.map((field) => {
    const enabled = field.locked || formData.get(`enabled:${field.name}`) === "on";
    const required = field.locked || formData.get(`required:${field.name}`) === "on";
    return [field.name, { enabled, required }];
  }));
  for (const field of studentSettingFields) {
    if (fields[field.name].required && !fields[field.name].enabled) {
      return { error: `${field.label} cannot be required while disabled.` };
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(studentSettings).values({
      schoolId: context.schoolId,
      admissionFormat,
      rollFormat,
      fields,
    }).onDuplicateKeyUpdate({
      set: { admissionFormat, rollFormat, fields },
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.settings.updated",
      resourceType: "student_settings",
      resourcePublicId: context.schoolPublicId,
      changedFields: ["admissionFormat", "rollFormat", "fields"],
    });
  });
  revalidatePath("/admin/students/settings");
  revalidatePath("/admin/students");
  return { success: "Student settings saved." };
}

export async function generateMissingStudentIdentifiers(): Promise<StudentSettingsActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "students.update"]);
  const outcome = await db.transaction(async (tx) => {
    await tx.insert(studentSettings).values({
      schoolId: context.schoolId,
      fields: defaultStudentFieldSettings,
    }).onDuplicateKeyUpdate({ set: { schoolId: context.schoolId } });
    const [settings] = await tx.select().from(studentSettings)
      .where(eq(studentSettings.schoolId, context.schoolId)).for("update").limit(1);
    if (!settings) throw new Error("Student identifier settings could not be initialized.");

    let admissionSequence = settings.nextAdmissionSequence;
    let admissionCount = 0;
    const admissions = await tx.select({ id: students.id })
      .from(students)
      .where(and(eq(students.schoolId, context.schoolId), isNull(students.admissionNumber)))
      .orderBy(asc(students.id));
    for (const student of admissions) {
      const admissionNumber = await nextUniqueIdentifier(
        tx,
        context.schoolId,
        settings.admissionFormat,
        admissionSequence,
        "admission",
      );
      await tx.update(students).set({ admissionNumber })
        .where(and(eq(students.id, student.id), eq(students.schoolId, context.schoolId), isNull(students.admissionNumber)));
      admissionSequence++;
      admissionCount++;
    }

    let rollSequence = settings.nextRollSequence;
    let rollCount = 0;
    const enrollments = await tx.select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.status, "enrolled"),
        isNull(studentEnrollments.rollNumber),
      ))
      .orderBy(asc(studentEnrollments.id));
    for (const enrollment of enrollments) {
      const rollNumber = await nextUniqueIdentifier(
        tx,
        context.schoolId,
        settings.rollFormat,
        rollSequence,
        "roll",
      );
      await tx.update(studentEnrollments).set({ rollNumber })
        .where(and(eq(studentEnrollments.id, enrollment.id), eq(studentEnrollments.schoolId, context.schoolId), isNull(studentEnrollments.rollNumber)));
      rollSequence++;
      rollCount++;
    }
    await tx.update(studentSettings).set({
      nextAdmissionSequence: admissionSequence,
      nextRollSequence: rollSequence,
    }).where(eq(studentSettings.id, settings.id));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.identifiers.backfilled",
      resourceType: "student_settings",
      resourcePublicId: context.schoolPublicId,
      changedFields: [`admissionNumbers:${admissionCount}`, `rollNumbers:${rollCount}`],
    });
    return { admissionCount, rollCount };
  });

  revalidatePath("/admin/students");
  revalidatePath("/admin/students/settings");
  return { success: `Generated ${outcome.admissionCount} admission number(s) and ${outcome.rollCount} roll number(s) for current enrollments.` };
}

type IdentifierKind = "admission" | "roll";

async function nextUniqueIdentifier(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
  format: string,
  sequence: number,
  kind: IdentifierKind,
) {
  for (let attempt = sequence; attempt < sequence + 100_000; attempt++) {
    const today = new Date();
    const date = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const candidate = formatStudentIdentifier(format, attempt, date);
    if (!candidate) throw new Error(`The configured ${kind} number format is invalid.`);
    const [existing] = kind === "admission"
      ? await tx.select({ id: students.id }).from(students)
        .where(and(eq(students.schoolId, schoolId), eq(students.admissionNumber, candidate))).limit(1)
      : await tx.select({ id: studentEnrollments.id }).from(studentEnrollments)
        .where(and(eq(studentEnrollments.schoolId, schoolId), eq(studentEnrollments.rollNumber, candidate))).limit(1);
    if (!existing) return candidate;
  }
  throw new Error(`Unable to find an unused ${kind} number.`);
}
