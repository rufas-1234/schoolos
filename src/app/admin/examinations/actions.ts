"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  classSubjects,
  examAttendance,
  examClasses,
  examComponentMarks,
  examComponents,
  examGradeBands,
  examGradingScales,
  examMarkAudits,
  examMarkCorrections,
  examMarks,
  examStudentRemarks,
  examSubjects,
  examTypes,
  examinations,
  schoolBranches,
  staffMembers,
  studentEnrollments,
  students,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate, isValidDateRange } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import {
  calculateComponentTotal,
  completeSubmittedMarkIds,
  parseExamComponents,
  validateGradeBands,
  type GradeBand,
} from "@/lib/examination-policy";

export type ExaminationActionState = { error?: string; success?: boolean };
const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const numericField = z.string().trim().regex(/^\d{1,6}(\.\d{1,2})?$/).transform(Number);
const text = (max: number) => z.string().trim().min(1).max(max);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

async function assignedSubject(examSubjectId: number, schoolId: number, userId: string) {
  const [record] = await db
    .select({ id: examSubjects.id, status: examSubjects.status })
    .from(examSubjects)
    .innerJoin(classSubjects, and(
      eq(classSubjects.id, examSubjects.classSubjectId),
      eq(classSubjects.schoolId, schoolId),
    ))
    .innerJoin(teachers, and(
      eq(teachers.id, classSubjects.teacherId!),
      eq(teachers.schoolId, schoolId),
      eq(teachers.status, "active"),
    ))
    .innerJoin(staffMembers, and(
      eq(staffMembers.id, teachers.staffMemberId!),
      eq(staffMembers.schoolId, schoolId),
      eq(staffMembers.linkedUserId, userId),
      eq(staffMembers.status, "active"),
    ))
    .where(and(eq(examSubjects.id, examSubjectId), eq(examSubjects.schoolId, schoolId)))
    .limit(1);
  return record ?? null;
}

export async function createGradingScale(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.create");
  const bands = value(formData, "bands")
    .split(/\r?\n/)
    .map((line): GradeBand | null => {
      const [min, max, grade, description, performanceRemark, ...extra] = line.split("|").map((part) => part.trim());
      if (!min && !max && !grade && !description && !performanceRemark) return null;
      const minimum = Number(min);
      const maximum = Number(max);
      if (
        extra.length > 0 ||
        !min ||
        !max ||
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum) ||
        !grade ||
        !description ||
        !performanceRemark
      ) return null;
      return { minPercent: minimum, maxPercent: maximum, grade, description, performanceRemark };
    })
    .filter((band): band is GradeBand => band !== null);
  const validationError = validateGradeBands(bands);
  const parsed = z.object({
    name: text(120),
  }).safeParse({ name: value(formData, "name") });
  if (!parsed.success || validationError || bands.length !== value(formData, "bands").split(/\r?\n/).filter((line) => line.trim()).length) {
    return { error: validationError ?? "Enter a unique scale name and one valid pipe-separated row per grade band." };
  }
  const setDefault = value(formData, "isDefault") === "on";
  const scalePublicId = randomUUID();
  const duplicate = await db.select({ id: examGradingScales.id }).from(examGradingScales)
    .where(and(eq(examGradingScales.schoolId, context.schoolId), eq(examGradingScales.name, parsed.data.name)))
    .limit(1);
  if (duplicate.length) return { error: "A grading scale with that name already exists." };

  const createOutcome = await db.transaction(async (tx) => {
    if (setDefault) {
      await tx.update(examGradingScales).set({ isDefault: false })
        .where(eq(examGradingScales.schoolId, context.schoolId));
    }
    const [existing] = await tx.select({ id: examGradingScales.id }).from(examGradingScales)
      .where(eq(examGradingScales.schoolId, context.schoolId)).limit(1);
    const [scale] = await tx.insert(examGradingScales).values({
      publicId: scalePublicId,
      schoolId: context.schoolId,
      name: parsed.data.name,
      allowRanking: value(formData, "allowRanking") === "on",
      isDefault: setDefault || !existing,
      createdBy: context.user.id,
    }).$returningId();
    await tx.insert(examGradeBands).values(bands.map((band, sortOrder) => ({
      gradingScaleId: scale.id,
      minPercent: band.minPercent.toFixed(2),
      maxPercent: band.maxPercent.toFixed(2),
      grade: band.grade,
      description: band.description,
      performanceRemark: band.performanceRemark,
      sortOrder,
    })));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.grading_scale.created",
      resourceType: "exam_grading_scale",
      resourcePublicId: scalePublicId,
      changedFields: ["name", "gradeBands", "allowRanking", "isDefault"],
    });
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "duplicate" as const;
    throw error;
  });
  if (createOutcome === "duplicate") return { error: "A grading scale with that name already exists." };
  revalidatePath("/admin/examinations");
  return { success: true };
}

export async function createExamType(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.create");
  const parsed = z.object({
    name: text(120),
    branchId: z.union([z.literal(""), idField]),
    averageMark: numericField.pipe(z.number().nonnegative().max(100)),
  }).safeParse({
    name: value(formData, "name"),
    branchId: value(formData, "branchId"),
    averageMark: value(formData, "averageMark"),
  });
  if (!parsed.success) return { error: "Enter an exam type name and a valid non-negative average mark." };
  const branchId = parsed.data.branchId || null;
  if (branchId) {
    const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
      eq(schoolBranches.id, branchId),
      eq(schoolBranches.schoolId, context.schoolId),
      eq(schoolBranches.status, "active"),
    )).limit(1);
    if (!branch) return { error: "Choose an active branch belonging to your school." };
  }
  const duplicate = await db.select({ id: examTypes.id }).from(examTypes).where(and(
    eq(examTypes.schoolId, context.schoolId),
    branchId ? eq(examTypes.branchId, branchId) : isNull(examTypes.branchId),
    eq(examTypes.name, parsed.data.name),
  )).limit(1);
  if (duplicate.length) return { error: "An exam type with that name already exists for this branch." };
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      if (value(formData, "averagePassing") === "on") {
        await tx.update(examTypes).set({ averagePassing: false })
          .where(and(
            eq(examTypes.schoolId, context.schoolId),
            eq(examTypes.averagePassing, true),
            branchId ? eq(examTypes.branchId, branchId) : isNull(examTypes.branchId),
          ));
      }
      await tx.insert(examTypes).values({
        publicId,
        schoolId: context.schoolId,
        branchId,
        name: parsed.data.name,
        averagePassing: value(formData, "averagePassing") === "on",
        averageMark: parsed.data.averageMark.toFixed(2),
        createdBy: context.user.id,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "examination.type.created",
        resourceType: "exam_type",
        resourcePublicId: publicId,
        changedFields: ["branchId", "name", "averagePassing", "averageMark"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "An exam type with that name already exists." };
    throw error;
  }
  revalidatePath("/admin/examinations?section=types");
  return { success: true };
}

