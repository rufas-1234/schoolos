"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  academicHolidays,
  auditLogs,
  classRoutines,
  classLevels,
  classSections,
  classSubjects,
  feeStructures,
  studentAcademicEvents,
  studentAttendance,
  studentEnrollments,
  schools,
  schoolBranches,
  subjects,
  teachers,
} from "@/db/schema";
import {
  doDateRangesOverlap,
  isCalendarDate,
  isDateRangeWithin,
  isValidDateRange,
  isValidOptionalDateRange,
  normalizeClassName,
} from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { requireSchoolPermission } from "@/lib/access-control";
import { isValidSubjectCode, normalizeSubjectCode } from "@/lib/subject-policy";

const dateField = z.string().refine(isCalendarDate, "Enter a valid calendar date.");
const optionalDateField = z
  .union([z.literal(""), dateField])
  .transform((value) => (value === "" ? null : value));
const nameField = z.string().trim().min(1).max(120);
const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());

const academicYearSchema = z
  .object({
    name: nameField,
    startDate: dateField,
    endDate: dateField,
  })
  .refine((value) => isValidDateRange(value.startDate, value.endDate), {
    path: ["endDate"],
  });

const termSchema = z
  .object({
    academicYearId: idField,
    name: nameField,
    startDate: dateField,
    endDate: dateField,
    examStartDate: optionalDateField,
    examEndDate: optionalDateField,
  })
  .refine((value) => isValidDateRange(value.startDate, value.endDate), {
    path: ["endDate"],
  });

const classLevelSchema = z.object({
  branchId: idField,
  name: nameField,
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
});

const classSectionSchema = z.object({
  academicYearId: idField,
  classLevelId: idField,
  name: z.string().trim().min(1).max(80),
});
const classSectionsSchema = z.object({
  academicYearId: idField,
  classLevelId: idField,
  names: z
    .string()
    .transform((value) => value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1).max(80)).min(1).max(30))
    .refine(
      (names) => new Set(names.map((name) => name.toLocaleLowerCase())).size === names.length,
      "Section names must be unique.",
    ),
});

const subjectSchema = z.object({
  branchId: idField,
  name: nameField,
  code: z.string().trim().min(2).max(20).refine(isValidSubjectCode).transform(normalizeSubjectCode),
  subjectType: z.enum(["theory", "practical"]),
});

