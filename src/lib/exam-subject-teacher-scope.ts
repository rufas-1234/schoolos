import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  classSectionSubjectTeachers,
  classSections,
  classSubjects,
  examClasses,
  examSubjects,
  examinations,
  staffMembers,
  teachers,
} from "@/db/schema";

export type ExamSubjectTeacherScope = { sectionIds: number[] | null };

export async function getExamSubjectTeacherSectionScope(
  examSubjectId: number,
  schoolId: number,
  userId: string,
): Promise<ExamSubjectTeacherScope | undefined> {
  const [classWideAssignment] = await db.select({ id: examSubjects.id })
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
    .where(and(
      eq(examSubjects.id, examSubjectId),
      eq(examSubjects.schoolId, schoolId),
    ))
    .limit(1);
  if (classWideAssignment) return { sectionIds: null };

  const sectionAssignments = await db.select({
    sectionId: classSections.id,
  }).from(classSectionSubjectTeachers)
    .innerJoin(examSubjects, and(
      eq(examSubjects.classSubjectId, classSectionSubjectTeachers.classSubjectId),
      eq(examSubjects.id, examSubjectId),
      eq(examSubjects.schoolId, schoolId),
    ))
    .innerJoin(classSubjects, and(
      eq(classSubjects.id, examSubjects.classSubjectId),
      eq(classSubjects.schoolId, schoolId),
    ))
    .innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, schoolId),
    ))
    .innerJoin(examinations, and(
      eq(examinations.id, examClasses.examinationId),
      eq(examinations.schoolId, schoolId),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, classSectionSubjectTeachers.classSectionId),
      eq(classSections.schoolId, schoolId),
      eq(classSections.classLevelId, examClasses.classLevelId),
      eq(classSections.academicYearId, examinations.academicYearId),
    ))
    .innerJoin(teachers, and(
      eq(teachers.id, classSectionSubjectTeachers.teacherId),
      eq(teachers.schoolId, schoolId),
      eq(teachers.status, "active"),
    ))
    .innerJoin(staffMembers, and(
      eq(staffMembers.id, teachers.staffMemberId!),
      eq(staffMembers.schoolId, schoolId),
      eq(staffMembers.linkedUserId, userId),
      eq(staffMembers.status, "active"),
    ))
    .where(eq(classSectionSubjectTeachers.schoolId, schoolId));
  const sectionIds = [...new Set(sectionAssignments.map((assignment) => assignment.sectionId))];
  return sectionIds.length ? { sectionIds } : undefined;
}