export async function createExamination(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.create");
  const classValues = formData.getAll("classLevelIds");
  const parsed = z.object({
    name: text(120),
    branchId: idField,
    academicYearId: idField,
    academicTermId: z.union([z.literal(""), idField]),
    examTypeId: z.union([z.literal(""), idField]),
    gradingScaleId: z.union([z.literal(""), idField]),
    examSystem: z.enum(["single", "multi"]),
    components: z.string().trim().min(1).max(4000),
    startDate: z.string().refine(isCalendarDate),
    endDate: z.string().refine(isCalendarDate),
    classLevelIds: z.array(idField).min(1),
  }).safeParse({
    name: value(formData, "name"),
    branchId: value(formData, "branchId"),
    academicYearId: value(formData, "academicYearId"),
    academicTermId: value(formData, "academicTermId"),
    examTypeId: value(formData, "examTypeId"),
    gradingScaleId: value(formData, "gradingScaleId"),
    examSystem: value(formData, "examSystem"),
    components: value(formData, "components"),
    startDate: value(formData, "startDate"),
    endDate: value(formData, "endDate"),
    classLevelIds: classValues,
  });
  if (!parsed.success || !isValidDateRange(value(formData, "startDate"), value(formData, "endDate"))) {
    return { error: "Select a branch and academic year, enter valid exam dates and mark distributions, and choose at least one class." };
  }
  const componentDefinitions = parseExamComponents(parsed.data.components, parsed.data.examSystem);
  if (!componentDefinitions) {
    return { error: parsed.data.examSystem === "single"
      ? "Single Exam requires exactly one valid unique component as title | maximum marks."
      : "Multi Exam requires at least two valid unique components as title | maximum marks." };
  }
  const totalMaxMarks = componentDefinitions.reduce((total, component) => total + component.maxMarks, 0);
  if (totalMaxMarks > 999999) return { error: "The total maximum marks across components cannot exceed 999,999." };
  const branchId = parsed.data.branchId;
  if (branchId) {
    const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
      eq(schoolBranches.id, branchId),
      eq(schoolBranches.schoolId, context.schoolId),
      eq(schoolBranches.status, "active"),
    )).limit(1);
    if (!branch) return { error: "Choose an active branch belonging to your school." };
  }
  const classIds = [...new Set(parsed.data.classLevelIds)];
  const [year] = await db.select({
    id: academicYears.id,
    startDate: academicYears.startDate,
    endDate: academicYears.endDate,
  }).from(academicYears)
    .where(and(eq(academicYears.id, parsed.data.academicYearId), eq(academicYears.schoolId, context.schoolId))).limit(1);
  if (!year) return { error: "Choose an academic year belonging to your school." };
  const selectedScaleId = parsed.data.gradingScaleId || null;
  const scale = selectedScaleId
    ? await db.select({ id: examGradingScales.id }).from(examGradingScales)
      .where(and(eq(examGradingScales.id, selectedScaleId), eq(examGradingScales.schoolId, context.schoolId))).limit(1)
    : [];
  if (selectedScaleId && !scale.length) {
    return { error: "Choose a grading scale belonging to your school." };
  }
  const selectedExamTypeId = parsed.data.examTypeId || null;
  const examType = selectedExamTypeId
    ? await db.select({ id: examTypes.id, branchId: examTypes.branchId }).from(examTypes).where(and(
      eq(examTypes.id, selectedExamTypeId),
      eq(examTypes.schoolId, context.schoolId),
    )).limit(1)
    : [];
  if (selectedExamTypeId && (!examType[0] || examType[0].branchId !== null && examType[0].branchId !== branchId)) {
    return { error: "Choose an examination type for the selected branch or one shared across all branches." };
  }
  if (parsed.data.startDate < year.startDate || parsed.data.endDate > year.endDate) {
    return { error: "Examination dates must fall within the selected academic year." };
  }
  if (parsed.data.academicTermId) {
    const [term] = await db.select({
      id: academicTerms.id,
      startDate: academicTerms.startDate,
      endDate: academicTerms.endDate,
    }).from(academicTerms).where(and(
      eq(academicTerms.id, parsed.data.academicTermId),
      eq(academicTerms.academicYearId, year.id),
      eq(academicTerms.schoolId, context.schoolId),
    )).limit(1);
    if (!term) return { error: "Choose a term in the selected academic year." };
    if (parsed.data.startDate < term.startDate || parsed.data.endDate > term.endDate) {
      return { error: "Examination dates must fall within the selected term." };
    }
  }
  const classes = await db.select({ id: classLevels.id, branchId: classLevels.branchId }).from(classLevels).where(and(
    eq(classLevels.schoolId, context.schoolId),
    inArray(classLevels.id, classIds),
    eq(classLevels.status, "active"),
  ));
  if (classes.length !== classIds.length) return { error: "Choose active classes belonging to your school." };
  if (branchId && classes.some((classLevel) => classLevel.branchId !== branchId)) {
    return { error: "Every selected class must belong to the examination branch." };
  }

  const assignments = await db.select({
    classLevelId: classSubjects.classLevelId,
    classSubjectId: classSubjects.id,
  }).from(classSubjects).where(and(
    eq(classSubjects.schoolId, context.schoolId),
    inArray(classSubjects.classLevelId, classIds),
  ));
  if (assignments.length === 0 || classIds.some((id) => !assignments.some((subject) => subject.classLevelId === id))) {
    return { error: "Every selected class must have at least one assigned subject." };
  }

  const duplicate = await db.select({ id: examinations.id }).from(examinations).where(and(
    eq(examinations.schoolId, context.schoolId),
    eq(examinations.academicYearId, year.id),
    eq(examinations.name, parsed.data.name),
  )).limit(1);
  if (duplicate.length) return { error: "An examination with that name already exists in this academic year." };

  const examPublicId = randomUUID();
  const createOutcome = await db.transaction(async (tx) => {
    let scaleId = selectedScaleId;
    if (!scaleId) {
      const [existingScale] = await tx.select({
        id: examGradingScales.id,
        name: examGradingScales.name,
      }).from(examGradingScales)
        .where(and(eq(examGradingScales.schoolId, context.schoolId), eq(examGradingScales.isDefault, true)))
        .orderBy(asc(examGradingScales.id))
        .limit(1);
      if (existingScale && !existingScale.name.startsWith("TEST DATA - ")) {
        scaleId = existingScale.id;
      } else {
        const existingScales = await tx.select({
          id: examGradingScales.id,
          name: examGradingScales.name,
        }).from(examGradingScales)
          .where(eq(examGradingScales.schoolId, context.schoolId))
          .orderBy(asc(examGradingScales.id));
        const firstSchoolScale = existingScales.find((item) => !item.name.startsWith("TEST DATA - "));
        if (firstSchoolScale) {
          scaleId = firstSchoolScale.id;
        } else {
          const [createdScale] = await tx.insert(examGradingScales).values({
            publicId: randomUUID(),
            schoolId: context.schoolId,
            name: "Standard 0-100",
            allowRanking: false,
            isDefault: true,
            createdBy: context.user.id,
          }).$returningId();
          scaleId = createdScale.id;
          await tx.insert(examGradeBands).values([
            { gradingScaleId: scaleId, minPercent: "0.00", maxPercent: "40.00", grade: "F", description: "Needs improvement", performanceRemark: "Needs additional support", sortOrder: 0 },
            { gradingScaleId: scaleId, minPercent: "40.00", maxPercent: "60.00", grade: "D", description: "Developing", performanceRemark: "Keep practicing", sortOrder: 1 },
            { gradingScaleId: scaleId, minPercent: "60.00", maxPercent: "75.00", grade: "C", description: "Satisfactory", performanceRemark: "Good effort", sortOrder: 2 },
            { gradingScaleId: scaleId, minPercent: "75.00", maxPercent: "90.00", grade: "B", description: "Very good", performanceRemark: "Very good work", sortOrder: 3 },
            { gradingScaleId: scaleId, minPercent: "90.00", maxPercent: "100.00", grade: "A", description: "Excellent", performanceRemark: "Outstanding performance", sortOrder: 4 },
          ]);
        }
      }
    }

    let examTypeId = selectedExamTypeId;
    if (!examTypeId) {
      const existingTypes = await tx.select({
        id: examTypes.id,
        name: examTypes.name,
      }).from(examTypes)
        .where(and(
          eq(examTypes.schoolId, context.schoolId),
          branchId ? or(eq(examTypes.branchId, branchId), isNull(examTypes.branchId)) : isNull(examTypes.branchId),
        ))
        .orderBy(asc(examTypes.branchId), asc(examTypes.id));
      const existingType = existingTypes.find((item) => !item.name.startsWith("TEST DATA - "));
      if (existingType) {
        examTypeId = existingType.id;
      } else {
        const [createdType] = await tx.insert(examTypes).values({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          branchId,
          name: "General",
          averagePassing: false,
          averageMark: "0.00",
          createdBy: context.user.id,
        }).$returningId();
        examTypeId = createdType.id;
      }
    }
    const [exam] = await tx.insert(examinations).values({
      publicId: examPublicId,
      schoolId: context.schoolId,
      branchId,
      academicYearId: year.id,
      academicTermId: parsed.data.academicTermId || null,
      examTypeId,
      gradingScaleId: scaleId,
      examSystem: parsed.data.examSystem,
      name: parsed.data.name,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      status: "open",
      createdBy: context.user.id,
    }).$returningId();
    for (const classLevelId of classIds) {
      const [examClass] = await tx.insert(examClasses).values({
        publicId: randomUUID(),
        schoolId: context.schoolId,
        examinationId: exam.id,
        classLevelId,
      }).$returningId();
      const classAssignments = assignments.filter((assignment) => assignment.classLevelId === classLevelId);
      const newSubjects = await tx.insert(examSubjects).values(classAssignments.map((assignment) => ({
        publicId: randomUUID(),
        schoolId: context.schoolId,
        examClassId: examClass.id,
        classSubjectId: assignment.classSubjectId,
        examDate: parsed.data.startDate,
        maxMarks: totalMaxMarks.toFixed(2),
        weight: "1",
        status: "draft",
      }))).$returningId();
      await tx.insert(examComponents).values(newSubjects.flatMap((subject) =>
        componentDefinitions.map((component, sortOrder) => ({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          examSubjectId: subject.id,
          title: component.title,
          maxMarks: component.maxMarks.toFixed(2),
          sortOrder,
        })),
      ));
      const enrollments = await tx.select({ id: studentEnrollments.id })
        .from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.classLevelId, classLevelId),
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
          branchId ? eq(students.branchId, branchId) : undefined,
        ));
      if (enrollments.length) {
        await tx.insert(examMarks).values(newSubjects.flatMap((subject) => enrollments.map((enrollment) => ({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          examSubjectId: subject.id,
          enrollmentId: enrollment.id,
          marks: null,
          updatedBy: context.user.id,
        }))));
        const componentRows = await tx.select({
          id: examComponents.id,
          examSubjectId: examComponents.examSubjectId,
        }).from(examComponents).where(and(
          eq(examComponents.schoolId, context.schoolId),
          inArray(examComponents.examSubjectId, newSubjects.map((subject) => subject.id)),
        ));
        const markRows = await tx.select({
          id: examMarks.id,
          examSubjectId: examMarks.examSubjectId,
        }).from(examMarks).where(and(
          eq(examMarks.schoolId, context.schoolId),
          inArray(examMarks.examSubjectId, newSubjects.map((subject) => subject.id)),
        ));
        if (componentRows.length !== newSubjects.length * componentDefinitions.length ||
          markRows.length !== newSubjects.length * enrollments.length) {
          throw new Error("The new examination roster could not be initialized completely.");
        }
        await tx.insert(examComponentMarks).values(markRows.flatMap((mark) =>
          componentRows.filter((component) => component.examSubjectId === mark.examSubjectId).map((component) => ({
            publicId: randomUUID(),
            schoolId: context.schoolId,
            examMarkId: mark.id,
            examComponentId: component.id,
            marks: null,
            updatedBy: context.user.id,
          })),
        ));
      }
    }
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.created",
      resourceType: "examination",
      resourcePublicId: examPublicId,
      changedFields: ["name", "branchId", "examSystem", "components", "examTypeId", "academicYearId", "academicTermId", "classes", "subjects", "dates"],
    });
    return exam.id;
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "duplicate" as const;
    throw error;
  });
  if (createOutcome === "duplicate") {
    return { error: "An examination with that name already exists in this academic year." };
  }
  revalidatePath("/admin/examinations");
  redirect(`/admin/examinations/${createOutcome}`);
}

