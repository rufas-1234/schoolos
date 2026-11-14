import Link from "next/link";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentEnrollments,
  students,
} from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { requireSchoolPermission } from "@/lib/access-control";

type Params = {
  classLevelId?: string | string[];
  sectionId?: string | string[];
  academicYearId?: string | string[];
};

function parseId(value: string | string[] | undefined): number | null {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}

export default async function ClassRosterPrintPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const context = await requireSchoolPermission("students.view");
  const params = await searchParams;
  const classLevelId = parseId(params.classLevelId);
  const sectionId = parseId(params.sectionId);
  if ((!classLevelId && !sectionId) || (params.classLevelId && !classLevelId) || (params.sectionId && !sectionId)) {
    notFound();
  }

  const [activeYear] = await db.select({ id: academicYears.id, name: academicYears.name })
    .from(academicYears)
    .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active")))
    .limit(1);
  const academicYearId = parseId(params.academicYearId) ?? activeYear?.id ?? null;
  if (!academicYearId) notFound();

  const [year] = await db.select({ id: academicYears.id, name: academicYears.name })
    .from(academicYears)
    .where(and(eq(academicYears.id, academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .limit(1);
  if (!year) notFound();

  const selectedSections = await db.select({
    id: classSections.id,
    name: classSections.name,
    classLevelId: classLevels.id,
    className: classLevels.name,
    classCode: classLevels.code,
    branchName: schoolBranches.name,
  })
    .from(classSections)
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.academicYearId, academicYearId),
      ...(sectionId ? [eq(classSections.id, sectionId)] : []),
      ...(classLevelId ? [eq(classLevels.id, classLevelId)] : []),
    ))
    .orderBy(asc(classLevels.name), asc(classSections.name));
  if (!selectedSections.length) notFound();

  const enrollments = await db.select({
    sectionId: studentEnrollments.classSectionId,
    rollNumber: studentEnrollments.rollNumber,
    admissionNumber: students.admissionNumber,
    firstName: students.firstName,
    lastName: students.lastName,
    gender: students.gender,
  })
    .from(studentEnrollments)
    .innerJoin(students, and(
      eq(students.id, studentEnrollments.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .where(and(
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.academicYearId, academicYearId),
      eq(studentEnrollments.status, "enrolled"),
      ne(students.status, "disabled"),
      inArray(studentEnrollments.classSectionId, selectedSections.map((section) => section.id)),
    ))
    .orderBy(asc(studentEnrollments.rollNumber), asc(students.lastName), asc(students.firstName));
  const enrollmentsBySection = new Map<number, typeof enrollments>();
  for (const enrollment of enrollments) {
    const sectionEnrollments = enrollmentsBySection.get(enrollment.sectionId) ?? [];
    sectionEnrollments.push(enrollment);
    enrollmentsBySection.set(enrollment.sectionId, sectionEnrollments);
  }
  const totalStudents = enrollments.length;
  const title = sectionId
    ? `${selectedSections[0].className} / ${selectedSections[0].name}`
    : selectedSections[0].className;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-slate-900 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 print:border-black">
        <div>
          <p className="text-sm font-semibold text-violet-700 print:text-black">{selectedSections[0].branchName}</p>
          <h1 className="mt-1 text-2xl font-bold">{title} student roster</h1>
          <p className="mt-1 text-sm text-slate-600">Academic year: {year.name} · Students: {totalStudents}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/academics?section=classes" className="print:hidden text-sm font-semibold text-violet-700">Back to classes</Link>
          <PrintButton label="Print student list" />
        </div>
      </header>
      {selectedSections.map((section) => {
        const studentsInSection = enrollmentsBySection.get(section.id) ?? [];
        return (
          <section key={section.id} className="break-inside-avoid">
            {selectedSections.length > 1 && (
              <h2 className="mb-2 mt-6 text-lg font-semibold">
                {section.name} <span className="text-sm font-normal text-slate-500">({studentsInSection.length} students)</span>
              </h2>
            )}
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 print:bg-slate-100">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Admission number</th>
                  <th className="px-3 py-2">Roll number</th>
                  <th className="px-3 py-2">Student name</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">Signature</th>
                </tr>
              </thead>
              <tbody>
                {studentsInSection.map((student, index) => (
                  <tr key={`${section.id}-${student.admissionNumber}-${index}`} className="border-b border-slate-200">
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2">{student.admissionNumber || "—"}</td>
                    <td className="px-3 py-2">{student.rollNumber || "—"}</td>
                    <td className="px-3 py-2">{student.firstName} {student.lastName}</td>
                    <td className="px-3 py-2 capitalize">{student.gender || "—"}</td>
                    <td className="px-3 py-2" />
                  </tr>
                ))}
                {!studentsInSection.length && (
                  <tr><td className="px-3 py-5 text-slate-500" colSpan={6}>No currently enrolled students.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="pt-4 text-xs text-slate-500 print:text-black">Generated {new Date().toLocaleDateString()} · Total enrolled: {totalStudents}</p>
    </main>
  );
}
