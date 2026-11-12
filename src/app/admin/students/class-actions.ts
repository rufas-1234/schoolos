"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";

export type StudentClassActionState = { error?: string; success?: boolean };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const publicIdField = z.string().uuid();
const rollNumberField = z.string().trim().max(40);

function readFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function revalidateStudentPages() {
  revalidatePath("/admin/students");
  revalidatePath("/admin/students/multi-class");
  revalidatePath("/admin/academics");
  revalidatePath("/admin/dashboard");
}

export async function addStudentClass(
  _previousState: StudentClassActionState,
  formData: FormData,
): Promise<StudentClassActionState> {
  const context = await requireSchoolPermission("students.update");
  const parsed = z.object({
    studentPublicId: publicIdField,
    branchId: idField,
    academicYearId: idField,
    sourceSectionId: idField,
    targetSectionId: idField,
    rollNumber: rollNumberField,
  }).safeParse({
    studentPublicId: readFormValue(formData, "studentPublicId"),
    branchId: readFormValue(formData, "branchId"),
    academicYearId: readFormValue(formData, "academicYearId"),
    sourceSectionId: readFormValue(formData, "sourceSectionId"),
    targetSectionId: readFormValue(formData, "targetSectionId"),
    rollNumber: readFormValue(formData, "rollNumber"),
  });
  if (!parsed.success) return { error: "Select a valid student and class section." };

  const values = parsed.data;
  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
        status: students.status,
        branchId: students.branchId,
      })
      .from(students)
      .where(and(eq(students.publicId, values.studentPublicId), eq(students.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!student) return "student-not-found";
    if (!["pending", "admitted", "active"].includes(student.status)) return "student-not-ready";
    if (student.branchId !== null && student.branchId !== values.branchId) return "branch-mismatch";

    const [source] = await tx
      .select({
        id: classSections.id,
        branchId: classLevels.branchId,
      })
      .from(classSections)
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .where(
        and(
          eq(classSections.id, values.sourceSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, values.academicYearId),
          eq(classLevels.branchId, values.branchId),
          eq(academicYears.status, "active"),
        ),
      )
      .for("update")
      .limit(1);
    if (!source) return "source-section-not-found";

    const [sourceEnrollment] = await tx
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.studentId, student.id),
          eq(studentEnrollments.academicYearId, values.academicYearId),
          eq(studentEnrollments.classSectionId, source.id),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!sourceEnrollment) return "student-not-in-source-section";

    const [target] = await tx
      .select({
        id: classSections.id,
        capacity: classSections.capacity,
        branchId: classLevels.branchId,
      })
      .from(classSections)
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .where(
        and(
          eq(classSections.id, values.targetSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, values.academicYearId),
          eq(classLevels.branchId, values.branchId),
        ),
      )
      .for("update")
      .limit(1);
    if (!target) return "target-section-not-found";

    const [existing] = await tx
      .select({ id: studentEnrollments.id, publicId: studentEnrollments.publicId, status: studentEnrollments.status })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.studentId, student.id),
          eq(studentEnrollments.academicYearId, values.academicYearId),
          eq(studentEnrollments.classSectionId, target.id),
        ),
      )
      .for("update")
      .limit(1);
    if (existing && existing.status !== "inactive") return "already-assigned";

    const enrollmentStatus = student.status === "pending" ? "pending" : "enrolled";
    if (enrollmentStatus === "enrolled" && target.capacity !== null) {
      const [enrollmentCount] = await tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.classSectionId, target.id),
            eq(studentEnrollments.status, "enrolled"),
          ),
        );
      if (Number(enrollmentCount.total) >= target.capacity) return "section-full";
    }

    const enrolledAt = new Date().toISOString().slice(0, 10);
    let enrollmentPublicId: string = randomUUID();
    if (existing) {
      enrollmentPublicId = existing.publicId;
      await tx
        .update(studentEnrollments)
        .set({
          status: enrollmentStatus,
          rollNumber: values.rollNumber || null,
          enrolledAt,
        })
        .where(and(eq(studentEnrollments.id, existing.id), eq(studentEnrollments.schoolId, context.schoolId)));
    } else {
      await tx.insert(studentEnrollments).values({
        publicId: enrollmentPublicId,
        schoolId: context.schoolId,
        studentId: student.id,
        academicYearId: values.academicYearId,
        classSectionId: target.id,
        rollNumber: values.rollNumber || null,
        status: enrollmentStatus,
        enrolledAt,
      });
    }

    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.enrollment.multi_class_added",
      resourceType: "student_enrollment",
      resourcePublicId: enrollmentPublicId,
      changedFields: ["academicYearId", "classSectionId", "rollNumber", "status"],
    });
    return "created";
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "already-assigned" as const;
    throw error;
  });

  const errors: Record<string, string> = {
    "student-not-found": "Choose a student belonging to your school.",
    "student-not-ready": "Only pending, admitted, or active students can be assigned to a class.",
    "branch-mismatch": "The student does not belong to the selected branch.",
    "source-section-not-found": "Choose a source section in the selected branch and academic year.",
    "student-not-in-source-section": "The student must already be assigned to the selected source section.",
    "target-section-not-found": "Choose a target section in the selected branch and academic year.",
    "already-assigned": "The student is already assigned to that section.",
    "section-full": "The selected class section has reached its capacity.",
  };
  if (outcome !== "created") return { error: errors[outcome] ?? "The class assignment could not be completed." };

  revalidateStudentPages();
  return { success: true };
}