export async function updateExamination(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.create");
  const parsed = z.object({
    examinationId: idField,
    name: text(120),
    branchId: z.union([z.literal(""), idField]),
    examSystem: z.enum(["single", "multi"]),
    components: z.string().trim().min(1).max(4000),
    startDate: z.string().refine(isCalendarDate),
    endDate: z.string().refine(isCalendarDate),
  }).safeParse({
    examinationId: value(formData, "examinationId"),
    name: value(formData, "name"),
    branchId: value(formData, "branchId"),
    examSystem: value(formData, "examSystem"),
    components: value(formData, "components"),
    startDate: value(formData, "startDate"),
    endDate: value(formData, "endDate"),
  });
  if (!parsed.success || !isValidDateRange(value(formData, "startDate"), value(formData, "endDate"))) {
    return { error: "Enter an exam title and valid examination dates." };
  }
  const componentDefinitions = parseExamComponents(parsed.data.components, parsed.data.examSystem);
  if (!componentDefinitions) {
    return { error: parsed.data.examSystem === "single"
      ? "Single Exam requires exactly one valid unique mark distribution."
      : "Multi Exam requires at least two valid unique mark distributions." };
  }
  const totalMaxMarks = componentDefinitions.reduce((total, component) => total + component.maxMarks, 0);
  if (totalMaxMarks > 999999) return { error: "The total maximum marks cannot exceed 999,999." };
  const branchId = parsed.data.branchId || null;
  const componentPayload = JSON.stringify(componentDefinitions);
  const outcome = await db.transaction(async (tx) => {
    const [exam] = await tx.select({
      id: examinations.id,
      publicId: examinations.publicId,
      status: examinations.status,
      academicYearId: examinations.academicYearId,
      academicTermId: examinations.academicTermId,
      name: examinations.name,
      branchId: examinations.branchId,
      examSystem: examinations.examSystem,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
    }).from(examinations).where(and(
      eq(examinations.id, parsed.data.examinationId),
      eq(examinations.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!exam) return "missing" as const;
    if (exam.status !== "open") return "locked" as const;
    const [year] = await tx.select({
      startDate: academicYears.startDate,
      endDate: academicYears.endDate,
    }).from(academicYears).where(and(
      eq(academicYears.id, exam.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    )).limit(1);
    if (!year || parsed.data.startDate < year.startDate || parsed.data.endDate > year.endDate) {
      return "invalid-dates" as const;
    }
    if (exam.academicTermId) {
      const [term] = await tx.select({
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
      }).from(academicTerms).where(and(
        eq(academicTerms.id, exam.academicTermId),
        eq(academicTerms.schoolId, context.schoolId),
      )).limit(1);
      if (!term || parsed.data.startDate < term.startDate || parsed.data.endDate > term.endDate) {
        return "invalid-dates" as const;
      }
    }
    const duplicate = await tx.select({ id: examinations.id }).from(examinations).where(and(
      eq(examinations.schoolId, context.schoolId),
      eq(examinations.academicYearId, exam.academicYearId),
      eq(examinations.name, parsed.data.name),
    )).limit(1);
    if (duplicate.length && duplicate[0].id !== exam.id) return "duplicate" as const;

    const classRows = await tx.select({
      classLevelId: examClasses.classLevelId,
      branchId: classLevels.branchId,
    }).from(examClasses).innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    )).where(and(
      eq(examClasses.examinationId, exam.id),
      eq(examClasses.schoolId, context.schoolId),
    ));
    if (!classRows.length || branchId && classRows.some((classRow) => classRow.branchId !== branchId)) {
      return "branch-classes" as const;
    }
    if (branchId) {
      const [branch] = await tx.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
        eq(schoolBranches.id, branchId),
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      )).limit(1);
      if (!branch) return "branch-classes" as const;
    }
    const subjectRows = await tx.select({
      id: examSubjects.id,
      classLevelId: examClasses.classLevelId,
      status: examSubjects.status,
    }).from(examSubjects).innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    )).where(and(
      eq(examClasses.examinationId, exam.id),
      eq(examSubjects.schoolId, context.schoolId),
    ));
    if (!subjectRows.length || subjectRows.some((subject) => subject.status !== "draft")) {
      return "locked" as const;
    }
    if (exam.branchId !== branchId) {
      for (const subject of subjectRows) {
        const [expectedRoster, existingRoster] = await Promise.all([
          tx.select({ id: studentEnrollments.id }).from(studentEnrollments)
            .innerJoin(classSections, and(
              eq(classSections.id, studentEnrollments.classSectionId),
              eq(classSections.schoolId, context.schoolId),
              eq(classSections.classLevelId, subject.classLevelId),
              eq(classSections.academicYearId, exam.academicYearId),
            ))
            .innerJoin(students, and(
              eq(students.id, studentEnrollments.studentId),
              eq(students.schoolId, context.schoolId),
            ))
            .where(and(
              eq(studentEnrollments.schoolId, context.schoolId),
              eq(studentEnrollments.academicYearId, exam.academicYearId),
              eq(studentEnrollments.status, "enrolled"),
              branchId ? eq(students.branchId, branchId) : undefined,
            )),
          tx.select({ id: examMarks.enrollmentId }).from(examMarks).where(and(
            eq(examMarks.schoolId, context.schoolId),
            eq(examMarks.examSubjectId, subject.id),
          )),
        ]);
        if (expectedRoster.length !== existingRoster.length ||
          expectedRoster.some((enrollment) => !existingRoster.some((existing) => existing.id === enrollment.id))) {
          return "branch-roster" as const;
        }
      }
    }
    const subjectIds = subjectRows.map((subject) => subject.id);
    const currentComponents = await tx.select({
      examSubjectId: examComponents.examSubjectId,
      title: examComponents.title,
      maxMarks: examComponents.maxMarks,
      sortOrder: examComponents.sortOrder,
    }).from(examComponents).where(and(
      eq(examComponents.schoolId, context.schoolId),
      inArray(examComponents.examSubjectId, subjectIds),
    )).orderBy(asc(examComponents.examSubjectId), asc(examComponents.sortOrder));
    const currentBySubject = new Map<number, typeof currentComponents>();
    for (const component of currentComponents) {
      const rows = currentBySubject.get(component.examSubjectId) ?? [];
      rows.push(component);
      currentBySubject.set(component.examSubjectId, rows);
    }
    const distributionsChanged = subjectRows.some((subject) =>
      JSON.stringify((currentBySubject.get(subject.id) ?? []).map((component) => ({
        title: component.title,
        maxMarks: Number(component.maxMarks),
      }))) !== componentPayload,
    );
    if (distributionsChanged) {
      const currentMarks = await tx.select({
        id: examMarks.id,
        examSubjectId: examMarks.examSubjectId,
        marks: examMarks.marks,
      }).from(examMarks).where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(examMarks.examSubjectId, subjectIds),
      ));
      if (currentMarks.some((mark) => mark.marks !== null)) return "has-marks" as const;
      const markIds = currentMarks.map((mark) => mark.id);
      if (markIds.length) {
        const [componentMarks, markHistory, corrections] = await Promise.all([
          tx.select({ marks: examComponentMarks.marks }).from(examComponentMarks).where(and(
            eq(examComponentMarks.schoolId, context.schoolId),
            inArray(examComponentMarks.examMarkId, markIds),
          )),
          tx.select({ id: examMarkAudits.id }).from(examMarkAudits).where(and(
            eq(examMarkAudits.schoolId, context.schoolId),
            inArray(examMarkAudits.examMarkId, markIds),
          )),
          tx.select({ id: examMarkCorrections.id }).from(examMarkCorrections).where(and(
            eq(examMarkCorrections.schoolId, context.schoolId),
            inArray(examMarkCorrections.examMarkId, markIds),
          )),
        ]);
        if (componentMarks.some((mark) => mark.marks !== null) || markHistory.length || corrections.length) {
          return "has-marks" as const;
        }
      }
      for (const subjectId of subjectIds) {
        await tx.delete(examComponents).where(and(
          eq(examComponents.schoolId, context.schoolId),
          eq(examComponents.examSubjectId, subjectId),
        ));
        const createdComponents = await tx.insert(examComponents).values(componentDefinitions.map((component, sortOrder) => ({
          publicId: randomUUID(),
          schoolId: context.schoolId,
          examSubjectId: subjectId,
          title: component.title,
          maxMarks: component.maxMarks.toFixed(2),
          sortOrder,
        }))).$returningId();
        await tx.update(examSubjects).set({ maxMarks: totalMaxMarks.toFixed(2) }).where(and(
          eq(examSubjects.id, subjectId),
          eq(examSubjects.schoolId, context.schoolId),
        ));
        const subjectMarks = currentMarks.filter((mark) => mark.examSubjectId === subjectId);
        if (subjectMarks.length) {
          await tx.insert(examComponentMarks).values(subjectMarks.flatMap((mark) =>
              createdComponents.map((component) => ({
                publicId: randomUUID(),
                schoolId: context.schoolId,
                examMarkId: mark.id,
                examComponentId: component.id,
                marks: null,
                updatedBy: context.user.id,
              })),
            ));
        }
      }
    }
    const changedFields = [
      ...(exam.name === parsed.data.name ? [] : ["name"]),
      ...(exam.branchId === branchId ? [] : ["branchId"]),
      ...(exam.examSystem === parsed.data.examSystem ? [] : ["examSystem"]),
      ...(exam.startDate === parsed.data.startDate ? [] : ["startDate"]),
      ...(exam.endDate === parsed.data.endDate ? [] : ["endDate"]),
      ...(distributionsChanged ? ["markDistributions"] : []),
    ];
    await tx.update(examinations).set({
      name: parsed.data.name,
      branchId,
      examSystem: parsed.data.examSystem,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    }).where(and(eq(examinations.id, exam.id), eq(examinations.schoolId, context.schoolId)));
    if (changedFields.length) {
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "examination.updated",
        resourceType: "examination",
        resourcePublicId: exam.publicId,
        changedFields,
      });
    }
    return exam.id;
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "duplicate" as const;
    throw error;
  });
  if (outcome === "missing") return { error: "This examination no longer exists." };
  if (outcome === "locked") return { error: "Only open examinations with draft assessments can be edited." };
  if (outcome === "invalid-dates") return { error: "Examination dates must remain within the academic year and term." };
  if (outcome === "duplicate") return { error: "An examination with that name already exists in this academic year." };
  if (outcome === "branch-classes") return { error: "The selected branch must match the classes already assigned to this examination." };
  if (outcome === "branch-roster") return { error: "The branch cannot be changed because it would change the student roster for this examination." };
  if (outcome === "has-marks") return { error: "Mark distributions cannot be changed after marks or mark history has been recorded." };
  revalidatePath("/admin/examinations");
  revalidatePath(`/admin/examinations/${outcome}`);
  return { success: true };
}

