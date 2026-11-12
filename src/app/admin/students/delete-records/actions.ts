"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  studentAcademicEvents,
  studentAttendance,
  studentEnrollments,
  studentGroupMemberships,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

const deleteStudentSchema = z.string().uuid();

export async function deleteStudentRecord(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("students.delete");
  const result = deleteStudentSchema.safeParse(formData.get("publicId"));
  if (!result.success) throw new Error("Choose a valid student record.");

  const outcome = await db.transaction(async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        publicId: students.publicId,
      })
      .from(students)
      .where(
        and(
          eq(students.publicId, result.data),
          eq(students.schoolId, context.schoolId),
        ),
      )
      .for("update")
      .limit(1);
    if (!student) return "not-found";

    await tx
      .delete(studentAttendance)
      .where(
        and(
          eq(studentAttendance.studentId, student.id),
          eq(studentAttendance.schoolId, context.schoolId),
        ),
      );
    await tx
      .delete(studentAcademicEvents)
      .where(
        and(
          eq(studentAcademicEvents.studentId, student.id),
          eq(studentAcademicEvents.schoolId, context.schoolId),
        ),
      );
    await tx
      .delete(studentGroupMemberships)
      .where(
        and(
          eq(studentGroupMemberships.studentId, student.id),
          eq(studentGroupMemberships.schoolId, context.schoolId),
        ),
      );
    await tx
      .delete(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.studentId, student.id),
          eq(studentEnrollments.schoolId, context.schoolId),
        ),
      );
    await tx
      .delete(students)
      .where(
        and(
          eq(students.id, student.id),
          eq(students.schoolId, context.schoolId),
        ),
      );
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "student.record.deleted",
      resourceType: "student",
      resourcePublicId: student.publicId,
      changedFields: [
        "student_record",
        "enrollments",
        "attendance",
        "academic_history",
        "group_memberships",
      ],
    });
    return "deleted";
  });

  if (outcome === "not-found") {
    throw new Error("That student record could not be found in this school.");
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/students/delete-records");
  revalidatePath("/admin/students/groups");
  revalidatePath("/admin/students/promote");
  revalidatePath("/admin/students/unassigned");
  revalidatePath("/admin/students/disabled");
  revalidatePath("/admin/academics");
  revalidatePath("/admin/dashboard");
}
