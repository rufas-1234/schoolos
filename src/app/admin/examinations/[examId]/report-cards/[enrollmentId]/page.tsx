import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examGradeBands,
  examGradingScales,
  examMarks,
  examStudentRemarks,
  examSubjects,
  examinations,
  schools,
  staffMembers,
  studentAttendance,
  studentEnrollments,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { requireSchoolPermission } from "@/lib/access-control";
import { calculateWeightedAverage, gradeForPercentage, rankScores, type GradeBand } from "@/lib/examination-policy";

export const dynamic = "force-dynamic";

export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ examId: string; enrollmentId: string }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const { examId: rawExamId, enrollmentId: rawEnrollmentId } = await params;
  if (!/^\d+$/.test(rawExamId) || !/^\d+$/.test(rawEnrollmentId)) notFound();
  const examId = Number(rawExamId);
  const enrollmentId = Number(rawEnrollmentId);
  const [record] = await db.select({
    examinationId: examinations.id,
    examinationName: examinations.name,
    examinationStatus: examinations.status,
    academicYearId: examinations.academicYearId,
    branchId: examinations.branchId,
    termId: examinations.academicTermId,
    scaleId: examGradingScales.id,
    scaleName: examGradingScales.name,
    allowRanking: examGradingScales.allowRanking,
    yearName: academicYears.name,
    yearStart: academicYears.startDate,
    yearEnd: academicYears.endDate,
    termName: academicTerms.name,
    termStart: academicTerms.startDate,
    termEnd: academicTerms.endDate,
    examClassId: examClasses.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    principalRemark: examClasses.principalRemark,
    enrollmentId: studentEnrollments.id,
    sectionId: classSections.id,
    studentId: students.id,
    studentPublicId: students.publicId,
    studentFirstName: students.firstName,
    studentLastName: students.lastName,
    studentBranchId: students.branchId,
    admissionNumber: students.admissionNumber,
    profilePhoto: students.additionalDetails,
    sectionName: classSections.name,
    classTeacherId: classSections.classTeacherId,
    schoolLogoUrl: schools.logoUrl,
    schoolName: schools.name,
  }).from(examinations)
    .innerJoin(academicYears, and(eq(academicYears.id, examinations.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .leftJoin(academicTerms, and(eq(academicTerms.id, examinations.academicTermId!), eq(academicTerms.schoolId, context.schoolId)))
    .innerJoin(examGradingScales, and(eq(examGradingScales.id, examinations.gradingScaleId), eq(examGradingScales.schoolId, context.schoolId)))
    .innerJoin(examClasses, and(eq(examClasses.examinationId, examinations.id), eq(examClasses.schoolId, context.schoolId)))
    .innerJoin(classLevels, and(eq(classLevels.id, examClasses.classLevelId), eq(classLevels.schoolId, context.schoolId)))
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.id, enrollmentId),
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.academicYearId, examinations.academicYearId),
      eq(studentEnrollments.status, "enrolled"),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.classLevelId, examClasses.classLevelId),
      eq(classSections.academicYearId, examinations.academicYearId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .innerJoin(students, and(eq(students.id, studentEnrollments.studentId), eq(students.schoolId, context.schoolId)))
    .innerJoin(schools, eq(schools.id, context.schoolId))
    .where(and(
      eq(examinations.id, examId),
      eq(examinations.schoolId, context.schoolId),
      eq(examinations.status, "published"),
    ))
    .limit(1);
  if (!record || record.branchId !== null && record.branchId !== record.studentBranchId) notFound();

  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage) {
    const assignment = await db.select({ id: classSubjects.id }).from(classSubjects)
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
      .where(and(eq(classSubjects.classLevelId, record.classLevelId), eq(classSubjects.schoolId, context.schoolId)))
      .limit(1);
    if (!assignment.length) notFound();
  }
  const marks = await db.select({
    subjectName: subjects.name,
    subjectCode: subjects.code,
    marks: examMarks.marks,
    maxMarks: examSubjects.maxMarks,
    weight: examSubjects.weight,
    teacherRemark: examMarks.teacherRemark,
    markId: examMarks.id,
  }).from(examMarks)
    .innerJoin(examSubjects, and(
      eq(examSubjects.id, examMarks.examSubjectId),
      eq(examSubjects.examClassId, record.examClassId),
      eq(examSubjects.schoolId, context.schoolId),
      eq(examSubjects.status, "published"),
    ))
    .innerJoin(classSubjects, and(eq(classSubjects.id, examSubjects.classSubjectId), eq(classSubjects.schoolId, context.schoolId)))
    .innerJoin(subjects, and(eq(subjects.id, classSubjects.subjectId), eq(subjects.schoolId, context.schoolId)))
    .where(and(
      eq(examMarks.schoolId, context.schoolId),
      eq(examMarks.enrollmentId, record.enrollmentId),
    ))
    .orderBy(asc(subjects.name));
  if (!marks.length || marks.some((mark) => mark.marks === null)) notFound();
  const gradeBands = await db.select({
    minPercent: examGradeBands.minPercent,
    maxPercent: examGradeBands.maxPercent,
    grade: examGradeBands.grade,
    description: examGradeBands.description,
    performanceRemark: examGradeBands.performanceRemark,
  }).from(examGradeBands).where(eq(examGradeBands.gradingScaleId, record.scaleId))
    .orderBy(asc(examGradeBands.sortOrder));
  const bands: GradeBand[] = gradeBands.map((band) => ({
    minPercent: Number(band.minPercent),
    maxPercent: Number(band.maxPercent),
    grade: band.grade,
    description: band.description,
    performanceRemark: band.performanceRemark,
  }));
  const outcomes = marks.map((mark) => {
    const score = Number(mark.marks);
    const max = Number(mark.maxMarks);
    const percentage = score / max * 100;
    return {
      ...mark,
      percentage,
      grade: gradeForPercentage(percentage, bands),
    };
  });
  const overall = calculateWeightedAverage(marks.map((mark) => ({
    marks: Number(mark.marks),
    maxMarks: Number(mark.maxMarks),
    weight: Number(mark.weight),
  })));
  if (!overall) notFound();
  const overallGrade = gradeForPercentage(overall.percentage, bands);
  let classRank: number | null = null;
  let classSize = 0;
  if (record.allowRanking) {
    const classScores = await db.select({
      enrollmentId: studentEnrollments.id,
      examMarkId: examMarks.id,
      marks: examMarks.marks,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
    }).from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.classLevelId, record.classLevelId),
        eq(classSections.academicYearId, record.academicYearId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(examMarks, and(
        eq(examMarks.enrollmentId, studentEnrollments.id),
        eq(examMarks.schoolId, context.schoolId),
      ))
      .innerJoin(examSubjects, and(
        eq(examSubjects.id, examMarks.examSubjectId),
        eq(examSubjects.examClassId, record.examClassId),
        eq(examSubjects.schoolId, context.schoolId),
        eq(examSubjects.status, "published"),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, record.academicYearId),
        eq(studentEnrollments.status, "enrolled"),
      ));
    const totals = new Map<number, Array<{ marks: number; maxMarks: number; weight: number }>>();
    for (const mark of classScores) {
      if (mark.marks === null) continue;
      const current = totals.get(mark.enrollmentId) ?? [];
      current.push({ marks: Number(mark.marks), maxMarks: Number(mark.maxMarks), weight: Number(mark.weight) });
      totals.set(mark.enrollmentId, current);
    }
    const scored = [...totals.entries()].map(([id, results]) => {
      const total = calculateWeightedAverage(results);
      return total ? { id, score: total.percentage } : null;
    }).filter((row): row is { id: number; score: number } => row !== null);
    classRank = rankScores(scored).get(record.enrollmentId) ?? null;
    classSize = scored.length;
  }
  const attendanceStart = record.termStart ?? record.yearStart;
  const attendanceEnd = record.termEnd ?? record.yearEnd;
  const attendance = await db.select({
    status: studentAttendance.status,
  }).from(studentAttendance).where(and(
    eq(studentAttendance.schoolId, context.schoolId),
    eq(studentAttendance.enrollmentId, record.enrollmentId),
    gte(studentAttendance.attendanceDate, attendanceStart),
    lte(studentAttendance.attendanceDate, attendanceEnd),
  ));
  const attendanceCounts = new Map<string, number>();
  for (const item of attendance) attendanceCounts.set(item.status, (attendanceCounts.get(item.status) ?? 0) + 1);
  const [classRemark] = await db.select({
    remark: examStudentRemarks.classTeacherRemark,
  }).from(examStudentRemarks).where(and(
    eq(examStudentRemarks.schoolId, context.schoolId),
    eq(examStudentRemarks.examClassId, record.examClassId),
    eq(examStudentRemarks.enrollmentId, record.enrollmentId),
  )).limit(1);
  const photo = record.profilePhoto?.profilePhoto;
  const photoAllowed = context.grantedPermissions.includes("students.view");
  const photoUrl = photoAllowed && photo?.objectKey && photo.fileName
    ? `/api/admin/students/${record.studentPublicId}/photo`
    : null;

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link href={`/admin/examinations/${examId}`} className="text-sm font-semibold text-violet-700">← Back to {record.examinationName}</Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">Student report card</h1>
        </div>
        <PrintButton label="Print / save PDF" targetId="student-report-card" />
      </header>
      <article id="student-report-card" className="print-report-content space-y-5 rounded-2xl border border-slate-200 bg-white p-7 text-slate-900 print:rounded-none print:border-0 print:p-0">
        <header className="print-report-heading flex items-center gap-4">
          {record.schoolLogoUrl && <Image src={record.schoolLogoUrl} unoptimized width={64} height={64} alt={`${record.schoolName} logo`} className="h-16 w-16 rounded-lg object-contain" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">{record.schoolName}</p>
            <h2 className="mt-1 text-2xl font-bold">Student report card</h2>
            <p className="mt-1 text-sm text-slate-600">{record.examinationName} · {record.termName ?? record.yearName}</p>
          </div>
          {photoUrl && <Image src={photoUrl} unoptimized width={80} height={80} alt={`${record.studentFirstName} ${record.studentLastName}`} className="h-20 w-20 rounded-xl object-cover" />}
        </header>
        <section className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Student:</span> {record.studentFirstName} {record.studentLastName}</p>
          <p><span className="font-semibold">Admission number:</span> {record.admissionNumber ?? "—"}</p>
          <p><span className="font-semibold">Class:</span> {record.className} · {record.sectionName}</p>
          <p><span className="font-semibold">Academic year:</span> {record.yearName}</p>
          <p><span className="font-semibold">Term:</span> {record.termName ?? "Not specified"}</p>
          {record.allowRanking && <p><span className="font-semibold">Class rank:</span> {classRank ?? "—"} of {classSize}</p>}
        </section>
        <section className="print-report-panel overflow-x-auto rounded-xl border border-slate-200">
          <table className="print-report-table w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="p-3">Subject</th><th className="p-3">Marks</th><th className="p-3">Percentage</th><th className="p-3">Grade</th><th className="p-3">Teacher remark</th></tr></thead>
            <tbody>{outcomes.map((item) => (
              <tr key={item.markId} className="border-t border-slate-200">
                <td className="p-3 font-medium">{item.subjectName} <span className="text-xs text-slate-500">{item.subjectCode}</span></td>
                <td className="p-3">{item.marks} / {item.maxMarks}</td>
                <td className="p-3">{item.percentage.toFixed(2)}%</td>
                <td className="p-3">{item.grade?.grade ?? "—"}{item.grade && <span className="ml-1 text-xs text-slate-500">{item.grade.description}</span>}</td>
                <td className="p-3">{item.teacherRemark ?? "—"}</td>
              </tr>
            ))}</tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <tr><td className="p-3">Overall</td><td className="p-3">{overall.totalMarks.toFixed(2)} / {overall.maxMarks.toFixed(2)}</td><td className="p-3">{overall.percentage.toFixed(2)}%</td><td className="p-3">{overallGrade?.grade ?? "—"} {overallGrade?.description}</td><td className="p-3">{overallGrade?.performanceRemark ?? ""}</td></tr>
            </tfoot>
          </table>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="font-bold">Attendance summary</h3>
            <p className="mt-1 text-xs text-slate-500">{attendanceStart} through {attendanceEnd}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["present", "late", "absent", "excused"].map((status) => <span key={status} className="rounded-lg bg-slate-50 px-3 py-2 text-sm capitalize">{status}: {attendanceCounts.get(status) ?? 0}</span>)}
              <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Recorded: {attendance.length}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border p-4"><h3 className="font-bold">Class teacher&apos;s remarks</h3><p className="mt-2 text-sm">{classRemark?.remark ?? "—"}</p></div>
            <div className="rounded-xl border p-4"><h3 className="font-bold">Principal&apos;s remarks</h3><p className="mt-2 text-sm">{record.principalRemark ?? "—"}</p></div>
          </div>
        </section>
        <footer className="flex justify-between border-t pt-4 text-xs text-slate-500"><span>{record.schoolName}</span><span>{record.examinationName} · {record.yearName}</span></footer>
      </article>
    </main>
  );
}
