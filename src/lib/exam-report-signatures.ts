import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { examTeacherSignatures, staffMembers, teachers } from "@/db/schema";

export type ExamSignatureRole = "Class teacher" | "Subject teacher";

export type ExamTeacherSignature = {
  teacherId: number;
  teacherName: string;
  jobTitle: string;
  role: ExamSignatureRole;
  signatureId: number | null;
};

export async function getExamTeacherSignatures(
  schoolId: number,
  assignments: Array<{ teacherId: number | null; role: ExamSignatureRole }>,
): Promise<ExamTeacherSignature[]> {
  const teacherIds = [...new Set(assignments.flatMap((assignment) =>
    assignment.teacherId === null ? [] : [assignment.teacherId],
  ))];
  if (!teacherIds.length) return [];

  const [teacherRows, signatureRows] = await Promise.all([
    db.select({
      id: teachers.id,
      firstName: teachers.firstName,
      lastName: teachers.lastName,
      jobTitle: staffMembers.jobTitle,
    }).from(teachers)
      .leftJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, schoolId),
      ))
      .where(and(
        eq(teachers.schoolId, schoolId),
        inArray(teachers.id, teacherIds),
      )),
    db.select({
      id: examTeacherSignatures.id,
      teacherId: examTeacherSignatures.teacherId,
    }).from(examTeacherSignatures)
      .where(and(
        eq(examTeacherSignatures.schoolId, schoolId),
        inArray(examTeacherSignatures.teacherId, teacherIds),
      ))
      .orderBy(desc(examTeacherSignatures.createdAt), desc(examTeacherSignatures.id)),
  ]);
  const teacherById = new Map(teacherRows.map((teacher) => [teacher.id, teacher]));
  const signatureIdByTeacher = new Map<number, number>();
  for (const signature of signatureRows) {
    if (!signatureIdByTeacher.has(signature.teacherId)) {
      signatureIdByTeacher.set(signature.teacherId, signature.id);
    }
  }

  const entries = new Map<string, ExamTeacherSignature>();
  for (const assignment of assignments) {
    if (assignment.teacherId === null) continue;
    const teacher = teacherById.get(assignment.teacherId);
    if (!teacher) continue;
    const key = `${assignment.role}:${teacher.id}`;
    if (entries.has(key)) continue;
    entries.set(key, {
      teacherId: teacher.id,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      jobTitle: teacher.jobTitle ?? "",
      role: assignment.role,
      signatureId: signatureIdByTeacher.get(teacher.id) ?? null,
    });
  }
  return [...entries.values()];
}
