import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  schoolBranches,
  studentElectiveSelections,
  studentEnrollments,
  students,
  subjects,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isElectiveSelectionStatus } from "@/lib/elective-selection-policy";
import { ElectiveSelectionForm } from "../../elective-selection-form";

export const dynamic = "force-dynamic";

export default async function ElectiveSelectionsPage({
  params,
}: {
  params: Promise<{ classSubjectId: string }>;
}) {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const { classSubjectId: rawClassSubjectId } = await params;
  if (!/^\d+$/.test(rawClassSubjectId)) notFound();
  const classSubjectId = Number(rawClassSubjectId);

  const [assignment] = await db.select({
    id: classSubjects.id,
    classLevelId: classSubjects.classLevelId,
    isCompulsory: classSubjects.isCompulsory,
    className: classLevels.name,
    branchName: schoolBranches.name,
    subjectName: subjects.name,
    subjectCode: subjects.code,
  }).from(classSubjects)
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSubjects.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
      eq(classLevels.status, "active"),
    ))
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .innerJoin(subjects, and(
      eq(subjects.id, classSubjects.subjectId),
      eq(subjects.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classSubjects.id, classSubjectId),
      eq(classSubjects.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!assignment || assignment.isCompulsory) notFound();

  const [activeYear] = await db.select({
    id: academicYears.id,
    name: academicYears.name,
  }).from(academicYears)
    .where(and(
      eq(academicYears.schoolId, context.schoolId),
      eq(academicYears.status, "active"),
    ))
    .limit(1);

  const enrolledStudents = activeYear
    ? await db.select({
      enrollmentId: studentEnrollments.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      sectionId: classSections.id,
      sectionName: classSections.name,
      selectionStatus: studentElectiveSelections.status,
    }).from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
        eq(classSections.classLevelId, assignment.classLevelId),
        eq(classSections.academicYearId, activeYear.id),
      ))
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .leftJoin(studentElectiveSelections, and(
        eq(studentElectiveSelections.studentEnrollmentId, studentEnrollments.id),
        eq(studentElectiveSelections.classSubjectId, assignment.id),
        eq(studentElectiveSelections.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, activeYear.id),
        eq(studentEnrollments.status, "enrolled"),
        ne(students.status, "disabled"),
      ))
      .orderBy(asc(classSections.name), asc(students.lastName), asc(students.firstName))
    : [];
  const studentsWithChoices = enrolledStudents.map((student) => {
    if (student.selectionStatus !== null && !isElectiveSelectionStatus(student.selectionStatus)) {
      throw new Error(`Unknown elective selection status: ${student.selectionStatus}`);
    }
    return {
      enrollmentId: student.enrollmentId,
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      sectionName: student.sectionName,
      selectionStatus: student.selectionStatus ?? "not_selected",
    };
  });
  const sections = [...new Map(studentsWithChoices.map((student) => [
    student.sectionName,
    { value: student.sectionName, label: student.sectionName },
  ])).values()].sort((first, second) => first.label.localeCompare(second.label));

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <Link href="/admin/academics?section=optional-subjects" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
          ← Optional subjects
        </Link>
        <p className="pt-2 text-sm font-semibold text-violet-700">
          {assignment.branchName} · {activeYear?.name ?? "No active academic year"}
        </p>
        <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Student elective choices
        </h1>
        <p className="text-sm text-slate-600">
          {assignment.className} · {assignment.subjectName} ({assignment.subjectCode})
        </p>
      </header>

      {!activeYear ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Activate an academic year before managing student elective choices.
        </p>
      ) : (
        <ElectiveSelectionForm
          classSubjectId={assignment.id}
          academicYearId={activeYear.id}
          subjectName={assignment.subjectName}
          students={studentsWithChoices}
          sections={sections}
        />
      )}
    </main>
  );
}