export async function updateStudentClass(
  _previousState: StudentClassActionState,
  formData: FormData,
): Promise<StudentClassActionState> {
  const context = await requireSchoolPermission("students.update");
  const parsed = z.object({
    enrollmentPublicId: publicIdField,
    targetSectionId: idField,
    rollNumber: rollNumberField,
  }).safeParse({
    enrollmentPublicId: readFormValue(formData, "enrollmentPublicId"),
    targetSectionId: readFormValue(formData, "targetSectionId"),
    rollNumber: readFormValue(formData, "rollNumber"),
  });
  if (!parsed.success) return { error: "Select a valid class section." };

  const values = parsed.data;
  const outcome = await db.transaction(async (tx) => {
    const [enrollment] = await tx
      .select({
        id: studentEnrollments.id,
        studentId: studentEnrollments.studentId,
        academicYearId: studentEnrollments.academicYearId,
        classSectionId: studentEnrollments.classSectionId,
        status: studentEnrollments.status,
        studentBranchId: students.branchId,
      })
      .from(studentEnrollments)
      .innerJoin(students, eq(studentEnrollments.studentId, students.id))
      .where(
        and(
          eq(studentEnrollments.publicId, values.enrollmentPublicId),
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(students.schoolId, context.schoolId),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!enrollment) return "enrollment-not-found";

    const [sourceSection] = await tx
      .select({ branchId: classLevels.branchId })
      .from(classSections)
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .where(
        and(
          eq(classSections.id, enrollment.classSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, enrollment.academicYearId),
        ),
      )
      .limit(1);
    if (!sourceSection) return "source-section-not-found";
    if (enrollment.studentBranchId !== null && enrollment.studentBranchId !== sourceSection.branchId) {
      return "branch-mismatch";
    }

    const [targetSection] = await tx
      .select({
        id: classSections.id,
        capacity: classSections.capacity,
        branchId: classLevels.branchId,
      })
      .from(classSections)
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .where(
        and(
          eq(classSections.id, values.targetSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, enrollment.academicYearId),
          eq(classLevels.branchId, sourceSection.branchId),
          eq(academicYears.status, "active"),
        ),
      )
      .for("update")
      .limit(1);
    if (!targetSection) return "target-section-not-found";

    const [duplicate] = await tx
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.studentId, enrollment.studentId),
          eq(studentEnrollments.academicYearId, enrollment.academicYearId),
          eq(studentEnrollments.classSectionId, targetSection.id),
          ne(studentEnrollments.id, enrollment.id),
        ),
      )
      .limit(1);
    if (duplicate) return "already-assigned";

    if (targetSection.id !== enrollment.classSectionId && enrollment.status === "enrolled" && targetSection.capacity !== null) {
      const [enrollmentCount] = await tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.classSectionId, targetSection.id),
            eq(studentEnrollments.status, "enrolled"),
          ),
        );
      if (Number(enrollmentCount.total) >= targetSection.capacity) return "section-full";
    }

    await tx
      .update(studentEnrollments)
      .set({ classSectionId: targetSection.id, rollNumber: values.rollNumber || null })
      .where(and(eq(studentEnrollments.id, enrollment.id), eq(studentEnrollments.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.enrollment.multi_class_updated",
      resourceType: "student_enrollment",
      resourcePublicId: values.enrollmentPublicId,
      changedFields: ["classSectionId", "rollNumber"],
    });
    return "updated";
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "already-assigned" as const;
    throw error;
  });

  const errors: Record<string, string> = {
    "enrollment-not-found": "The active class assignment was not found.",
    "source-section-not-found": "The current class section could not be verified.",
    "branch-mismatch": "The student assignment must stay within its branch.",
    "target-section-not-found": "Choose a section in the same branch and academic year.",
    "already-assigned": "The student already has an assignment in that section.",
    "section-full": "The selected class section has reached its capacity.",
  };
  if (outcome !== "updated") return { error: errors[outcome] ?? "The class assignment could not be updated." };

  revalidateStudentPages();
  return { success: true };
}

export async function removeStudentClass(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("students.update");
  const parsed = publicIdField.safeParse(formData.get("enrollmentPublicId"));
  if (!parsed.success) throw new Error("Invalid student class assignment.");

  const outcome = await db.transaction(async (tx) => {
    const [enrollment] = await tx
      .select({
        id: studentEnrollments.id,
        studentId: studentEnrollments.studentId,
        status: studentEnrollments.status,
      })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.publicId, parsed.data),
          eq(studentEnrollments.schoolId, context.schoolId),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!enrollment) return "not-found";

    await tx
      .update(studentEnrollments)
      .set({ status: "inactive" })
      .where(and(eq(studentEnrollments.id, enrollment.id), eq(studentEnrollments.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.enrollment.multi_class_removed",
      resourceType: "student_enrollment",
      resourcePublicId: parsed.data,
      changedFields: ["status"],
    });
    return "removed";
  });

  if (outcome === "not-found") throw new Error("The active class assignment was not found.");
  revalidateStudentPages();
}