const classSubjectSchema = z.object({
  classLevelId: idField,
  subjectId: idField,
  isCompulsory: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type AcademicActionState = { error?: string; success?: boolean };

function readFormValue(formData: FormData, key: string): unknown {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readRecordId(formData: FormData): number | null | undefined {
  const value = formData.get("recordId");
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const result = idField.safeParse(value);
  return result.success ? result.data : undefined;
}

function duplicateError(entity: string): AcademicActionState {
  return { error: `A ${entity} with those details already exists for this school.` };
}

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  context: Awaited<ReturnType<typeof requireSchoolPermission>>,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({
    schoolId: context.schoolId,
    actorUserId: context.user.id,
    action,
    resourceType,
    resourcePublicId,
    changedFields,
  });
}

export async function createAcademicYear(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid academic year." };
  const result = academicYearSchema.safeParse({
    name: readFormValue(formData, "name"),
    startDate: readFormValue(formData, "startDate"),
    endDate: readFormValue(formData, "endDate"),
  });
  if (!result.success) return { error: "Enter a name and a valid, ordered date range." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [school] = await tx
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, context.schoolId))
        .for("update")
        .limit(1);
      if (!school) return "school-not-found";

      const existingYears = await tx
        .select({ id: academicYears.id, startDate: academicYears.startDate, endDate: academicYears.endDate })
        .from(academicYears)
        .where(eq(academicYears.schoolId, context.schoolId));
      if (
        existingYears.some((year) => year.id !== recordId &&
          doDateRangesOverlap(
            result.data.startDate,
            result.data.endDate,
            year.startDate,
            year.endDate,
          ),
        )
      ) {
        return "overlap";
      }

      if (recordId !== null) {
        const [year] = await tx
          .select({ id: academicYears.id, publicId: academicYears.publicId })
          .from(academicYears)
          .where(and(eq(academicYears.id, recordId), eq(academicYears.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!year) return "year-not-found";

        const linkedTerms = await tx
          .select({ startDate: academicTerms.startDate, endDate: academicTerms.endDate })
          .from(academicTerms)
          .where(and(eq(academicTerms.schoolId, context.schoolId), eq(academicTerms.academicYearId, recordId)));
        const linkedHolidays = await tx
          .select({ startDate: academicHolidays.startDate, endDate: academicHolidays.endDate })
          .from(academicHolidays)
          .where(and(eq(academicHolidays.schoolId, context.schoolId), eq(academicHolidays.academicYearId, recordId)));
        if (
          [...linkedTerms, ...linkedHolidays].some(
            (range) =>
              !isDateRangeWithin(range.startDate, range.endDate, result.data.startDate, result.data.endDate),
          )
        ) {
          return "linked-date-outside-year";
        }

        await tx
          .update(academicYears)
          .set(result.data)
          .where(and(eq(academicYears.id, recordId), eq(academicYears.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.year.updated", "academic_year", year.publicId, [
          "name",
          "startDate",
          "endDate",
        ]);
        return "updated";
      }

      await tx.insert(academicYears).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
      });
      await writeAudit(tx, context, "academic.year.created", "academic_year", publicId, [
        "name",
        "startDate",
        "endDate",
      ]);
      return "created";
    });
    if (outcome === "overlap") {
      return { error: "Academic-year date ranges cannot overlap another year for this school." };
    }
    if (outcome === "year-not-found") return { error: "Academic year was not found in this school." };
    if (outcome === "linked-date-outside-year") {
      return { error: "The updated year dates must continue to contain every term and holiday already linked to it." };
    }
    if (outcome !== "created" && outcome !== "updated") {
      return { error: "The school record could not be verified." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("academic year");
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function createAcademicTerm(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid academic term." };
  const result = termSchema.safeParse({
    academicYearId: readFormValue(formData, "academicYearId"),
    name: readFormValue(formData, "name"),
    startDate: readFormValue(formData, "startDate"),
    endDate: readFormValue(formData, "endDate"),
    examStartDate: readFormValue(formData, "examStartDate"),
    examEndDate: readFormValue(formData, "examEndDate"),
  });
  if (!result.success) {
    return { error: "Enter a name and a valid, ordered term date range." };
  }

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existingTerm] =
        recordId === null
          ? []
          : await tx
              .select({
                id: academicTerms.id,
                publicId: academicTerms.publicId,
                academicYearId: academicTerms.academicYearId,
              })
              .from(academicTerms)
              .where(and(eq(academicTerms.id, recordId), eq(academicTerms.schoolId, context.schoolId)))
              .for("update")
              .limit(1);
      if (recordId !== null && !existingTerm) return "term-not-found";

      const [year] = await tx
        .select({
          id: academicYears.id,
          startDate: academicYears.startDate,
          endDate: academicYears.endDate,
          status: academicYears.status,
        })
        .from(academicYears)
        .where(
          and(
            eq(academicYears.id, result.data.academicYearId),
            eq(academicYears.schoolId, context.schoolId),
          ),
        )
        .for("update")
        .limit(1);
      if (!year) return "year-not-found";
      if (year.status === "archived") return "year-archived";
      if (!isDateRangeWithin(result.data.startDate, result.data.endDate, year.startDate, year.endDate)) {
        return "term-outside-year";
      }
      if (
        !isValidOptionalDateRange(
          result.data.examStartDate,
          result.data.examEndDate,
          result.data.startDate,
          result.data.endDate,
        )
      ) {
        return "exam-dates-invalid";
      }
      const existingTerms = await tx
        .select({ id: academicTerms.id, startDate: academicTerms.startDate, endDate: academicTerms.endDate })
        .from(academicTerms)
        .where(
          and(
            eq(academicTerms.schoolId, context.schoolId),
            eq(academicTerms.academicYearId, year.id),
          ),
        );
      if (
        existingTerms.some((term) => term.id !== recordId &&
          doDateRangesOverlap(
            result.data.startDate,
            result.data.endDate,
            term.startDate,
            term.endDate,
          ),
        )
      ) {
        return "term-overlap";
      }

      if (recordId !== null && existingTerm) {
        const linkedHolidays = await tx
          .select({
            academicYearId: academicHolidays.academicYearId,
            startDate: academicHolidays.startDate,
            endDate: academicHolidays.endDate,
          })
          .from(academicHolidays)
          .where(
            and(
              eq(academicHolidays.schoolId, context.schoolId),
              eq(academicHolidays.academicTermId, recordId),
            ),
          );
        if (
          linkedHolidays.some(
            (holiday) =>
              holiday.academicYearId !== result.data.academicYearId ||
              !isDateRangeWithin(holiday.startDate, holiday.endDate, result.data.startDate, result.data.endDate),
          )
        ) {
          return "linked-holiday-outside-term";
        }

        await tx
          .update(academicTerms)
          .set(result.data)
          .where(and(eq(academicTerms.id, recordId), eq(academicTerms.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.term.updated", "academic_term", existingTerm.publicId, [
          "academicYearId",
          "name",
          "startDate",
          "endDate",
          "examStartDate",
          "examEndDate",
        ]);
        return "updated";
      }

      await tx.insert(academicTerms).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
      });
      await writeAudit(tx, context, "academic.term.created", "academic_term", publicId, [
        "academicYearId",
        "name",
        "startDate",
        "endDate",
        "examStartDate",
        "examEndDate",
      ]);
      return "created";
    });
    if (outcome === "term-not-found") return { error: "Academic term was not found in this school." };
    if (outcome === "year-not-found") return { error: "Choose an academic year belonging to your school." };
    if (outcome === "year-archived") return { error: "Terms cannot be added to an archived academic year." };
    if (outcome === "term-outside-year") {
      return { error: "The term dates must fall within the selected academic year." };
    }
    if (outcome === "exam-dates-invalid") {
      return { error: "Enter both exam dates and keep them within the selected term." };
    }
    if (outcome === "term-overlap") {
      return { error: "Term date ranges cannot overlap another term in this academic year." };
    }
    if (outcome === "linked-holiday-outside-term") {
      return { error: "The updated term dates must continue to contain every holiday already linked to it." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("term");
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function createClassLevel(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid class." };
  const result = classLevelSchema.safeParse({
    branchId: readFormValue(formData, "branchId"),
    name: readFormValue(formData, "name"),
    code: readFormValue(formData, "code"),
  });
  if (!result.success) return { error: "Enter a class name and a short code." };

  let sectionSetup: { academicYearId: number; names: string[] } | null = null;
  if (recordId === null) {
    const rawYearId = readFormValue(formData, "sectionsAcademicYearId");
    if (rawYearId) {
      const parsedYearId = idField.safeParse(rawYearId);
      if (!parsedYearId.success) return { error: "Choose a valid academic year for the sections." };
      const parsedNames = classSectionsSchema.shape.names.safeParse(
        readFormValue(formData, "sectionNames"),
      );
      if (!parsedNames.success) {
        return { error: "Enter between 1 and 30 unique section names, up to 80 characters each." };
      }
      sectionSetup = {
        academicYearId: parsedYearId.data,
        names: parsedNames.data,
      };
    }
  }

  const [branch] = await db
    .select({ id: schoolBranches.id })
    .from(schoolBranches)
    .where(
      and(
        eq(schoolBranches.id, result.data.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ),
    )
    .limit(1);
  if (!branch) return { error: "Choose an active branch belonging to your school." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [lockedBranch] = await tx
        .select({ id: schoolBranches.id })
        .from(schoolBranches)
        .where(
          and(
            eq(schoolBranches.id, result.data.branchId),
            eq(schoolBranches.schoolId, context.schoolId),
            eq(schoolBranches.status, "active"),
          ),
        )
        .for("update")
        .limit(1);
      if (!lockedBranch) return "branch-not-found";

      const [classLevel] =
        recordId === null
          ? []
          : await tx
              .select({
                id: classLevels.id,
                publicId: classLevels.publicId,
                branchId: classLevels.branchId,
              })
              .from(classLevels)
              .where(and(eq(classLevels.id, recordId), eq(classLevels.schoolId, context.schoolId)))
              .for("update")
              .limit(1);
      if (recordId !== null && !classLevel) return "class-not-found";

      const classesInBranch = await tx
        .select({ id: classLevels.id, name: classLevels.name })
        .from(classLevels)
        .where(
          and(
            eq(classLevels.schoolId, context.schoolId),
            eq(classLevels.branchId, result.data.branchId),
          ),
        );
      if (
        classesInBranch.some(
          (existingClass) =>
            existingClass.id !== recordId &&
            normalizeClassName(existingClass.name) === normalizeClassName(result.data.name),
        )
      ) {
        return "class-name-taken";
      }

      if (recordId !== null) {
        if (classLevel.branchId !== result.data.branchId) {
          const [[sectionCount], [subjectCount]] = await Promise.all([
            tx
              .select({ total: count() })
              .from(classSections)
              .where(and(eq(classSections.schoolId, context.schoolId), eq(classSections.classLevelId, recordId))),
            tx
              .select({ total: count() })
              .from(classSubjects)
              .where(and(eq(classSubjects.schoolId, context.schoolId), eq(classSubjects.classLevelId, recordId))),
          ]);
          if (Number(sectionCount.total) + Number(subjectCount.total) > 0) {
            return "class-has-assignments";
          }
        }

        await tx
          .update(classLevels)
          .set(result.data)
          .where(and(eq(classLevels.id, recordId), eq(classLevels.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.class_level.updated", "class_level", classLevel.publicId, [
          "branchId",
          "name",
          "code",
        ]);
        return "updated";
      } else {
        if (sectionSetup) {
          const [year] = await tx
            .select({ id: academicYears.id, status: academicYears.status })
            .from(academicYears)
            .where(
              and(
                eq(academicYears.id, sectionSetup.academicYearId!),
                eq(academicYears.schoolId, context.schoolId),
              ),
            )
            .for("update")
            .limit(1);
          if (!year) return "section-year-not-found";
          if (year.status === "archived") return "section-year-archived";
        }

        await tx.insert(classLevels).values({
          publicId,
          schoolId: context.schoolId,
          ...result.data,
        });
        if (sectionSetup) {
          const [createdClass] = await tx
            .select({ id: classLevels.id })
            .from(classLevels)
            .where(
              and(
                eq(classLevels.publicId, publicId),
                eq(classLevels.schoolId, context.schoolId),
              ),
            )
            .limit(1);
          if (!createdClass) throw new Error("Created class could not be loaded.");

          for (const name of sectionSetup.names) {
            const sectionPublicId = randomUUID();
            await tx.insert(classSections).values({
              publicId: sectionPublicId,
              schoolId: context.schoolId,
              academicYearId: sectionSetup.academicYearId,
              classLevelId: createdClass.id,
              name,
            });
            await writeAudit(
              tx,
              context,
              "academic.section.created",
              "class_section",
              sectionPublicId,
              ["academicYearId", "classLevelId", "name"],
            );
          }
        }
        await writeAudit(tx, context, "academic.class_level.created", "class_level", publicId, [
          "name",
          "code",
        ]);
        return "created";
      }
    });
    if (outcome === "class-not-found") return { error: "Class was not found in this school." };
    if (outcome === "branch-not-found") return { error: "Choose an active branch belonging to your school." };
    if (outcome === "class-name-taken") {
      return { error: "A class with this name already exists in the selected branch." };
    }
    if (outcome === "class-has-assignments") {
      return { error: "A class's branch cannot be changed while it has sections or subject assignments." };
    }
    if (outcome === "section-year-not-found") {
      return { error: "Choose an academic year belonging to your school." };
    }
    if (outcome === "section-year-archived") {
      return { error: "Sections cannot be added to an archived academic year." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { error: "This class code is already used in the selected branch." };
    }
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function createClassSection(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid class section." };
  const result = classSectionSchema.safeParse({
    academicYearId: readFormValue(formData, "academicYearId"),
    classLevelId: readFormValue(formData, "classLevelId"),
    name: readFormValue(formData, "name"),
  });
  if (!result.success) return { error: "Choose a year and class, then enter a section name." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existingSection] =
        recordId === null
          ? []
          : await tx
              .select({
                id: classSections.id,
                publicId: classSections.publicId,
                academicYearId: classSections.academicYearId,
                classLevelId: classSections.classLevelId,
                classTeacherId: classSections.classTeacherId,
              })
              .from(classSections)
              .where(and(eq(classSections.id, recordId), eq(classSections.schoolId, context.schoolId)))
              .for("update")
              .limit(1);
      if (recordId !== null && !existingSection) return "section-not-found";

      const [year] = await tx
        .select({ id: academicYears.id, status: academicYears.status })
        .from(academicYears)
        .where(
          and(
            eq(academicYears.id, result.data.academicYearId),
            eq(academicYears.schoolId, context.schoolId),
          ),
        )
        .for("update")
        .limit(1);
      const [classLevel] = await tx
        .select({ id: classLevels.id, branchId: classLevels.branchId })
        .from(classLevels)
        .where(
          and(
            eq(classLevels.id, result.data.classLevelId),
            eq(classLevels.schoolId, context.schoolId),
          ),
        )
        .limit(1);
      if (!year || !classLevel) return "structure-not-found";
      if (
        year.status === "archived" &&
        (recordId === null || existingSection?.academicYearId !== result.data.academicYearId)
      ) {
        return "year-archived";
      }

      if (recordId !== null && existingSection) {
        const structureChanged =
          existingSection.academicYearId !== result.data.academicYearId ||
          existingSection.classLevelId !== result.data.classLevelId;
        if (structureChanged) {
          const [[enrollmentCount], [routineCount]] = await Promise.all([
            tx
              .select({ total: count() })
              .from(studentEnrollments)
              .where(
                and(
                  eq(studentEnrollments.schoolId, context.schoolId),
                  eq(studentEnrollments.classSectionId, recordId),
                ),
              ),
            tx
              .select({ total: count() })
              .from(classRoutines)
              .where(
                and(eq(classRoutines.schoolId, context.schoolId), eq(classRoutines.classSectionId, recordId)),
              ),
          ]);
          if (Number(enrollmentCount.total) + Number(routineCount.total) > 0) {
            return "section-has-linked-records";
          }
          if (existingSection.classTeacherId !== null) {
            const [teacher] = await tx
              .select({ branchId: teachers.branchId })
              .from(teachers)
              .where(
                and(
                  eq(teachers.id, existingSection.classTeacherId),
                  eq(teachers.schoolId, context.schoolId),
                ),
              )
              .limit(1);
            if (!teacher || teacher.branchId !== classLevel.branchId) return "teacher-branch-mismatch";
          }
        }

        await tx
          .update(classSections)
          .set(result.data)
          .where(and(eq(classSections.id, recordId), eq(classSections.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.section.updated", "class_section", existingSection.publicId, [
          "academicYearId",
          "classLevelId",
          "name",
        ]);
        return "updated";
      }

      await tx.insert(classSections).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
      });
      await writeAudit(tx, context, "academic.section.created", "class_section", publicId, [
        "academicYearId",
        "classLevelId",
        "name",
      ]);
      return "created";
    });
    if (outcome === "structure-not-found") {
      return { error: "Choose an academic year and class belonging to your school." };
    }
    if (outcome === "section-not-found") return { error: "Class section was not found in this school." };
    if (outcome === "year-archived") {
      return { error: "New class sections cannot be added to an archived academic year." };
    }
    if (outcome === "section-has-linked-records") {
      return { error: "A section with enrollments or scheduled routines cannot be moved to another class or year." };
    }
    if (outcome === "teacher-branch-mismatch") {
      return { error: "Move or clear the section's class teacher before changing it to a different branch." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("section in that class and year");
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function createClassSections(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const result = classSectionsSchema.safeParse({
    academicYearId: readFormValue(formData, "academicYearId"),
    classLevelId: readFormValue(formData, "classLevelId"),
    names: readFormValue(formData, "names"),
  });
  if (!result.success) {
    return { error: "Choose an academic year and class, then enter 1 to 30 unique section names." };
  }

  const { academicYearId, classLevelId, names } = result.data;
  const outcome = await db.transaction(async (tx) => {
    const [year] = await tx
      .select({ id: academicYears.id, status: academicYears.status })
      .from(academicYears)
      .where(and(eq(academicYears.id, academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    const [classLevel] = await tx
      .select({ id: classLevels.id })
      .from(classLevels)
      .where(and(eq(classLevels.id, classLevelId), eq(classLevels.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!year || !classLevel) return "structure-not-found";
    if (year.status === "archived") return "year-archived";

    const existing = await tx
      .select({ name: classSections.name })
      .from(classSections)
      .where(
        and(
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, academicYearId),
          eq(classSections.classLevelId, classLevelId),
        ),
      );
    const existingNames = new Set(existing.map((section) => section.name.toLocaleLowerCase()));
    const missingNames = names.filter((name) => !existingNames.has(name.toLocaleLowerCase()));
    if (missingNames.length === 0) return "already-exists";

    for (const name of missingNames) {
      const publicId = randomUUID();
      await tx.insert(classSections).values({
        publicId,
        schoolId: context.schoolId,
        academicYearId,
        classLevelId,
        name,
      });
      await writeAudit(tx, context, "academic.section.created", "class_section", publicId, [
        "academicYearId",
        "classLevelId",
        "name",
      ]);
    }

    return "created";
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "duplicate-section" as const;
    throw error;
  });

  if (outcome === "structure-not-found") {
    return { error: "Choose an academic year and class belonging to your school." };
  }
  if (outcome === "year-archived") {
    return { error: "New class sections cannot be added to an archived academic year." };
  }
  if (outcome === "already-exists") {
    return { error: "All of those section names already exist for this class and academic year." };
  }
  if (outcome === "duplicate-section") {
    return { error: "A section with one of those names already exists. Review the class sections and try again." };
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function createSubject(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid subject." };
  const result = subjectSchema.safeParse({
    branchId: readFormValue(formData, "branchId"),
    name: readFormValue(formData, "name"),
    code: readFormValue(formData, "code"),
    subjectType: readFormValue(formData, "subjectType"),
  });
  if (!result.success) {
    return { error: "Enter a subject name and a valid code (letters, numbers, hyphens, or underscores)." };
  }

  const [branch] = await db
    .select({ id: schoolBranches.id })
    .from(schoolBranches)
    .where(
      and(
        eq(schoolBranches.id, result.data.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ),
    )
    .limit(1);
  if (!branch) return { error: "Choose an active branch belonging to your school." };

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [subject] = await tx
          .select({
            id: subjects.id,
            publicId: subjects.publicId,
            branchId: subjects.branchId,
          })
          .from(subjects)
          .where(and(eq(subjects.id, recordId), eq(subjects.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!subject) return "subject-not-found";

        if (subject.branchId !== result.data.branchId) {
          const [assignmentCount] = await tx
            .select({ total: count() })
            .from(classSubjects)
            .where(and(eq(classSubjects.schoolId, context.schoolId), eq(classSubjects.subjectId, recordId)));
          if (Number(assignmentCount.total) > 0) return "subject-has-assignments";
        }

        await tx
          .update(subjects)
          .set(result.data)
          .where(and(eq(subjects.id, recordId), eq(subjects.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.subject.updated", "subject", subject.publicId, [
          "branchId",
          "name",
          "code",
          "subjectType",
        ]);
        return "updated";
      }

      await tx.insert(subjects).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
      });
      await writeAudit(tx, context, "academic.subject.created", "subject", publicId, [
        "branchId",
        "name",
        "code",
        "subjectType",
      ]);
      return "created";
    });
    if (outcome === "subject-not-found") return { error: "Subject was not found in this school." };
    if (outcome === "subject-has-assignments") {
      return { error: "A subject's branch cannot be changed while it is assigned to classes." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("subject code");
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function assignSubjectToClass(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === undefined) return { error: "Invalid class-subject assignment." };
  const result = classSubjectSchema.safeParse({
    classLevelId: readFormValue(formData, "classLevelId"),
    subjectId: readFormValue(formData, "subjectId"),
    isCompulsory: readFormValue(formData, "isCompulsory"),
  });
  if (!result.success) return { error: "Choose a class, subject, and whether it is compulsory." };

  const [[classLevel], [subject]] = await Promise.all([
    db
      .select({ id: classLevels.id, branchId: classLevels.branchId })
      .from(classLevels)
      .where(and(eq(classLevels.id, result.data.classLevelId), eq(classLevels.schoolId, context.schoolId)))
      .limit(1),
    db
      .select({ id: subjects.id, branchId: subjects.branchId })
      .from(subjects)
      .where(and(eq(subjects.id, result.data.subjectId), eq(subjects.schoolId, context.schoolId)))
      .limit(1),
  ]);
  if (!classLevel || !subject) {
    return { error: "Choose a class and subject belonging to your school." };
  }
  if (classLevel.branchId !== subject.branchId) {
    return { error: "A subject can only be assigned to a class at the same branch." };
  }

  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx) => {
      if (recordId !== null) {
        const [assignment] = await tx
          .select({
            id: classSubjects.id,
            publicId: classSubjects.publicId,
            classLevelId: classSubjects.classLevelId,
            subjectId: classSubjects.subjectId,
            teacherId: classSubjects.teacherId,
          })
          .from(classSubjects)
          .where(and(eq(classSubjects.id, recordId), eq(classSubjects.schoolId, context.schoolId)))
          .for("update")
          .limit(1);
        if (!assignment) return "assignment-not-found";

        const structureChanged =
          assignment.classLevelId !== result.data.classLevelId ||
          assignment.subjectId !== result.data.subjectId;
        if (structureChanged) {
          const [routineCount] = await tx
            .select({ total: count() })
            .from(classRoutines)
            .where(and(eq(classRoutines.schoolId, context.schoolId), eq(classRoutines.classSubjectId, recordId)));
          if (Number(routineCount.total) > 0) return "assignment-has-routines";
          if (assignment.teacherId !== null) {
            const [teacher] = await tx
              .select({ branchId: teachers.branchId })
              .from(teachers)
              .where(and(eq(teachers.id, assignment.teacherId), eq(teachers.schoolId, context.schoolId)))
              .limit(1);
            if (!teacher || teacher.branchId !== classLevel.branchId) return "teacher-branch-mismatch";
          }
        }

        await tx
          .update(classSubjects)
          .set(result.data)
          .where(and(eq(classSubjects.id, recordId), eq(classSubjects.schoolId, context.schoolId)));
        await writeAudit(tx, context, "academic.subject.class_assignment.updated", "class_subject", assignment.publicId, [
          "classLevelId",
          "subjectId",
          "isCompulsory",
        ]);
        return "updated";
      }

      await tx.insert(classSubjects).values({
        publicId,
        schoolId: context.schoolId,
        ...result.data,
      });
      await writeAudit(tx, context, "academic.subject.assigned_to_class", "class_subject", publicId, [
        "classLevelId",
        "subjectId",
        "isCompulsory",
      ]);
      return "created";
    });
    if (outcome === "assignment-not-found") return { error: "Subject assignment was not found in this school." };
    if (outcome === "assignment-has-routines") {
      return { error: "A class-subject assignment with scheduled periods cannot be moved to another class or subject." };
    }
    if (outcome === "teacher-branch-mismatch") {
      return { error: "Clear or reassign this subject teacher before changing the assignment's branch." };
    }
  } catch (error) {
    if (isDuplicateEntryError(error)) return duplicateError("subject assignment for that class");
    throw error;
  }

  revalidatePath("/admin/academics");
  return { success: true };
}

export async function deleteClassLevel(
  _previousState: AcademicActionState,
  formData: FormData,
): Promise<AcademicActionState> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === null || recordId === undefined) return { error: "Invalid class deletion request." };

  try {
    const outcome = await db.transaction(async (tx) => {
      const [classLevel] = await tx
        .select({ id: classLevels.id, publicId: classLevels.publicId })
        .from(classLevels)
        .where(and(eq(classLevels.id, recordId), eq(classLevels.schoolId, context.schoolId)))
        .for("update")
        .limit(1);
      if (!classLevel) return "not-found";

      const [sectionRecords, subjectRecords, [feeStructureCount]] = await Promise.all([
        tx.select({ id: classSections.id, publicId: classSections.publicId })
          .from(classSections)
          .where(and(eq(classSections.schoolId, context.schoolId), eq(classSections.classLevelId, recordId))),
        tx.select({ id: classSubjects.id, publicId: classSubjects.publicId })
          .from(classSubjects)
          .where(and(eq(classSubjects.schoolId, context.schoolId), eq(classSubjects.classLevelId, recordId))),
        tx.select({ total: count() })
          .from(feeStructures)
          .where(and(eq(feeStructures.schoolId, context.schoolId), eq(feeStructures.classLevelId, recordId))),
      ]);
      const sectionIds = sectionRecords.map((section) => section.id);
      if (Number(feeStructureCount.total) > 0) return "has-fee-structures";

      if (sectionIds.length > 0) {
        const [enrollments, attendance, events] = await Promise.all([
          tx.select({ total: count() }).from(studentEnrollments).where(and(
            eq(studentEnrollments.schoolId, context.schoolId),
            inArray(studentEnrollments.classSectionId, sectionIds),
          )),
          tx.select({ total: count() }).from(studentAttendance).where(and(
            eq(studentAttendance.schoolId, context.schoolId),
            inArray(studentAttendance.classSectionId, sectionIds),
          )),
          tx.select({ total: count() }).from(studentAcademicEvents).where(and(
            eq(studentAcademicEvents.schoolId, context.schoolId),
            or(
              inArray(studentAcademicEvents.fromClassSectionId, sectionIds),
              inArray(studentAcademicEvents.toClassSectionId, sectionIds),
            ),
          )),
        ]);
        if (Number(enrollments[0].total) + Number(attendance[0].total) + Number(events[0].total) > 0) {
          return "has-student-history";
        }
      }

      const routineConditions = [];
      if (sectionIds.length > 0) routineConditions.push(inArray(classRoutines.classSectionId, sectionIds));
      if (subjectRecords.length > 0) {
        routineConditions.push(inArray(classRoutines.classSubjectId, subjectRecords.map((subject) => subject.id)));
      }
      const routines = routineConditions.length > 0
        ? await tx.select({ id: classRoutines.id, publicId: classRoutines.publicId })
            .from(classRoutines)
            .where(and(eq(classRoutines.schoolId, context.schoolId), or(...routineConditions)))
        : [];
      for (const routine of routines) {
        await tx.delete(classRoutines).where(and(
          eq(classRoutines.id, routine.id),
          eq(classRoutines.schoolId, context.schoolId),
        ));
        await writeAudit(tx, context, "academic.class_routine.deleted_with_class", "class_routine", routine.publicId, ["deleted"]);
      }
      for (const subject of subjectRecords) {
        await tx.delete(classSubjects).where(and(
          eq(classSubjects.id, subject.id),
          eq(classSubjects.schoolId, context.schoolId),
        ));
        await writeAudit(tx, context, "academic.subject.class_assignment.deleted_with_class", "class_subject", subject.publicId, ["deleted"]);
      }
      for (const section of sectionRecords) {
        await tx.delete(classSections).where(and(
          eq(classSections.id, section.id),
          eq(classSections.schoolId, context.schoolId),
        ));
        await writeAudit(tx, context, "academic.section.deleted_with_class", "class_section", section.publicId, ["deleted"]);
      }
      await tx.delete(classLevels).where(and(
        eq(classLevels.id, classLevel.id),
        eq(classLevels.schoolId, context.schoolId),
      ));
      await writeAudit(tx, context, "academic.class_level.deleted", "class_level", classLevel.publicId, ["deleted"]);
      return "deleted";
    });

    if (outcome === "not-found") return { error: "Class was not found in this school." };
    if (outcome === "has-fee-structures") {
      return { error: "This class has fee structures. Reassign or remove those records before deletion; no data was changed." };
    }
    if (outcome === "has-student-history") {
      return { error: "This class has student enrollments, attendance, or academic history. That history is preserved, so the class cannot be deleted." };
    }
  } catch (error) {
    console.error("Class deletion failed; transaction rolled back.", error);
    return { error: "The class could not be deleted. No changes were saved; check linked records and try again." };
  }

  revalidatePath("/admin/academics");
  redirect("/admin/academics?section=classes&notice=class-deleted");
}

export async function deleteSubject(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === null || recordId === undefined) throw new Error("Invalid subject deletion request.");

  const outcome = await db.transaction(async (tx) => {
    const [subject] = await tx
      .select({ id: subjects.id, publicId: subjects.publicId })
      .from(subjects)
      .where(and(eq(subjects.id, recordId), eq(subjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!subject) return "not-found";

    const [assignmentCount] = await tx
      .select({ total: count() })
      .from(classSubjects)
      .where(and(eq(classSubjects.schoolId, context.schoolId), eq(classSubjects.subjectId, recordId)));
    if (Number(assignmentCount.total) > 0) return "in-use";

    await tx
      .delete(subjects)
      .where(and(eq(subjects.id, subject.id), eq(subjects.schoolId, context.schoolId)));
    await writeAudit(tx, context, "academic.subject.deleted", "subject", subject.publicId, ["deleted"]);
    return "deleted";
  });
  if (outcome === "not-found") throw new Error("Subject was not found in this school.");
  if (outcome === "in-use") {
    throw new Error("This subject is assigned to one or more classes. Remove those assignments before deleting it.");
  }

  revalidatePath("/admin/academics");
}

export async function deleteClassSubject(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === null || recordId === undefined) {
    throw new Error("Invalid class-subject deletion request.");
  }

  const outcome = await db.transaction(async (tx) => {
    const [assignment] = await tx
      .select({ id: classSubjects.id, publicId: classSubjects.publicId })
      .from(classSubjects)
      .where(and(eq(classSubjects.id, recordId), eq(classSubjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!assignment) return "not-found";

    const [routineCount] = await tx
      .select({ total: count() })
      .from(classRoutines)
      .where(and(eq(classRoutines.schoolId, context.schoolId), eq(classRoutines.classSubjectId, recordId)));
    if (Number(routineCount.total) > 0) return "in-use";

    await tx
      .delete(classSubjects)
      .where(and(eq(classSubjects.id, assignment.id), eq(classSubjects.schoolId, context.schoolId)));
    await writeAudit(
      tx,
      context,
      "academic.subject.class_assignment.deleted",
      "class_subject",
      assignment.publicId,
      ["deleted"],
    );
    return "deleted";
  });
  if (outcome === "not-found") {
    throw new Error("Subject assignment was not found in this school.");
  }
  if (outcome === "in-use") {
    throw new Error("This subject assignment has scheduled periods. Remove its routines before deleting it.");
  }

  revalidatePath("/admin/academics");
}

export async function deleteClassSection(formData: FormData): Promise<void> {
  const context = await requireSchoolPermission("school.settings.manage");
  const recordId = readRecordId(formData);
  if (recordId === null || recordId === undefined) {
    throw new Error("Invalid class-section deletion request.");
  }

  const outcome = await db.transaction(async (tx) => {
    const [section] = await tx
      .select({ id: classSections.id, publicId: classSections.publicId })
      .from(classSections)
      .where(and(eq(classSections.id, recordId), eq(classSections.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!section) return "not-found";

    const [[enrollmentCount], [routineCount], [eventCount]] = await Promise.all([
      tx
        .select({ total: count() })
        .from(studentEnrollments)
        .where(and(eq(studentEnrollments.schoolId, context.schoolId), eq(studentEnrollments.classSectionId, recordId))),
      tx
        .select({ total: count() })
        .from(classRoutines)
        .where(and(eq(classRoutines.schoolId, context.schoolId), eq(classRoutines.classSectionId, recordId))),
      tx
        .select({ total: count() })
        .from(studentAcademicEvents)
        .where(
          and(
            eq(studentAcademicEvents.schoolId, context.schoolId),
            or(
              eq(studentAcademicEvents.fromClassSectionId, recordId),
              eq(studentAcademicEvents.toClassSectionId, recordId),
            ),
          ),
        ),
    ]);
    if (
      Number(enrollmentCount.total) +
        Number(routineCount.total) +
        Number(eventCount.total) >
      0
    ) {
      return "in-use";
    }

    await tx
      .delete(classSections)
      .where(and(eq(classSections.id, section.id), eq(classSections.schoolId, context.schoolId)));
    await writeAudit(tx, context, "academic.class_section.deleted", "class_section", section.publicId, [
      "deleted",
    ]);
    return "deleted";
  });
  if (outcome === "not-found") throw new Error("Class section was not found in this school.");
  if (outcome === "in-use") {
    throw new Error("This section has enrollments, routines, or academic history. It cannot be deleted.");
  }

  revalidatePath("/admin/academics");
}