export async function deleteExamination(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.delete");
  const parsedId = idField.safeParse(value(formData, "examinationId"));
  if (!parsedId.success) return { error: "Choose a valid examination to delete." };
  const outcome = await db.transaction(async (tx) => {
    const [exam] = await tx.select({
      id: examinations.id,
      publicId: examinations.publicId,
      status: examinations.status,
    }).from(examinations).where(and(
      eq(examinations.id, parsedId.data),
      eq(examinations.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!exam) return "missing" as const;
    if (exam.status !== "open") return "locked" as const;
    const subjectRows = await tx.select({
      id: examSubjects.id,
      status: examSubjects.status,
    }).from(examSubjects).innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    )).where(and(
      eq(examClasses.examinationId, exam.id),
      eq(examSubjects.schoolId, context.schoolId),
    ));
    if (!subjectRows.length || subjectRows.some((subject) => subject.status !== "draft")) return "locked" as const;
    const subjectIds = subjectRows.map((subject) => subject.id);
    const [marks, attendance] = await Promise.all([
      tx.select({ id: examMarks.id, marks: examMarks.marks }).from(examMarks).where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(examMarks.examSubjectId, subjectIds),
      )),
      tx.select({ id: examAttendance.id }).from(examAttendance).where(and(
        eq(examAttendance.schoolId, context.schoolId),
        inArray(examAttendance.examSubjectId, subjectIds),
      )),
    ]);
    if (marks.some((mark) => mark.marks !== null) || attendance.length) return "has-data" as const;
    const markIds = marks.map((mark) => mark.id);
    if (markIds.length) {
      const [componentMarks, markHistory, corrections] = await Promise.all([
        tx.select({ marks: examComponentMarks.marks }).from(examComponentMarks).where(and(
          eq(examComponentMarks.schoolId, context.schoolId),
          inArray(examComponentMarks.examMarkId, markIds),
        )),
        tx.select({ id: examMarkAudits.id }).from(examMarkAudits).where(and(
          eq(examMarkAudits.schoolId, context.schoolId),
          inArray(examMarkAudits.examMarkId, markIds),
        )),
        tx.select({ id: examMarkCorrections.id }).from(examMarkCorrections).where(and(
          eq(examMarkCorrections.schoolId, context.schoolId),
          inArray(examMarkCorrections.examMarkId, markIds),
        )),
      ]);
      if (componentMarks.some((mark) => mark.marks !== null) || markHistory.length || corrections.length) {
        return "has-data" as const;
      }
    }
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.deleted",
      resourceType: "examination",
      resourcePublicId: exam.publicId,
      changedFields: ["deleted"],
    });
    await tx.delete(examinations).where(and(
      eq(examinations.id, exam.id),
      eq(examinations.schoolId, context.schoolId),
    ));
    return exam.id;
  });
  if (outcome === "missing") return { error: "This examination no longer exists." };
  if (outcome === "locked") return { error: "Only open examinations with draft assessments and no submitted results can be deleted." };
  if (outcome === "has-data") return { error: "This examination has marks, attendance, or audit history. It cannot be deleted." };
  revalidatePath("/admin/examinations");
  return { success: true };
}

