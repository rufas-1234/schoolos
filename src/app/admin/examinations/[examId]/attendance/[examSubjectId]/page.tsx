import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  classLevels,
  classSections,
  classSubjects,
  examAttendance,
  examClasses,
  examSubjects,
  examinations,
  staffMembers,
  studentEnrollments,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { SaveExamAttendanceForm } from "../../../examination-forms";

export const dynamic = "force-dynamic";

export default async function ExamAttendancePage({
  params,
}: {
  params: Promise<{ examId: string; examSubjectId: string }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const { examId: rawExamId, examSubjectId: rawSubjectId } = await params;
  if (!/^\d+$/.test(rawExamId) || !/^\d+$/.test(rawSubjectId)) notFound();
  const examId = Number(rawExamId);
  const examSubjectId = Number(rawSubjectId);
  const [record] = await db.select({
    id: examSubjects.id,
    examId: examinations.id,
    examName: examinations.name,
    examStatus: examinations.status,
    subjectName: subjects.name,
    className: classLevels.name,
    classLevelId: classLevels.id,
    academicYearId: examinations.academicYearId,
    examDate: examSubjects.examDate,
  }).from(examSubjects)
    .innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    ))
    .innerJoin(examinations, and(
      eq(examinations.id, examClasses.examinationId),
      eq(examinations.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(classSubjects, and(
      eq(classSubjects.id, examSubjects.classSubjectId),
      eq(classSubjects.schoolId, context.schoolId),
    ))
    .innerJoin(subjects, and(
      eq(subjects.id, classSubjects.subjectId),
      eq(subjects.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examSubjects.id, examSubjectId),
      eq(examSubjects.schoolId, context.schoolId),
      eq(examinations.id, examId),
    ))
    .limit(1);
  if (!record) notFound();
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  let assignedTeacher = false;
  if (context.grantedPermissions.includes("results.enter")) {
    const [assignment] = await db.select({ id: examSubjects.id }).from(examSubjects)
      .innerJoin(classSubjects, and(
        eq(classSubjects.id, examSubjects.classSubjectId),
        eq(classSubjects.schoolId, context.schoolId),
      ))
      .innerJoin(teachers, and(
        eq(teachers.id, classSubjects.teacherId!),
        eq(teachers.schoolId, context.schoolId),
        eq(teachers.status, "active"),
      ))
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.status, "active"),
      ))
      .where(and(eq(examSubjects.id, record.id), eq(examSubjects.schoolId, context.schoolId)))
      .limit(1);
    assignedTeacher = Boolean(assignment);
  }
  if (!canManage && !assignedTeacher) notFound();
  const roster = await db.select({
    enrollmentId: studentEnrollments.id,
    name: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    status: examAttendance.status,
    note: examAttendance.note,
  }).from(studentEnrollments)
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.classLevelId, record.classLevelId),
      eq(classSections.academicYearId, record.academicYearId),
    ))
    .innerJoin(students, and(
      eq(students.id, studentEnrollments.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .leftJoin(examAttendance, and(
      eq(examAttendance.examSubjectId, record.id),
      eq(examAttendance.enrollmentId, studentEnrollments.id),
      eq(examAttendance.schoolId, context.schoolId),
    ))
    .where(and(
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.academicYearId, record.academicYearId),
      eq(studentEnrollments.status, "enrolled"),
      ne(students.status, "disabled"),
    ))
    .orderBy(asc(students.lastName), asc(students.firstName));
  const rosterStudents = roster.map((student) => ({
    enrollmentId: student.enrollmentId,
    name: `${student.name} ${student.lastName}`,
    admissionNumber: student.admissionNumber,
    status: student.status,
    note: student.note,
  }));
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <Link href="/admin/examinations?section=attendance" className="text-sm font-semibold text-violet-700">← Exam Attendance</Link>
        <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · {record.examDate}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{record.examName}</h1>
        <p className="mt-2 text-sm text-slate-600">{record.className} · {record.subjectName} · {rosterStudents.length} enrolled students</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <SaveExamAttendanceForm
          examSubjectId={record.id}
          students={rosterStudents}
          editable={record.examStatus === "open" && (canManage || assignedTeacher)}
        />
      </section>
    </main>
  );
}
