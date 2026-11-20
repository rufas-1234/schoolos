import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
  examAttendance,
  examClasses,
  examGradeBands,
  examGradingScales,
  examMarks,
  examReportSignatures,
  examSubjects,
  examTypes,
  examinations,
  schools,
  studentEnrollments,
  students,
  subjects,
  classSubjects,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolLogoSource } from "@/lib/school-logo";
import { ReportSignatureStrip } from "@/app/admin/examinations/signatures/report-signature-strip";
import {
  calculateWeightedAverage,
  canPreviewDraftTestReport,
  examAssessmentResultState,
  gradeForPercentage,
  hasCompleteExamResult,
  rankScores,
  type GradeBand,
} from "@/lib/examination-policy";

export const dynamic = "force-dynamic";

export default async function ClassMarksheetReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string; examClassId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.publish"]);
  const [{ examId: rawExamId, examClassId: rawExamClassId }, query] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(rawExamId) || !/^\d+$/.test(rawExamClassId)) notFound();
  const examId = Number(rawExamId);
  const examClassId = Number(rawExamClassId);
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage) notFound();

  const [exam] = await db.select({
    id: examinations.id,
    name: examinations.name,
    status: examinations.status,
    branchId: examinations.branchId,
    examTypeName: examTypes.name,
    averagePassing: examTypes.averagePassing,
    averageMark: examTypes.averageMark,
    yearId: academicYears.id,
    yearName: academicYears.name,
    termName: academicTerms.name,
    scaleId: examGradingScales.id,
    allowRanking: examGradingScales.allowRanking,
    classId: classLevels.id,
    className: classLevels.name,
    classBranchId: classLevels.branchId,
    schoolName: schools.name,
    schoolLogoUrl: schools.logoUrl,
    schoolAddress: schools.address,
    schoolPhone: schools.phone,
    schoolEmail: schools.email,
  }).from(examinations)
    .innerJoin(academicYears, and(
      eq(academicYears.id, examinations.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .leftJoin(academicTerms, and(
      eq(academicTerms.id, examinations.academicTermId!),
      eq(academicTerms.schoolId, context.schoolId),
    ))
    .leftJoin(examTypes, and(
      eq(examTypes.id, examinations.examTypeId!),
      eq(examTypes.schoolId, context.schoolId),
    ))
    .innerJoin(examGradingScales, and(
      eq(examGradingScales.id, examinations.gradingScaleId),
      eq(examGradingScales.schoolId, context.schoolId),
    ))
    .innerJoin(examClasses, and(
      eq(examClasses.examinationId, examinations.id),
      eq(examClasses.id, examClassId),
      eq(examClasses.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schools, eq(schools.id, context.schoolId))
    .where(and(
      eq(examinations.id, examId),
      eq(examinations.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!exam || (exam.branchId !== null && exam.branchId !== exam.classBranchId)) notFound();

  const draftPreview = canPreviewDraftTestReport({
    requested: query.preview === "test",
    examName: exam.name,
    examStatus: exam.status,
    canManage,
  });
  const assessmentRows = await db.select({
    id: examSubjects.id,
    name: subjects.name,
    code: subjects.code,
    maxMarks: examSubjects.maxMarks,
    weight: examSubjects.weight,
    status: examSubjects.status,
    isCompulsory: classSubjects.isCompulsory,
  }).from(examSubjects)
    .innerJoin(classSubjects, and(
      eq(classSubjects.id, examSubjects.classSubjectId),
      eq(classSubjects.schoolId, context.schoolId),
    ))
    .innerJoin(subjects, and(
      eq(subjects.id, classSubjects.subjectId),
      eq(subjects.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examSubjects.schoolId, context.schoolId),
      eq(examSubjects.examClassId, examClassId),
      draftPreview ? eq(examSubjects.status, "draft") : undefined,
    ))
    .orderBy(asc(subjects.name));
  if (
    !assessmentRows.length ||
    !draftPreview && assessmentRows.some((assessment) => assessment.status !== "published")
  ) notFound();

  const roster = await db.select({
    id: studentEnrollments.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    rollNumber: studentEnrollments.rollNumber,
    sectionName: classSections.name,
  }).from(studentEnrollments)
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.classLevelId, exam.classId),
      eq(classSections.academicYearId, exam.yearId),
    ))
    .innerJoin(students, and(
      eq(students.id, studentEnrollments.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .where(and(
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.academicYearId, exam.yearId),
      eq(studentEnrollments.status, "enrolled"),
      exam.branchId !== null ? eq(students.branchId, exam.branchId) : undefined,
    ))
    .orderBy(asc(classSections.name), asc(students.lastName), asc(students.firstName));
  if (!roster.length) notFound();
  const sectionNames = [...new Set(roster.map((student) => student.sectionName))];
  const sectionSummary = sectionNames.join(", ");

  const enrollmentIds = roster.map((student) => student.id);
  const assessmentIds = assessmentRows.map((assessment) => assessment.id);
  const [marks, attendance, gradeRows] = await Promise.all([
    db.select({
      enrollmentId: examMarks.enrollmentId,
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      inArray(examMarks.enrollmentId, enrollmentIds),
      inArray(examMarks.examSubjectId, assessmentIds),
    )),
    db.select({
      enrollmentId: examAttendance.enrollmentId,
      examSubjectId: examAttendance.examSubjectId,
      status: examAttendance.status,
    }).from(examAttendance).where(and(
      eq(examAttendance.schoolId, context.schoolId),
      inArray(examAttendance.enrollmentId, enrollmentIds),
      inArray(examAttendance.examSubjectId, assessmentIds),
    )),
    db.select({
      min: examGradeBands.minPercent,
      max: examGradeBands.maxPercent,
      grade: examGradeBands.grade,
      description: examGradeBands.description,
      performanceRemark: examGradeBands.performanceRemark,
    }).from(examGradeBands).where(eq(examGradeBands.gradingScaleId, exam.scaleId))
      .orderBy(asc(examGradeBands.sortOrder)),
  ]);
  const bands: GradeBand[] = gradeRows.map((band) => ({
    minPercent: Number(band.min),
    maxPercent: Number(band.max),
    grade: band.grade,
    description: band.description,
    performanceRemark: band.performanceRemark,
  }));
  const marksByStudent = new Map<number, Map<number, number | null>>();
  for (const mark of marks) {
    const studentMarks = marksByStudent.get(mark.enrollmentId) ?? new Map<number, number | null>();
    studentMarks.set(mark.examSubjectId, mark.marks === null ? null : Number(mark.marks));
    marksByStudent.set(mark.enrollmentId, studentMarks);
  }
  const attendanceByStudent = new Map<number, { present: number; total: number }>();
  const attendanceStatusByStudent = new Map<number, Map<number, string>>();
  for (const entry of attendance) {
    const current = attendanceByStudent.get(entry.enrollmentId) ?? { present: 0, total: 0 };
    current.total += 1;
    if (entry.status === "present" || entry.status === "late") current.present += 1;
    attendanceByStudent.set(entry.enrollmentId, current);
    const statuses = attendanceStatusByStudent.get(entry.enrollmentId) ?? new Map<number, string>();
    statuses.set(entry.examSubjectId, entry.status);
    attendanceStatusByStudent.set(entry.enrollmentId, statuses);
  }
  const results = roster.map((student) => {
    const studentMarks = marksByStudent.get(student.id) ?? new Map<number, number | null>();
    const studentAttendance = attendanceStatusByStudent.get(student.id) ?? new Map<number, string>();
    const assessmentStates = new Map(assessmentRows.map((assessment) => [
      assessment.id,
      examAssessmentResultState({
        attendanceStatus: studentAttendance.get(assessment.id) ?? null,
        isCompulsory: assessment.isCompulsory,
        hasMark: studentMarks.get(assessment.id) !== null && studentMarks.has(assessment.id),
      }),
    ]));
    const scores: Array<{ marks: number; maxMarks: number; weight: number }> = [];
    for (const assessment of assessmentRows) {
      const mark = studentMarks.get(assessment.id);
      if (assessmentStates.get(assessment.id) !== "scored" || typeof mark !== "number") continue;
      scores.push({
        marks: mark,
        maxMarks: Number(assessment.maxMarks),
        weight: Number(assessment.weight),
      });
    }
    const complete = hasCompleteExamResult(assessmentStates.values());
    const overall = complete ? calculateWeightedAverage(scores) : null;
    return {
      ...student,
      complete,
      marks: studentMarks,
      attendanceStatuses: studentAttendance,
      assessmentStates,
      overall,
      grade: overall ? gradeForPercentage(overall.percentage, bands) : null,
      attendance: attendanceByStudent.get(student.id) ?? { present: 0, total: 0 },
    };
  });
  const ranking = exam.allowRanking
    ? rankScores(results.flatMap((result) => result.overall
      ? [{ id: result.id, score: result.overall.percentage }]
      : []))
    : new Map<number, number>();
  const passMark = exam.averagePassing ? Number(exam.averageMark ?? 0) : 0;
  const schoolLogo = schoolLogoSource(exam.schoolLogoUrl);
  const signatureRows = await db.select({
    role: examReportSignatures.role,
    updatedAt: examReportSignatures.updatedAt,
  })
    .from(examReportSignatures)
    .where(eq(examReportSignatures.schoolId, context.schoolId));

  return (
    <main className="exam-report-document print-report-page mx-auto max-w-7xl space-y-5 p-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link href={`/admin/examinations/${examId}`} className="text-sm font-semibold text-violet-700">← Back to exam workflow</Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">Class marksheet report</h1>
          <p className="mt-1 text-sm text-slate-600">{exam.name} · {exam.className} · Sections: {sectionSummary} · {exam.termName ?? exam.yearName}</p>
        </div>
        <PrintButton label="Print marks-only sheet" targetId="class-marks-only-sheet" pageOrientation="landscape" pageSize="A4" />
      </header>

      <section id="class-marks-only-sheet" className="hidden print:block print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="print-report-heading flex items-center gap-4">
          {schoolLogo && <Image src={schoolLogo} unoptimized width={56} height={56} alt={`${exam.schoolName} logo`} className="exam-report-school-logo h-14 w-14 object-contain" />}
          <div className="flex-1">
            <p className="exam-report-school-name text-xs font-semibold uppercase tracking-wide">{exam.schoolName}</p>
            <p className="exam-report-school-contact mt-0.5 text-xs">
              {[exam.schoolAddress, exam.schoolPhone, exam.schoolEmail].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-1 text-xl font-bold">{exam.name} — {exam.className} Statement of Marks</h2>
            <p className="mt-1 text-sm">{exam.termName ?? exam.yearName}</p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="print-report-table w-full min-w-[700px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Student</th>
                <th className="p-2">Section</th>
                <th className="p-2">Admission no.</th>
                <th className="p-2">Roll no.</th>
                {assessmentRows.map((assessment) => <th key={assessment.id} className="p-2">{assessment.name} / {assessment.maxMarks}</th>)}
              </tr>
            </thead>
            <tbody>{results.map((result) => (
              <tr key={result.id}>
                <td className="p-2">{result.firstName} {result.lastName}</td>
                <td className="p-2">{result.sectionName}</td>
                <td className="p-2">{result.admissionNumber ?? "—"}</td>
                <td className="p-2">{result.rollNumber ?? "—"}</td>
                {assessmentRows.map((assessment) => {
                  const mark = result.marks.get(assessment.id);
                  const status = result.attendanceStatuses.get(assessment.id);
                  const state = result.assessmentStates.get(assessment.id);
                  const display = state === "scored" && typeof mark === "number" ? String(mark)
                    : status === "x" ? "X · Absent"
                    : status === "y" ? "Y · Nullified (malpractice)"
                    : status === "not_applicable" ? "Not taking"
                    : status === "absent" ? "Absent"
                    : status === "excused" ? "Excused"
                    : state === "missing" ? "Missing"
                    : "—";
                  return <td key={assessment.id} className="p-2">{display}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <ReportSignatureStrip signatures={signatureRows} />
      </section>

      <section id="class-marksheet-report" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        {draftPreview && <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-center text-sm font-bold uppercase text-amber-950 print:border-2">Draft test preview — not official; scores are synthetic</div>}
        <header className="print-report-heading flex items-center gap-4">
          {schoolLogo && <Image src={schoolLogo} unoptimized width={56} height={56} alt={`${exam.schoolName} logo`} className="h-14 w-14 object-contain" />}
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{exam.schoolName}</p>
            <p className="exam-report-school-contact mt-0.5 text-xs text-slate-600">
              {[exam.schoolAddress, exam.schoolPhone, exam.schoolEmail].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-1 text-xl font-bold">{exam.name} — {exam.className}</h2>
            <p className="mt-1 text-sm text-slate-600">{exam.termName ?? exam.yearName} · Sections: {sectionSummary} · {results.length} students · {assessmentRows.length} subjects</p>
            <p className="mt-1 text-sm text-slate-600">Pass threshold: {passMark > 0 ? `${passMark.toFixed(2)}% overall` : "not configured"} · {exam.allowRanking ? "Ranked students are ordered by weighted overall percentage." : "Position is not calculated."}</p>
            <p className="mt-1 text-xs text-slate-600">Overall percentages are weighted by subject assessment weight. Subject grades use the selected grading scale. {exam.allowRanking ? "Class rank uses competition ranking; incomplete records are not ranked." : "Class ranking is disabled for this grading scale."}</p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="print-report-table w-full min-w-[900px] border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="p-2">Position</th>
                <th className="p-2">Student</th>
                <th className="p-2">Section</th>
                <th className="p-2">Admission no.</th>
                <th className="p-2">Roll no.</th>
                {assessmentRows.map((assessment) => <th key={assessment.id} className="p-2">{assessment.name} / {assessment.maxMarks}</th>)}
                <th className="p-2">Total</th>
                <th className="p-2">Overall</th>
                <th className="p-2">Grade</th>
                <th className="p-2">Outcome</th>
                <th className="p-2">Attendance</th>
              </tr>
            </thead>
            <tbody>{results.map((result) => {
              const isPassing = result.overall && passMark > 0 ? result.overall.percentage >= passMark : null;
              const reportHref = `/admin/examinations/${examId}/report-cards/${result.id}${draftPreview ? "?preview=test" : ""}`;
              return (
                <tr key={result.id} className="border-t">
                  <td className="p-2">{exam.allowRanking ? ranking.get(result.id) ?? "—" : "—"}</td>
                  <td className="p-2 font-medium">
                    {result.firstName} {result.lastName}
                    {!draftPreview && <Link href={reportHref} className="ml-1 text-violet-700 print:hidden">Report card</Link>}
                  </td>
                  <td className="p-2">{result.sectionName}</td>
                  <td className="p-2">{result.admissionNumber ?? "—"}</td>
                  <td className="p-2">{result.rollNumber ?? "—"}</td>
                  {assessmentRows.map((assessment) => {
                    const mark = result.marks.get(assessment.id);
                    const state = result.assessmentStates.get(assessment.id);
                    const percentage = state !== "scored" || mark === null || mark === undefined
                      ? null
                      : mark / Number(assessment.maxMarks) * 100;
                    const grade = percentage === null ? null : gradeForPercentage(percentage, bands);
                    const status = result.attendanceStatuses.get(assessment.id);
                    const display = state === "scored" && typeof mark === "number" ? String(mark)
                      : status === "x" ? "X · Absent"
                      : status === "y" ? "Y · Nullified (malpractice)"
                      : status === "not_applicable" ? "Not taking"
                      : status === "absent" ? "Absent"
                      : status === "excused" ? "Excused"
                      : state === "missing" ? "Missing"
                      : "—";
                    return <td key={assessment.id} className="p-2">{display}{grade && <span className="block text-slate-500">{grade.grade}</span>}</td>;
                  })}
                  <td className="p-2">{result.overall ? `${result.overall.totalMarks.toFixed(2)} / ${result.overall.maxMarks.toFixed(2)}` : "Incomplete"}</td>
                  <td className="p-2">{result.overall ? `${result.overall.percentage.toFixed(2)}%` : "—"}</td>
                  <td className="p-2">{result.grade?.grade ?? "—"}{result.grade && <span className="block text-slate-500">{result.grade.description}</span>}</td>
                  <td className="p-2">{passMark > 0 ? isPassing ? "Pass" : result.overall ? "Below pass mark" : "Incomplete" : "Pass mark not set"}</td>
                  <td className="p-2">{result.attendance.present}/{result.attendance.total} present</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <footer className="flex justify-between border-t pt-3 text-xs text-slate-500"><span>{exam.schoolName} · {exam.examTypeName ?? "Examination"}</span><span>{exam.name} · {exam.className} · {sectionSummary}</span></footer>
        <ReportSignatureStrip signatures={signatureRows} />
      </section>
    </main>
  );
}