export async function updateExamSubjectSettings(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.create");
  const parsed = z.object({
    examSubjectId: idField,
    examDate: z.string().refine(isCalendarDate),
    weight: numericField.pipe(z.number().positive().max(9999)),
  }).safeParse({
    examSubjectId: value(formData, "examSubjectId"),
    examDate: value(formData, "examDate"),
    weight: value(formData, "weight"),
  });
  if (!parsed.success) return { error: "Enter a valid exam date and positive assessment weight." };
  const outcome = await db.transaction(async (tx) => {
    const [record] = await tx.select({
      id: examSubjects.id,
      publicId: examSubjects.publicId,
      status: examSubjects.status,
      examinationId: examinations.id,
      examinationStatus: examinations.status,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .where(and(eq(examSubjects.id, parsed.data.examSubjectId), eq(examSubjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!record || record.status !== "draft" || record.examinationStatus !== "open") return "locked" as const;
    if (parsed.data.examDate < record.startDate || parsed.data.examDate > record.endDate) return "date-range" as const;
    await tx.update(examSubjects).set({
      examDate: parsed.data.examDate,
      weight: parsed.data.weight.toFixed(2),
    }).where(and(eq(examSubjects.id, record.id), eq(examSubjects.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.subject.settings_updated",
      resourceType: "exam_subject",
      resourcePublicId: record.publicId,
      changedFields: ["examDate", "weight"],
    });
    return record.examinationId;
  });
  if (outcome === "locked") return { error: "Only draft assessments in an open examination can be configured." };
  if (outcome === "date-range") return { error: "The subject exam date must fall within the examination date range." };
  revalidatePath(`/admin/examinations/${outcome}`);
  return { success: true };
}

export async function saveExamMarks(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission(["examinations.create", "results.enter"]);
  const examSubjectId = idField.safeParse(value(formData, "examSubjectId"));
  if (!examSubjectId.success) return { error: "Choose a valid exam subject." };
  const [record] = await db.select({
    id: examSubjects.id,
    status: examSubjects.status,
    maxMarks: examSubjects.maxMarks,
    examinationId: examinations.id,
    examinationStatus: examinations.status,
  }).from(examSubjects).innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
    .innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
    .where(and(eq(examSubjects.id, examSubjectId.data), eq(examSubjects.schoolId, context.schoolId)))
    .limit(1);
  if (!record || record.examinationStatus !== "open" || record.status !== "draft") {
    return { error: "Marks can only be edited while this subject is in draft and the examination is open." };
  }
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage) {
    const assignment = await assignedSubject(record.id, context.schoolId, context.user.id);
    if (!assignment) return { error: "You can only enter marks for your assigned subjects." };
  }
  const currentMarks = await db.select({
    id: examMarks.id,
    enrollmentId: examMarks.enrollmentId,
    marks: examMarks.marks,
  }).from(examMarks).where(and(
    eq(examMarks.schoolId, context.schoolId),
    eq(examMarks.examSubjectId, record.id),
  ));
  const componentDefinitions = await db.select({
    id: examComponents.id,
    title: examComponents.title,
    maxMarks: examComponents.maxMarks,
  }).from(examComponents).where(and(
    eq(examComponents.schoolId, context.schoolId),
    eq(examComponents.examSubjectId, record.id),
  )).orderBy(asc(examComponents.sortOrder));
  if (!componentDefinitions.length) return { error: "This assessment has no mark components; ask an administrator to repair its setup." };
  if (!currentMarks.length) return { error: "This assessment has no enrolled students on its roster." };
  const componentById = new Map(componentDefinitions.map((component) => [component.id, component]));
  const componentRows = await db.select({
    id: examComponentMarks.id,
    examMarkId: examComponentMarks.examMarkId,
    examComponentId: examComponentMarks.examComponentId,
    marks: examComponentMarks.marks,
  }).from(examComponentMarks).where(and(
    eq(examComponentMarks.schoolId, context.schoolId),
    inArray(examComponentMarks.examMarkId, currentMarks.map((mark) => mark.id)),
  ));
  const componentRowByKey = new Map(componentRows.map((row) => [`${row.examMarkId}:${row.examComponentId}`, row]));
  const updates: Array<{
    markId: number;
    enrollmentId: number;
    marks: number | null;
    remark: string | null;
    components: Array<{ id: number; componentId: number; marks: number | null }>;
  }> = [];
  const markById = new Map(currentMarks.map((mark) => [String(mark.id), mark]));
  const seenComponentKeys = new Set<string>();
  const submittedComponentMarks = new Map<string, number | null>();
  for (const [fieldName, raw] of formData.entries()) {
    const match = /^component_(\d+)_(\d+)$/.exec(fieldName);
    if (!match || typeof raw !== "string") continue;
    const markId = Number(match[1]);
    const componentId = Number(match[2]);
    const existingMark = markById.get(String(markId));
    const existingComponent = componentById.get(componentId);
    const componentKey = `${markId}:${componentId}`;
    if (!existingMark || !existingComponent || seenComponentKeys.has(componentKey)) {
      return { error: "The submitted components do not match this assessment roster." };
    }
    seenComponentKeys.add(componentKey);
    const parsedMark = raw.trim() === "" ? null : numericField.safeParse(raw.trim());
    if (parsedMark !== null && !parsedMark.success) return { error: "Marks must be valid non-negative numbers." };
    const marks = parsedMark === null ? null : parsedMark.data;
    if (marks !== null && (marks < 0 || marks > Number(existingComponent.maxMarks))) {
      return { error: `Marks for ${existingComponent.title} must be between 0 and ${existingComponent.maxMarks}.` };
    }
    submittedComponentMarks.set(componentKey, marks);
  }
  const submittedMarkIds = completeSubmittedMarkIds(
    seenComponentKeys,
    currentMarks.map((mark) => mark.id),
    componentDefinitions.map((component) => component.id),
  );
  if (!submittedMarkIds) {
    return { error: "Submit every mark component for each student you are saving." };
  }
  if (submittedMarkIds.length === 0) {
    return { error: "Choose at least one student to save." };
  }
  const submittedMarkIdSet = new Set(submittedMarkIds);
  for (const mark of currentMarks.filter((currentMark) => submittedMarkIdSet.has(currentMark.id))) {
    const components = componentDefinitions.map((component) => {
      const current = componentRowByKey.get(`${mark.id}:${component.id}`);
      const componentKey = `${mark.id}:${component.id}`;
      if (!current || !submittedComponentMarks.has(componentKey)) return null;
      return {
        id: current.id,
        componentId: component.id,
        maxMarks: Number(component.maxMarks),
        marks: submittedComponentMarks.get(componentKey) ?? null,
      };
    });
    if (components.some((component) => component === null)) {
      return { error: "A component value or roster entry is invalid. Reload this assessment and try again." };
    }
    const componentUpdates = components.filter((component) => component !== null);
    const total = calculateComponentTotal(componentUpdates.map((component) => ({
      marks: component.marks,
      maxMarks: component.maxMarks,
    })));
    const rawRemark = formData.get(`remark_${mark.enrollmentId}`);
    const remark = typeof rawRemark === "string" ? rawRemark.trim() : "";
    if (remark.length > 1000) return { error: "Teacher remarks must be 1,000 characters or fewer." };
    updates.push({
      markId: mark.id,
      enrollmentId: mark.enrollmentId,
      marks: total?.marks ?? null,
      remark: remark || null,
      components: componentUpdates,
    });
  }
  if (updates.length !== submittedMarkIds.length) return { error: "A student or component value is invalid. Reload this assessment and try again." };

  const saveOutcome = await db.transaction(async (tx) => {
    const [lockedSubject] = await tx.select({
      id: examSubjects.id,
      status: examSubjects.status,
      maxMarks: examSubjects.maxMarks,
      examinationId: examinations.id,
      examinationStatus: examinations.status,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .where(and(eq(examSubjects.id, record.id), eq(examSubjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!lockedSubject || lockedSubject.status !== "draft" || lockedSubject.examinationStatus !== "open") {
      return "locked" as const;
    }
    const lockedMarks = await tx.select({
      id: examMarks.id,
      enrollmentId: examMarks.enrollmentId,
      marks: examMarks.marks,
    }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      eq(examMarks.examSubjectId, record.id),
    )).for("update");
    const lockedComponents = await tx.select({
      id: examComponentMarks.id,
      examMarkId: examComponentMarks.examMarkId,
      examComponentId: examComponentMarks.examComponentId,
      marks: examComponentMarks.marks,
    }).from(examComponentMarks).where(and(
      eq(examComponentMarks.schoolId, context.schoolId),
      inArray(examComponentMarks.examMarkId, lockedMarks.map((mark) => mark.id)),
    )).for("update");
    if (
      lockedMarks.length !== currentMarks.length ||
      updates.some((update) => !lockedMarks.some((mark) => mark.id === update.markId && mark.enrollmentId === update.enrollmentId))
    ) {
      return "roster-changed" as const;
    }
    if (lockedComponents.length !== currentMarks.length * componentDefinitions.length ||
      updates.some((update) => update.components.some((component) =>
        !lockedComponents.some((row) => row.id === component.id && row.examMarkId === update.markId && row.examComponentId === component.componentId),
      ))) {
      return "roster-changed" as const;
    }
    if (updates.some((update) => update.marks !== null && update.marks > Number(lockedSubject.maxMarks))) {
      return "invalid-mark" as const;
    }
    for (const update of updates) {
      const previous = lockedMarks.find((mark) => mark.id === update.markId)?.marks ?? null;
      for (const component of update.components) {
        const previousComponent = lockedComponents.find((row) => row.id === component.id)?.marks ?? null;
        await tx.update(examComponentMarks).set({
          marks: component.marks === null ? null : component.marks.toFixed(2),
          updatedBy: context.user.id,
        }).where(and(
          eq(examComponentMarks.id, component.id),
          eq(examComponentMarks.schoolId, context.schoolId),
        ));
        if (String(previousComponent ?? "") !== String(component.marks ?? "")) {
          await tx.insert(examMarkAudits).values({
            schoolId: context.schoolId,
            examMarkId: update.markId,
            examComponentId: component.componentId,
            previousMarks: previousComponent,
            updatedMarks: component.marks === null ? null : component.marks.toFixed(2),
            action: "component_marks_saved",
            actorUserId: context.user.id,
          });
        }
      }
      await tx.update(examMarks).set({
        marks: update.marks === null ? null : update.marks.toFixed(2),
        teacherRemark: update.remark,
        updatedBy: context.user.id,
      }).where(and(eq(examMarks.id, update.markId), eq(examMarks.schoolId, context.schoolId)));
      if (String(previous ?? "") !== String(update.marks ?? "")) {
        await tx.insert(examMarkAudits).values({
          schoolId: context.schoolId,
          examMarkId: update.markId,
          examComponentId: null,
          previousMarks: previous,
          updatedMarks: update.marks === null ? null : update.marks.toFixed(2),
          action: "marks_saved",
          actorUserId: context.user.id,
        });
      }
    }
    return "saved" as const;
  });
  if (saveOutcome === "locked") return { error: "This assessment was submitted or published while you were editing. Reload before continuing." };
  if (saveOutcome === "roster-changed") return { error: "The assessment roster changed while you were editing. Reload before continuing." };
  if (saveOutcome === "invalid-mark") return { error: "A mark exceeds the current assessment maximum." };
  revalidatePath(`/admin/examinations/${record.examinationId}`);
  return { success: true };
}

export async function saveExamAttendance(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission(["examinations.create", "results.enter"]);
  const subjectId = idField.safeParse(value(formData, "examSubjectId"));
  if (!subjectId.success) return { error: "Choose a valid exam subject." };
  const [subject] = await db.select({
    id: examSubjects.id,
    publicId: examSubjects.publicId,
    examClassId: examClasses.id,
    examId: examinations.id,
    examStatus: examinations.status,
  }).from(examSubjects)
    .innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    ))
    .innerJoin(examinations, and(
      eq(examinations.id, examClasses.examinationId),
      eq(examinations.schoolId, context.schoolId),
    ))
    .where(and(eq(examSubjects.id, subjectId.data), eq(examSubjects.schoolId, context.schoolId)))
    .limit(1);
  if (!subject || subject.examStatus !== "open") {
    return { error: "Exam attendance can only be changed before results are published." };
  }
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage && !(await assignedSubject(subject.id, context.schoolId, context.user.id))) {
    return { error: "You can only mark attendance for your assigned subjects." };
  }
  const roster = await db.select({ enrollmentId: examMarks.enrollmentId }).from(examMarks)
    .where(and(eq(examMarks.schoolId, context.schoolId), eq(examMarks.examSubjectId, subject.id)));
  if (!roster.length) return { error: "There are no enrolled students on this exam roster." };
  const statuses = new Map<number, { status: "present" | "absent" | "late" | "excused"; note: string | null }>();
  for (const enrollment of roster) {
    const rawStatus = value(formData, `attendance_${enrollment.enrollmentId}`);
    const result = z.enum(["present", "absent", "late", "excused"]).safeParse(rawStatus);
    if (!result.success) return { error: "Choose an attendance status for every student in the roster." };
    const rawNote = value(formData, `note_${enrollment.enrollmentId}`).trim();
    if (rawNote.length > 500) return { error: "Attendance notes must be 500 characters or fewer." };
    statuses.set(enrollment.enrollmentId, { status: result.data, note: rawNote || null });
  }
  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.select({
      id: examSubjects.id,
      examStatus: examinations.status,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .where(and(eq(examSubjects.id, subject.id), eq(examSubjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!locked || locked.examStatus !== "open") return false;
    for (const [enrollmentId, attendance] of statuses) {
      await tx.insert(examAttendance).values({
        publicId: randomUUID(),
        schoolId: context.schoolId,
        examSubjectId: subject.id,
        enrollmentId,
        status: attendance.status,
        note: attendance.note,
        updatedBy: context.user.id,
      }).onDuplicateKeyUpdate({
        set: {
          status: attendance.status,
          note: attendance.note,
          updatedBy: context.user.id,
          updatedAt: new Date(),
        },
      });
    }
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.attendance.saved",
      resourceType: "exam_subject",
      resourcePublicId: subject.publicId,
      changedFields: ["attendance"],
    });
    return true;
  });
  if (!outcome) return { error: "Results were published while you were marking attendance. Reload the page." };
  revalidatePath(`/admin/examinations/${subject.examId}/attendance/${subject.id}`);
  revalidatePath(`/admin/examinations/${subject.examId}`);
  return { success: true };
}

export async function submitExamSubject(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission(["examinations.create", "results.enter"]);
  const subjectId = idField.safeParse(value(formData, "examSubjectId"));
  if (!subjectId.success) return { error: "Choose a valid exam subject." };
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage && !(await assignedSubject(subjectId.data, context.schoolId, context.user.id))) {
    return { error: "You can only submit marks for your assigned subjects." };
  }
  const outcome = await db.transaction(async (tx) => {
    const [record] = await tx.select({
      id: examSubjects.id,
      status: examSubjects.status,
      publicId: examSubjects.publicId,
      examinationId: examinations.id,
      examinationStatus: examinations.status,
      maxMarks: examSubjects.maxMarks,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .where(and(eq(examSubjects.id, subjectId.data), eq(examSubjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!record || record.status !== "draft" || record.examinationStatus !== "open") return "locked" as const;
    const marks = await tx.select({ marks: examMarks.marks }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      eq(examMarks.examSubjectId, record.id),
    )).for("update");
    if (!marks.length || marks.some((mark) => mark.marks === null || Number(mark.marks) > Number(record.maxMarks))) {
      return "invalid-marks" as const;
    }
    await tx.update(examSubjects).set({
      status: "submitted",
      submittedBy: context.user.id,
      submittedAt: new Date(),
      reviewNote: null,
    }).where(and(eq(examSubjects.id, record.id), eq(examSubjects.status, "draft")));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.subject.submitted",
      resourceType: "exam_subject",
      resourcePublicId: record.publicId,
      changedFields: ["status", "submittedBy"],
    });
    return record.examinationId;
  });
  if (outcome === "locked") return { error: "Only draft assessments in an open examination can be submitted." };
  if (outcome === "invalid-marks") return { error: "Enter valid marks for every enrolled student before submitting." };
  revalidatePath(`/admin/examinations/${outcome}`);
  return { success: true };
}

export async function reviewExamSubject(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("results.publish");
  const parsed = z.object({
    examSubjectId: idField,
    decision: z.enum(["approve", "return"]),
    reviewNote: z.string().trim().max(1000),
  }).safeParse({
    examSubjectId: value(formData, "examSubjectId"),
    decision: value(formData, "decision"),
    reviewNote: value(formData, "reviewNote"),
  });
  if (!parsed.success || (parsed.data.decision === "return" && !parsed.data.reviewNote)) {
    return { error: "Choose approve or return; a return must include a note for the teacher." };
  }
  const nextStatus = parsed.data.decision === "approve" ? "approved" : "draft";
  const outcome = await db.transaction(async (tx) => {
    const [record] = await tx.select({
      id: examSubjects.id,
      status: examSubjects.status,
      publicId: examSubjects.publicId,
      examinationId: examinations.id,
      examinationStatus: examinations.status,
      maxMarks: examSubjects.maxMarks,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .where(and(eq(examSubjects.id, parsed.data.examSubjectId), eq(examSubjects.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!record || record.status !== "submitted" || record.examinationStatus !== "open") return "locked" as const;
    const markRows = await tx.select({ marks: examMarks.marks }).from(examMarks)
      .where(and(eq(examMarks.schoolId, context.schoolId), eq(examMarks.examSubjectId, record.id)))
      .for("update");
    if (!markRows.length || markRows.some((mark) => mark.marks === null || Number(mark.marks) > Number(record.maxMarks))) {
      return "invalid-marks" as const;
    }
    await tx.update(examSubjects).set({
      status: nextStatus,
      reviewedBy: context.user.id,
      reviewedAt: new Date(),
      reviewNote: parsed.data.reviewNote || null,
    }).where(and(eq(examSubjects.id, record.id), eq(examSubjects.status, "submitted")));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: `examination.subject.${nextStatus}`,
      resourceType: "exam_subject",
      resourcePublicId: record.publicId,
      changedFields: ["status", "reviewNote"],
    });
    return record.examinationId;
  });
  if (outcome === "locked") return { error: "Only submitted assessment results in an open examination can be reviewed." };
  if (outcome === "invalid-marks") return { error: "This assessment has incomplete or invalid marks and cannot be approved." };
  revalidatePath(`/admin/examinations/${outcome}`);
  return { success: true };
}

export async function publishExamination(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("results.publish");
  const examId = idField.safeParse(value(formData, "examinationId"));
  if (!examId.success) return { error: "Choose an examination." };
  const outcome = await db.transaction(async (tx) => {
    const [exam] = await tx.select({
      id: examinations.id,
      publicId: examinations.publicId,
      status: examinations.status,
    }).from(examinations).where(and(
      eq(examinations.id, examId.data),
      eq(examinations.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!exam || exam.status !== "open") return "locked" as const;
    const subjectsToPublish = await tx.select({
      id: examSubjects.id,
      status: examSubjects.status,
      maxMarks: examSubjects.maxMarks,
    }).from(examSubjects).innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    )).where(and(
      eq(examClasses.examinationId, exam.id),
      eq(examSubjects.schoolId, context.schoolId),
    )).orderBy(asc(examSubjects.id)).for("update");
    if (!subjectsToPublish.length || subjectsToPublish.some((subject) => subject.status !== "approved")) {
      return "incomplete" as const;
    }
    for (const subject of subjectsToPublish) {
      const marks = await tx.select({ marks: examMarks.marks }).from(examMarks).where(and(
        eq(examMarks.schoolId, context.schoolId),
        eq(examMarks.examSubjectId, subject.id),
      )).for("update");
      if (!marks.length || marks.some((mark) => mark.marks === null || Number(mark.marks) > Number(subject.maxMarks))) {
        return "invalid-marks" as const;
      }
    }
    await tx.update(examSubjects).set({ status: "published" })
      .where(and(inArray(examSubjects.id, subjectsToPublish.map((subject) => subject.id)), eq(examSubjects.schoolId, context.schoolId)));
    await tx.update(examinations).set({
      status: "published",
      publishedBy: context.user.id,
      publishedAt: new Date(),
    }).where(and(eq(examinations.id, exam.id), eq(examinations.schoolId, context.schoolId), eq(examinations.status, "open")));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.published",
      resourceType: "examination",
      resourcePublicId: exam.publicId,
      changedFields: ["status", "publishedBy", "publishedAt"],
    });
    return exam.id;
  });
  if (outcome === "locked") return { error: "This examination is already published or unavailable." };
  if (outcome === "incomplete") return { error: "Every class and subject must be submitted and approved before results can be published." };
  if (outcome === "invalid-marks") return { error: "Incomplete or out-of-range marks prevent publication. Review every class roster." };
  revalidatePath("/admin/examinations");
  revalidatePath(`/admin/examinations/${outcome}`);
  return { success: true };
}

export async function saveClassTeacherRemark(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission(["examinations.create", "results.enter"]);
  const parsed = z.object({
    examClassId: idField,
    enrollmentId: idField,
    remark: z.string().trim().max(1000),
  }).safeParse({
    examClassId: value(formData, "examClassId"),
    enrollmentId: value(formData, "enrollmentId"),
    remark: value(formData, "remark"),
  });
  if (!parsed.success) return { error: "Enter a class teacher remark of at most 1,000 characters." };
  const [row] = await db.select({
    examClassId: examClasses.id,
    examId: examinations.id,
    examStatus: examinations.status,
    sectionClassTeacherId: classSections.classTeacherId,
  }).from(examClasses).innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.academicYearId, examinations.academicYearId),
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.id, parsed.data.enrollmentId),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.classLevelId, examClasses.classLevelId),
      eq(classSections.academicYearId, examinations.academicYearId),
    ))
    .where(and(eq(examClasses.id, parsed.data.examClassId), eq(examClasses.schoolId, context.schoolId)))
    .limit(1);
  if (!row || row.examStatus !== "open") return { error: "Remarks can only be changed before results are published." };
  const canManage = context.grantedPermissions.includes("examinations.create");
  if (!canManage) {
    const teacher = await db.select({ id: teachers.id }).from(teachers)
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .where(and(
        eq(teachers.id, row.sectionClassTeacherId!),
        eq(teachers.schoolId, context.schoolId),
        eq(teachers.status, "active"),
      ))
      .limit(1);
    if (!teacher.length) return { error: "Only this class's assigned teacher or an examination administrator can edit class remarks." };
  }
  await db.insert(examStudentRemarks).values({
    schoolId: context.schoolId,
    examClassId: row.examClassId,
    enrollmentId: parsed.data.enrollmentId,
    classTeacherRemark: parsed.data.remark || null,
    updatedBy: context.user.id,
  }).onDuplicateKeyUpdate({
    set: { classTeacherRemark: parsed.data.remark || null, updatedBy: context.user.id, updatedAt: new Date() },
  });
  revalidatePath(`/admin/examinations/${row.examId}`);
  return { success: true };
}

