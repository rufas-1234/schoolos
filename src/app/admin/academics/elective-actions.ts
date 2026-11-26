"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  classSubjects,
  schools,
  studentElectiveSelections,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { electiveSelectionStatuses, type ElectiveSelectionStatus } from "@/lib/elective-selection-policy";

export type ElectiveSelectionActionState = { error?: string; success?: boolean };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const statusField = z.enum(electiveSelectionStatuses);

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function saveElectiveSelections(
  _previousState: ElectiveSelectionActionState,
  formData: FormData,
): Promise<ElectiveSelectionActionState> {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const parsed = z.object({
    classSubjectId: idField,
    academicYearId: idField,
  }).safeParse({
    classSubjectId: formValue(formData, "classSubjectId"),
    academicYearId: formValue(formData, "academicYearId"),
  });
  if (!parsed.success) return { error: "Choose an optional subject and active academic year." };

  const selections = new Map<number, ElectiveSelectionStatus>();
  for (const [key, raw] of formData.entries()) {
    const match = /^selection_(\d+)$/.exec(key);
    if (!match) continue;
    if (typeof raw !== "string") return { error: "A student elective choice is invalid." };
    const enrollmentId = idField.safeParse(match[1]);
    const status = statusField.safeParse(raw);
    if (!enrollmentId.success || !status.success || selections.has(enrollmentId.data)) {
      return { error: "One or more student elective choices are invalid or duplicated." };
    }
    selections.set(enrollmentId.data, status.data);
  }
  if (!selections.size) return { error: "There are no student elective choices to save." };

  try {
    const outcome = await db.transaction(async (tx) => {
      const [school] = await tx.select({ id: schools.id }).from(schools)
        .where(eq(schools.id, context.schoolId))
        .for("update")
        .limit(1);
      if (!school) return "school-not-found" as const;

      const [assignment] = await tx.select({
        id: classSubjects.id,
        publicId: classSubjects.publicId,
        classLevelId: classSubjects.classLevelId,
        isCompulsory: classSubjects.isCompulsory,
      }).from(classSubjects)
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSubjects.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .where(and(
          eq(classSubjects.id, parsed.data.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ))
        .for("update")
        .limit(1);
      if (!assignment) return "subject-not-found" as const;
      if (assignment.isCompulsory) return "subject-not-optional" as const;

      const [year] = await tx.select({
        id: academicYears.id,
        status: academicYears.status,
      }).from(academicYears)
        .where(and(
          eq(academicYears.id, parsed.data.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .for("update")
        .limit(1);
      if (!year) return "year-not-found" as const;
      if (year.status !== "active") return "year-not-active" as const;

      const eligibleEnrollments = await tx.select({
        id: studentEnrollments.id,
      }).from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.classLevelId, assignment.classLevelId),
          eq(classSections.academicYearId, year.id),
        ))
        .innerJoin(students, and(
          eq(students.id, studentEnrollments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, year.id),
          eq(studentEnrollments.status, "enrolled"),
          ne(students.status, "disabled"),
        ));
      if (!eligibleEnrollments.length) return "no-students" as const;
      if (
        selections.size !== eligibleEnrollments.length ||
        eligibleEnrollments.some((enrollment) => !selections.has(enrollment.id)) ||
        [...selections.keys()].some((enrollmentId) =>
          !eligibleEnrollments.some((enrollment) => enrollment.id === enrollmentId),
        )
      ) return "roster-changed" as const;

      const enrollmentIds = eligibleEnrollments.map((enrollment) => enrollment.id);
      const existing = await tx.select({
        id: studentElectiveSelections.id,
        enrollmentId: studentElectiveSelections.studentEnrollmentId,
        status: studentElectiveSelections.status,
      }).from(studentElectiveSelections)
        .where(and(
          eq(studentElectiveSelections.schoolId, context.schoolId),
          eq(studentElectiveSelections.classSubjectId, assignment.id),
          inArray(studentElectiveSelections.studentEnrollmentId, enrollmentIds),
        ))
        .for("update");
      const existingByEnrollment = new Map(existing.map((selection) => [
        selection.enrollmentId,
        selection,
      ]));
      const changed = enrollmentIds.filter((enrollmentId) => {
        const previous = existingByEnrollment.get(enrollmentId);
        return !previous || previous.status !== selections.get(enrollmentId);
      });

      for (const status of electiveSelectionStatuses) {
        const enrollmentIdsToUpdate = changed.filter((enrollmentId) =>
          existingByEnrollment.has(enrollmentId) && selections.get(enrollmentId) === status,
        );
        if (!enrollmentIdsToUpdate.length) continue;
        await tx.update(studentElectiveSelections).set({
          status,
          updatedAt: new Date(),
        }).where(and(
          eq(studentElectiveSelections.schoolId, context.schoolId),
          eq(studentElectiveSelections.classSubjectId, assignment.id),
          inArray(studentElectiveSelections.studentEnrollmentId, enrollmentIdsToUpdate),
        ));
      }

      const newSelections = changed.filter((enrollmentId) => !existingByEnrollment.has(enrollmentId));
      if (newSelections.length) {
        await tx.insert(studentElectiveSelections).values(newSelections.map((enrollmentId) => ({
          schoolId: context.schoolId,
          studentEnrollmentId: enrollmentId,
          classSubjectId: assignment.id,
          status: selections.get(enrollmentId)!,
        })));
      }

      if (changed.length) {
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "academic.elective.selections.updated",
          resourceType: "class_subject",
          resourcePublicId: assignment.publicId,
          changedFields: ["studentElectiveSelections"],
        });
      }
      return "saved" as const;
    });

    if (outcome === "school-not-found") return { error: "The school record could not be verified." };
    if (outcome === "subject-not-found") return { error: "Choose an active class elective belonging to your school." };
    if (outcome === "subject-not-optional") return { error: "Student elective choices can only be saved for an optional subject." };
    if (outcome === "year-not-found") return { error: "Choose an academic year belonging to your school." };
    if (outcome === "year-not-active") return { error: "Elective choices can only be managed for the active academic year." };
    if (outcome === "no-students") return { error: "There are no enrolled students in this class for the active academic year." };
    if (outcome === "roster-changed") return { error: "The enrolled student list changed. Reload the page and review the choices again." };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "The student list changed while you were saving. Reload and try again." };
    }
    throw error;
  }

  revalidatePath("/admin/academics");
  revalidatePath(`/admin/academics/electives/${parsed.data.classSubjectId}`);
  revalidatePath("/admin/examinations");
  return { success: true };
}
