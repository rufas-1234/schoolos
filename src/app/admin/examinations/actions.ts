"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  auditLogs,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examGradeBands,
  examGradingScales,
  examMarkAudits,
  examMarkCorrections,
  examMarks,
  examStudentRemarks,
  examSubjects,
  examinations,
  staffMembers,
  studentEnrollments,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate, isValidDateRange } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { validateGradeBands, type GradeBand } from "@/lib/examination-policy";

export type ExaminationActionState = { error?: string; success?: boolean };
const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const numericField = z.string().trim().regex(/^\d{1,6}(\.\d{1,2})?$/).transform(Number);
const text = (max: number) => z.string().trim().min(1).max(max);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

async function writeAudit(
  context: Awaited<ReturnType<typeof requireSchoolPermission>>,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await db.insert(auditLogs).values({
    schoolId: context.schoolId,
    actorUserId: context.user.id,
    action,
    resourceType,
    resourcePublicId,
    changedFields,
  });
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

export async function createExamination(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("examinations.create");
  const classValues = formData.getAll("classLevelIds");
  const parsed = z.object({
    name: text(120),
    academicYearId: idField,
    academicTermId: z.union([z.literal(""), idField]),
    gradingScaleId: idField,
    startDate: z.string().refine(isCalendarDate),
    endDate: z.string().refine(isCalendarDate),
    classLevelIds: z.array(idField).min(1),
  }).safeParse({
    name: value(formData, "name"),
    academicYearId: value(formData, "academicYearId"),
    academicTermId: value(formData, "academicTermId"),
    gradingScaleId: value(formData, "gradingScaleId"),
    startDate: value(formData, "startDate"),
    endDate: value(formData, "endDate"),
    classLevelIds: classValues,
  });
  if (!parsed.success || !isValidDateRange(value(formData, "startDate"), value(formData, "endDate"))) {
    return { error: "Enter a name, valid dates, academic year, grading scale, and at least one class." };
  }
  const classIds = [...new Set(parsed.data.classLevelIds)];
  const [year] = await db.select({
    id: academicYears.id,
    startDate: academicYears.startDate,
    endDate: academicYears.endDate,
  }).from(academicYears)
    .where(and(eq(academicYears.id, parsed.data.academicYearId), eq(academicYears.schoolId, context.schoolId))).limit(1);
  const [scale] = await db.select({ id: examGradingScales.id }).from(examGradingScales)
    .where(and(eq(examGradingScales.id, parsed.data.gradingScaleId), eq(examGradingScales.schoolId, context.schoolId))).limit(1);
  if (!year || !scale) return { error: "Choose an academic year and grading scale belonging to your school." };
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
  const classes = await db.select({ id: classLevels.id }).from(classLevels).where(and(
    eq(classLevels.schoolId, context.schoolId),
    inArray(classLevels.id, classIds),
    eq(classLevels.status, "active"),
  ));
  if (classes.length !== classIds.length) return { error: "Choose active classes belonging to your school." };

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
    const [exam] = await tx.insert(examinations).values({
      publicId: examPublicId,
      schoolId: context.schoolId,
      academicYearId: year.id,
      academicTermId: parsed.data.academicTermId || null,
      gradingScaleId: scale.id,
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
        maxMarks: "100",
        weight: "1",
        status: "draft",
      }))).$returningId();
      const enrollments = await tx.select({ id: studentEnrollments.id })
        .from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.classLevelId, classLevelId),
          eq(classSections.academicYearId, year.id),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, year.id),
          eq(studentEnrollments.status, "enrolled"),
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
      }
    }
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.created",
      resourceType: "examination",
      resourcePublicId: examPublicId,
      changedFields: ["name", "academicYearId", "academicTermId", "classes", "subjects", "dates"],
    });
  }).catch((error: unknown) => {
    if (isDuplicateEntryError(error)) return "duplicate" as const;
    throw error;
  });
  if (createOutcome === "duplicate") {
    return { error: "An examination with that name already exists in this academic year." };
  }
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
    maxMarks: numericField.pipe(z.number().positive().max(999999)),
    weight: numericField.pipe(z.number().positive().max(9999)),
  }).safeParse({
    examSubjectId: value(formData, "examSubjectId"),
    examDate: value(formData, "examDate"),
    maxMarks: value(formData, "maxMarks"),
    weight: value(formData, "weight"),
  });
  if (!parsed.success) return { error: "Enter a valid exam date, maximum marks, and positive assessment weight." };
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
    const existingMarks = await tx.select({ marks: examMarks.marks }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      eq(examMarks.examSubjectId, record.id),
    )).for("update");
    if (existingMarks.some((mark) => mark.marks !== null && Number(mark.marks) > parsed.data.maxMarks)) {
      return "max-marks" as const;
    }
    await tx.update(examSubjects).set({
      examDate: parsed.data.examDate,
      maxMarks: parsed.data.maxMarks.toFixed(2),
      weight: parsed.data.weight.toFixed(2),
    }).where(and(eq(examSubjects.id, record.id), eq(examSubjects.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "examination.subject.settings_updated",
      resourceType: "exam_subject",
      resourcePublicId: record.publicId,
      changedFields: ["examDate", "maxMarks", "weight"],
    });
    return record.examinationId;
  });
  if (outcome === "locked") return { error: "Only draft assessments in an open examination can be configured." };
  if (outcome === "date-range") return { error: "The subject exam date must fall within the examination date range." };
  if (outcome === "max-marks") return { error: "The maximum mark cannot be lowered below a mark already entered." };
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
  const markByEnrollment = new Map(currentMarks.map((mark) => [String(mark.enrollmentId), mark]));
  const updates: Array<{ markId: number; enrollmentId: number; marks: number | null; remark: string | null }> = [];
  const seenEnrollmentIds = new Set<number>();
  for (const [key, raw] of formData.entries()) {
    const match = /^marks_(\d+)$/.exec(key);
    if (!match || typeof raw !== "string") continue;
    const enrollmentId = Number(match[1]);
    if (seenEnrollmentIds.has(enrollmentId)) {
      return { error: "Each student can appear only once in the submitted roster." };
    }
    seenEnrollmentIds.add(enrollmentId);
    const existing = markByEnrollment.get(String(enrollmentId));
    if (!existing) return { error: "The submitted list contains a student outside this subject's examination roster." };
    const parsedMark = raw.trim() === "" ? null : numericField.safeParse(raw.trim());
    if (parsedMark !== null && !parsedMark.success) return { error: "Marks must be valid non-negative numbers." };
    const marks = parsedMark === null ? null : parsedMark.data;
    if (marks !== null && (marks < 0 || marks > Number(record.maxMarks))) {
      return { error: `Marks must be between 0 and ${record.maxMarks}.` };
    }
    const rawRemark = formData.get(`remark_${enrollmentId}`);
    const remark = typeof rawRemark === "string" ? rawRemark.trim() : "";
    if (remark.length > 1000) return { error: "Teacher remarks must be 1,000 characters or fewer." };
    updates.push({ markId: existing.id, enrollmentId, marks, remark: remark || null });
  }
  if (updates.length !== currentMarks.length) return { error: "Submit the complete student roster for this assessment." };

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
    if (
      lockedMarks.length !== updates.length ||
      updates.some((update) => !lockedMarks.some((mark) => mark.id === update.markId && mark.enrollmentId === update.enrollmentId))
    ) {
      return "roster-changed" as const;
    }
    if (updates.some((update) => update.marks !== null && update.marks > Number(lockedSubject.maxMarks))) {
      return "invalid-mark" as const;
    }
    for (const update of updates) {
      const previous = lockedMarks.find((mark) => mark.id === update.markId)?.marks ?? null;
      await tx.update(examMarks).set({
        marks: update.marks === null ? null : update.marks.toFixed(2),
        teacherRemark: update.remark,
        updatedBy: context.user.id,
      }).where(and(eq(examMarks.id, update.markId), eq(examMarks.schoolId, context.schoolId)));
      if (String(previous ?? "") !== String(update.marks ?? "")) {
        await tx.insert(examMarkAudits).values({
          schoolId: context.schoolId,
          examMarkId: update.markId,
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

export async function submitExamSubject(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission(["examinations.create", "results.enter"]);
  const subjectId = idField.safeParse(value(formData, "examSubjectId"));
  if (!subjectId.success) return { error: "Choose a valid exam subject." };
  const [record] = await db.select({
    id: examSubjects.id,
    status: examSubjects.status,
    examinationId: examinations.id,
    examinationStatus: examinations.status,
    maxMarks: examSubjects.maxMarks,
    publicId: examSubjects.publicId,
  }).from(examSubjects).innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
    .innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
    .where(and(eq(examSubjects.id, subjectId.data), eq(examSubjects.schoolId, context.schoolId)))
    .limit(1);
  if (!record || record.status !== "draft" || record.examinationStatus !== "open") {
    return { error: "Only draft assessments in an open examination can be submitted." };
  }
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage && !(await assignedSubject(record.id, context.schoolId, context.user.id))) {
    return { error: "You can only submit marks for your assigned subjects." };
  }
  const marks = await db.select({ marks: examMarks.marks }).from(examMarks).where(and(
    eq(examMarks.schoolId, context.schoolId),
    eq(examMarks.examSubjectId, record.id),
  ));
  if (!marks.length || marks.some((mark) => mark.marks === null || Number(mark.marks) > Number(record.maxMarks))) {
    return { error: "Enter valid marks for every enrolled student before submitting." };
  }
  await db.update(examSubjects).set({
    status: "submitted",
    submittedBy: context.user.id,
    submittedAt: new Date(),
    reviewNote: null,
  }).where(and(eq(examSubjects.id, record.id), eq(examSubjects.status, "draft")));
  await writeAudit(context, "examination.subject.submitted", "exam_subject", record.publicId, ["status", "submittedBy"]);
  revalidatePath(`/admin/examinations/${record.examinationId}`);
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
  const [record] = await db.select({
    id: examSubjects.id,
    status: examSubjects.status,
    publicId: examSubjects.publicId,
    examinationId: examinations.id,
    examinationStatus: examinations.status,
    maxMarks: examSubjects.maxMarks,
  }).from(examSubjects).innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
    .innerJoin(examinations, eq(examinations.id, examClasses.examinationId))
    .where(and(eq(examSubjects.id, parsed.data.examSubjectId), eq(examSubjects.schoolId, context.schoolId)))
    .limit(1);
  if (!record || record.status !== "submitted" || record.examinationStatus !== "open") {
    return { error: "Only submitted assessment results in an open examination can be reviewed." };
  }
  const markRows = await db.select({ marks: examMarks.marks }).from(examMarks)
    .where(and(eq(examMarks.schoolId, context.schoolId), eq(examMarks.examSubjectId, record.id)));
  if (!markRows.length || markRows.some((mark) => mark.marks === null || Number(mark.marks) > Number(record.maxMarks))) {
    return { error: "This assessment has incomplete or invalid marks and cannot be approved." };
  }
  const nextStatus = parsed.data.decision === "approve" ? "approved" : "draft";
  await db.update(examSubjects).set({
    status: nextStatus,
    reviewedBy: context.user.id,
    reviewedAt: new Date(),
    reviewNote: parsed.data.reviewNote || null,
  }).where(and(eq(examSubjects.id, record.id), eq(examSubjects.status, "submitted")));
  await writeAudit(context, `examination.subject.${nextStatus}`, "exam_subject", record.publicId, ["status", "reviewNote"]);
  revalidatePath(`/admin/examinations/${record.examinationId}`);
  return { success: true };
}

export async function publishExamination(
  _previousState: ExaminationActionState,
  formData: FormData,
): Promise<ExaminationActionState> {
  const context = await requireSchoolPermission("results.publish");
  const examId = idField.safeParse(value(formData, "examinationId"));
  if (!examId.success) return { error: "Choose an examination." };
  const [exam] = await db.select({
    id: examinations.id,
    publicId: examinations.publicId,
    status: examinations.status,
  }).from(examinations).where(and(
    eq(examinations.id, examId.data),
    eq(examinations.schoolId, context.schoolId),
  )).limit(1);
  if (!exam || exam.status !== "open") return { error: "This examination is already published or unavailable." };
  const subjectsToPublish = await db.select({
    id: examSubjects.id,
    status: examSubjects.status,
    maxMarks: examSubjects.maxMarks,
  }).from(examSubjects).innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
    .where(and(eq(examClasses.examinationId, exam.id), eq(examClasses.schoolId, context.schoolId)));
  if (!subjectsToPublish.length || subjectsToPublish.some((subject) => subject.status !== "approved")) {
    return { error: "Every class and subject must be submitted and approved before results can be published." };
  }
  for (const subject of subjectsToPublish) {
    const marks = await db.select({ marks: examMarks.marks }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      eq(examMarks.examSubjectId, subject.id),
    ));
    if (!marks.length || marks.some((mark) => mark.marks === null || Number(mark.marks) > Number(subject.maxMarks))) {
      return { error: "Incomplete or out-of-range marks prevent publication. Review every class roster." };
    }
  }
  await db.transaction(async (tx) => {
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
  });
  revalidatePath("/admin/examinations");
  revalidatePath(`/admin/examinations/${exam.id}`);
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