export async function savePrincipalRemark(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("results.publish");
  const parsed = z.object({
    examClassId: idField,
    remark: z.string().trim().max(1000),
  }).safeParse({
    examClassId: value(formData, "examClassId"),
    remark: value(formData, "remark"),
  });
  if (!parsed.success) return { error: "Enter a principal remark of at most 1,000 characters." };
  const [examClass] = await db.select({
    id: examClasses.id,
    examId: examinations.id,
    examStatus: examinations.status,
  }).from(examClasses).innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
    .where(and(eq(examClasses.id, parsed.data.examClassId), eq(examClasses.schoolId, context.schoolId)))
    .limit(1);
  if (!examClass || examClass.examStatus !== "open") return { error: "Principal remarks can only be changed before publication." };
  await db.update(examClasses).set({ principalRemark: parsed.data.remark || null })
    .where(and(eq(examClasses.id, examClass.id), eq(examClasses.schoolId, context.schoolId)));
  revalidatePath(`/admin/examinations/${examClass.examId}`);
  return { success: true };
}

export async function requestMarkCorrection(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("results.enter");
  const parsed = z.object({
    examMarkId: idField,
    requestedMarks: numericField.pipe(z.number().nonnegative().max(999999)),
    reason: text(1000),
  }).safeParse({
    examMarkId: value(formData, "examMarkId"),
    requestedMarks: value(formData, "requestedMarks"),
    reason: value(formData, "reason"),
  });
  if (!parsed.success) return { error: "Provide a valid correction mark and a reason." };
  const [mark] = await db.select({
    id: examMarks.id,
    marks: examMarks.marks,
    maxMarks: examSubjects.maxMarks,
    examSubjectId: examSubjects.id,
    examId: examinations.id,
    status: examinations.status,
    publicId: examMarks.publicId,
  }).from(examMarks).innerJoin(examSubjects, eq(examSubjects.id, examMarks.examSubjectId))
    .innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
    .innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
    .where(and(eq(examMarks.id, parsed.data.examMarkId), eq(examMarks.schoolId, context.schoolId)))
    .limit(1);
  if (!mark || mark.status !== "published" || mark.marks === null) return { error: "Corrections are only available for published marks." };
  if (parsed.data.requestedMarks > Number(mark.maxMarks)) return { error: `Marks cannot exceed ${mark.maxMarks}.` };
  if (!(await assignedSubject(mark.examSubjectId, context.schoolId, context.user.id))) {
    return { error: "Only the assigned subject teacher may request this correction." };
  }
  const pending = await db.select({ id: examMarkCorrections.id }).from(examMarkCorrections)
    .where(and(eq(examMarkCorrections.schoolId, context.schoolId), eq(examMarkCorrections.examMarkId, mark.id), eq(examMarkCorrections.status, "pending")))
    .limit(1);
  if (pending.length) return { error: "A correction request is already awaiting review for this mark." };
  await db.insert(examMarkCorrections).values({
    publicId: randomUUID(),
    schoolId: context.schoolId,
    examMarkId: mark.id,
    previousMarks: mark.marks,
    requestedMarks: parsed.data.requestedMarks.toFixed(2),
    reason: parsed.data.reason,
    requestedBy: context.user.id,
  });
  revalidatePath(`/admin/examinations/${mark.examId}`);
  return { success: true };
}

