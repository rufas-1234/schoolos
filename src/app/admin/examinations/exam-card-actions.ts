"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  classSections,
  examClasses,
  examFeeClearances,
  examinations,
  studentEnrollments,
} from "@/db/schema";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { requireSchoolPermission } from "@/lib/access-control";

export type ExamFeeClearanceState = { error?: string; success?: string };

export async function approveExamFeeException(
  _previousState: ExamFeeClearanceState,
  formData: FormData,
): Promise<ExamFeeClearanceState> {
  const context = await requireSchoolPermission(["examinations.create", "fees.manage"]);
  const parsed = z.object({
    examinationId: z.coerce.number().int().positive().safe(),
    enrollmentId: z.coerce.number().int().positive().safe(),
    reason: z.string().trim().min(10).max(1000),
  }).safeParse({
    examinationId: formData.get("examinationId"),
    enrollmentId: formData.get("enrollmentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Enter a reason of at least 10 characters." };
  const { examinationId, enrollmentId, reason } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [exam] = await tx.select({
        id: examinations.id,
        academicYearId: examinations.academicYearId,
      }).from(examinations).where(and(
        eq(examinations.id, examinationId),
        eq(examinations.schoolId, context.schoolId),
      )).for("update").limit(1);
      if (!exam) throw new Error("The selected examination is unavailable.");

      const [rosterEntry] = await tx.select({
        enrollmentId: studentEnrollments.id,
      }).from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, exam.academicYearId),
        ))
        .innerJoin(examClasses, and(
          eq(examClasses.classLevelId, classSections.classLevelId),
          eq(examClasses.examinationId, exam.id),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentEnrollments.id, enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, exam.academicYearId),
          eq(studentEnrollments.status, "enrolled"),
        )).limit(1);
      if (!rosterEntry) throw new Error("This student is not on the examination roster.");

      const [existing] = await tx.select({
        id: examFeeClearances.id,
        publicId: examFeeClearances.publicId,
      }).from(examFeeClearances).where(and(
        eq(examFeeClearances.schoolId, context.schoolId),
        eq(examFeeClearances.examinationId, exam.id),
        eq(examFeeClearances.enrollmentId, rosterEntry.enrollmentId),
      )).for("update").limit(1);

      const publicId = existing?.publicId ?? randomUUID();
      if (existing) {
        await tx.update(examFeeClearances).set({
          reason,
          approvedBy: context.user.id,
          updatedAt: new Date(),
        }).where(eq(examFeeClearances.id, existing.id));
      } else {
        await tx.insert(examFeeClearances).values({
          publicId,
          schoolId: context.schoolId,
          examinationId: exam.id,
          enrollmentId: rosterEntry.enrollmentId,
          reason,
          approvedBy: context.user.id,
        });
      }

      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "examination.fee_exception.approved",
        resourceType: "exam_fee_clearance",
        resourcePublicId: publicId,
        changedFields: ["examinationId", "enrollmentId", "reason"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "Another administrator updated this student's exception. Refresh and try again." };
    console.error("Exam fee exception could not be saved.", error);
    return { error: error instanceof Error ? error.message : "The exception could not be saved." };
  }

  revalidatePath(`/admin/examinations/${examinationId}/cards`);
  return { success: "Exam sitting approved with the recorded reason." };
}
