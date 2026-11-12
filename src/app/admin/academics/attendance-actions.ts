"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classSections,
  studentAttendance,
  studentEnrollments,
} from "@/db/schema";
import { isCalendarDate } from "@/lib/academic-policy";
import { isAttendanceStatus } from "@/lib/attendance-policy";
import { requireSchoolPermission } from "@/lib/access-control";
import type { AcademicActionState } from "./actions";

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const dateField = z.string().refine(isCalendarDate);

export async function saveAttendance(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("students.update");
  const sectionResult = idField.safeParse(formData.get("classSectionId"));
  const dateResult = dateField.safeParse(formData.get("attendanceDate"));
  if (!sectionResult.success || !dateResult.success) {
    return { error: "Choose a class section and a valid attendance date." };
  }

  const statuses = new Map<number, string>();
  const notes = new Map<number, string>();
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const statusMatch = /^status_(\d+)$/.exec(key);
    const noteMatch = /^note_(\d+)$/.exec(key);
    const match = statusMatch ?? noteMatch;
    if (!match) continue;
    const studentResult = idField.safeParse(match[1]);
    if (!studentResult.success) return { error: "The attendance roster contains an invalid student." };
    if (statusMatch) statuses.set(studentResult.data, value);
    else notes.set(studentResult.data, value.trim());
  }

  const markedStudents = [...statuses.entries()].filter(([, status]) => status !== "");
  if (markedStudents.length === 0 || markedStudents.some(([, status]) => !isAttendanceStatus(status))) {
    return { error: "Mark at least one student with a valid attendance status." };
  }
  if ([...notes.values()].some((note) => note.length > 500)) {
    return { error: "Attendance notes must be 500 characters or fewer." };
  }

  const sectionId = sectionResult.data;
  const attendanceDate = dateResult.data;
  const studentIds = markedStudents.map(([studentId]) => studentId);
  const outcome = await db.transaction(async (tx) => {
    const [section] = await tx
      .select({
        publicId: classSections.publicId,
        academicYearId: classSections.academicYearId,
      })
      .from(classSections)
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .where(
        and(
          eq(classSections.id, sectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ),
      )
      .limit(1);
    if (!section) return "section-not-found";

    const eligibleStudents = await tx
      .select({ studentId: studentEnrollments.studentId, enrollmentId: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.classSectionId, sectionId),
          eq(studentEnrollments.academicYearId, section.academicYearId),
          eq(studentEnrollments.status, "enrolled"),
          inArray(studentEnrollments.studentId, studentIds),
        ),
      );
    const enrollmentByStudentId = new Map(
      eligibleStudents.map((enrollment) => [enrollment.studentId, enrollment.enrollmentId]),
    );
    if (enrollmentByStudentId.size !== studentIds.length) return "roster-changed";

    for (const [studentId, status] of markedStudents) {
      const enrollmentId = enrollmentByStudentId.get(studentId);
      if (!enrollmentId) return "roster-changed";
      await tx
        .insert(studentAttendance)
        .values({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          studentId,
          enrollmentId,
          classSectionId: sectionId,
          attendanceDate,
          status,
          note: notes.get(studentId) || null,
          recordedBy: context.user.id,
        })
        .onDuplicateKeyUpdate({
          set: {
            enrollmentId,
            classSectionId: sectionId,
            status,
            note: notes.get(studentId) || null,
            recordedBy: context.user.id,
          },
        });
    }

    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "academic.attendance.saved",
      resourceType: "class_section",
      resourcePublicId: section.publicId,
      changedFields: ["attendanceDate", "status", "note"],
    });
    return "saved";
  });

  if (outcome === "section-not-found") return { error: "Choose a class section belonging to your school." };
  if (outcome === "roster-changed") {
    return { error: "The class roster changed. Reload the attendance list before saving." };
  }

  revalidatePath("/admin/academics");
  return { success: true };
}