export async function reviewMarkCorrection(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("results.publish");
  const parsed = z.object({
    correctionId: idField,
    decision: z.enum(["approve", "reject"]),
    reviewNote: z.string().trim().max(1000),
  }).safeParse({
    correctionId: value(formData, "correctionId"),
    decision: value(formData, "decision"),
    reviewNote: value(formData, "reviewNote"),
  });
  if (!parsed.success) return { error: "Choose whether to approve or reject the correction." };
  const outcome = await db.transaction(async (tx) => {
    const [correction] = await tx.select({
      id: examMarkCorrections.id,
      examMarkId: examMarkCorrections.examMarkId,
      previousMarks: examMarkCorrections.previousMarks,
      requestedMarks: examMarkCorrections.requestedMarks,
      reason: examMarkCorrections.reason,
      publicId: examMarkCorrections.publicId,
      examSubjectId: examSubjects.id,
      examId: examinations.id,
      examStatus: examinations.status,
    }).from(examMarkCorrections)
      .innerJoin(examMarks, eq(examMarks.id, examMarkCorrections.examMarkId))
      .innerJoin(examSubjects, eq(examSubjects.id, examMarks.examSubjectId))
      .innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
      .innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
      .where(and(
        eq(examMarkCorrections.id, parsed.data.correctionId),
        eq(examMarkCorrections.schoolId, context.schoolId),
        eq(examMarkCorrections.status, "pending"),
      ))
      .for("update")
      .limit(1);
    if (!correction || correction.examStatus !== "published") return null;
    const [mark] = await tx.select({ id: examMarks.id, marks: examMarks.marks }).from(examMarks)
      .where(and(eq(examMarks.id, correction.examMarkId), eq(examMarks.schoolId, context.schoolId)))
      .for("update")
      .limit(1);
    if (!mark || mark.marks !== correction.previousMarks) return null;
    if (parsed.data.decision === "approve") {
      await tx.update(examMarks).set({
        marks: correction.requestedMarks,
        updatedBy: context.user.id,
      }).where(and(eq(examMarks.id, mark.id), eq(examMarks.schoolId, context.schoolId)));
      await tx.insert(examMarkAudits).values({
        schoolId: context.schoolId,
        examMarkId: mark.id,
        previousMarks: correction.previousMarks,
        updatedMarks: correction.requestedMarks,
        action: "approved_correction",
        reason: correction.reason,
        actorUserId: context.user.id,
      });
    }
    await tx.update(examMarkCorrections).set({
      status: parsed.data.decision === "approve" ? "approved" : "rejected",
      reviewedBy: context.user.id,
      reviewedAt: new Date(),
      reviewNote: parsed.data.reviewNote || null,
    }).where(and(
      eq(examMarkCorrections.id, correction.id),
      eq(examMarkCorrections.schoolId, context.schoolId),
      eq(examMarkCorrections.status, "pending"),
    ));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: parsed.data.decision === "approve"
        ? "examination.mark_correction.approved"
        : "examination.mark_correction.rejected",
      resourceType: "exam_mark_correction",
      resourcePublicId: correction.publicId,
      changedFields: ["status", "marks", "reviewNote"],
    });
    return correction.examId;
  });
  if (outcome === null) return { error: "The correction is no longer pending or its published mark has changed." };
  revalidatePath(`/admin/examinations/${outcome}`);
  return { success: true };
}

export async function saveClassTeacherRemarkDirect(
  examClassId: number,
  enrollmentId: number,
  remark: string,
): Promise<ExaminationActionState> {
  const formData = new FormData();
  formData.set("examClassId", String(examClassId));
  formData.set("enrollmentId", String(enrollmentId));
  formData.set("remark", remark);
  return saveClassTeacherRemark({}, formData);
}
