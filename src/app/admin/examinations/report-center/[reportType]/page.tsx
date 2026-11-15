import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examAttendance,
  examClasses,
  examGradeBands,
  examGradingScales,
  examMarks,
  examStudentRemarks,
  examSubjects,
  examTypes,
  examinations,
  feePayments,
  schools,
  staffMembers,
  studentAttendance,
  studentEnrollments,
  studentFeeInvoices,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  calculateWeightedAverage,
  gradeForPercentage,
  rankScores,
  type GradeBand,
} from "@/lib/examination-policy";
import {
  calculateOutstandingInvoiceBalance,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";

export const dynamic = "force-dynamic";
type ProgressAssessment = { id: number; name: string; maxMarks: string; weight: string };

const reportDefinitions = {
  "exam-routine": { title: "Exam Routine", description: "Print an examination schedule by class and subject.", results: false },
  "merit-list": { title: "Merit List Report", description: "Rank complete published results using the exam grading scale.", results: true },
  "online-exam": { title: "Online Exam Report", description: "Review online examination attempts and scores.", results: true },
  "mark-sheet": { title: "Mark Sheet Report", description: "View and print an individual student's published marks.", results: true },
  "subject-wise-marksheet": { title: "Subject-wise Marksheet Report", description: "Print one subject's marks, grade and percentage for a class.", results: true },
  "tabulation-sheet": { title: "Tabulation Sheet Report", description: "Compare student marks across every subject in a class.", results: true },
  "progress-card": { title: "Progress Card Report", description: "Print individual or bulk A4 student progress cards.", results: true },
  "progress-card-100-percent": { title: "Progress Card Report 100 Percent", description: "Print progress cards with subject results normalized to percentages.", results: true },
  "previous-result": { title: "Previous Result", description: "Compare this class with its earlier published examinations.", results: true },
} as const;

type ReportType = keyof typeof reportDefinitions;
type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validId(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function reportUrl(reportType: ReportType, params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  }
  const search = query.toString();
  return `/admin/examinations/report-center/${reportType}${search ? `?${search}` : ""}`;
}

function formatMarks(value: number | null | undefined): string {
  return typeof value === "number" ? Number.isInteger(value) ? String(value) : value.toFixed(2) : "—";
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function gradeBands(rows: Array<{
  minPercent: string;
  maxPercent: string;
  grade: string;
  description: string;
  performanceRemark: string;
}>): GradeBand[] {
  return rows.map((row) => ({
    minPercent: Number(row.minPercent),
    maxPercent: Number(row.maxPercent),
    grade: row.grade,
    description: row.description,
    performanceRemark: row.performanceRemark,
  }));
}

function ReportHeading({
  schoolName,
  schoolLogoUrl,
  title,
  subtitle,
}: {
  schoolName: string;
  schoolLogoUrl: string | null;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="exam-report-heading flex items-center gap-4">
      {schoolLogoUrl && <Image src={schoolLogoUrl} unoptimized width={64} height={64} alt={`${schoolName} logo`} className="h-16 w-16 object-contain" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-700">{schoolName}</p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
    </header>
  );
}

function ProgressCard({
  row,
  exam,
  bands,
  position,
  attendance,
  classRemark,
  principalRemark,
  showPercentages,
  schoolName,
  schoolLogoUrl,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  currency,
  feeBalanceMinor,
  showFeeBalance,
  last,
}: {
  row: {
    enrollmentId: number;
    studentPublicId: string;
    photoUrl: string | null;
    name: string;
    admissionNumber: string | null;
    className: string;
    sectionName: string;
    rollNumber: string | null;
    marks: Map<number, number | null>;
    overall: { totalMarks: number; maxMarks: number; percentage: number } | null;
    complete: boolean;
    examAttendance: { present: number; absent: number; late: number; excused: number };
  };
  exam: { name: string; yearName: string; termName: string | null; allowRanking: boolean; assessments: ProgressAssessment[] };
  bands: GradeBand[];
  position: number | null;
  attendance: { present: number; absent: number; late: number; excused: number; total: number };
  classRemark: string | null;
  principalRemark: string | null;
  showPercentages: boolean;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  currency: string;
  feeBalanceMinor: number;
  showFeeBalance: boolean;
  last: boolean;
}) {
  const overallGrade = row.overall ? gradeForPercentage(row.overall.percentage, bands) : null;
  const summary = `${exam.name} · ${exam.termName ?? exam.yearName}`;
  return (
    <article className={`a4-report-card${last ? " a4-report-card-last" : ""} space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-slate-900`}>
      <div className="flex items-center gap-3">
        <ReportHeading schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} title="Student Progress Card" subtitle={summary} />
        {row.photoUrl && (
          <Image
            src={row.photoUrl}
            unoptimized
            width={56}
            height={56}
            alt={`${row.name} photo`}
            className="h-14 w-14 rounded-lg object-cover"
          />
        )}
      </div>
      <section className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
        <p><b>Student</b><br />{row.name}</p>
        <p><b>Admission no.</b><br />{row.admissionNumber ?? "—"}</p>
        <p><b>Class / section</b><br />{row.className} · {row.sectionName}</p>
        <p><b>Roll no.</b><br />{row.rollNumber ?? "—"}</p>
        <p><b>Academic year</b><br />{exam.yearName}</p>
        {exam.allowRanking && <p><b>Position</b><br />{position ?? "—"}</p>}
      </section>
      <table className="print-report-table w-full border-collapse text-left text-xs">
        <thead><tr><th>Subject</th><th>{showPercentages ? "Score (%)" : "Marks"}</th><th>Grade</th></tr></thead>
        <tbody>{exam.assessments.map((assessment) => {
          const mark = row.marks.get(assessment.id);
          const percentage = typeof mark === "number" ? mark / Number(assessment.maxMarks) * 100 : null;
          const band = percentage === null ? null : gradeForPercentage(percentage, bands);
          return (
            <tr key={assessment.id}>
              <td>{assessment.name}</td>
              <td>{showPercentages ? percentage === null ? "—" : `${percentage.toFixed(2)}%` : `${formatMarks(mark)} / ${assessment.maxMarks}`}</td>
              <td>{band?.grade ?? "—"}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <section className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="font-bold">Overall performance</h3>
          <p className="mt-1 text-lg font-bold">{row.overall ? `${row.overall.percentage.toFixed(2)}%` : "Incomplete"}</p>
          <p>{row.overall ? `${row.overall.totalMarks.toFixed(2)} / ${row.overall.maxMarks.toFixed(2)} · Grade ${overallGrade?.grade ?? "—"}` : "All published subject marks are required."}</p>
        </div>
        {showFeeBalance && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <h3 className="font-bold">Outstanding fee balance</h3>
            <p className="mt-1 text-lg font-bold">{currency} {(feeBalanceMinor / 100).toFixed(2)}</p>
            <p>Includes overdue fines and payments net of reversals.</p>
          </div>
        )}
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="font-bold">Attendance</h3>
          <p className="mt-1">Present {attendance.present} · Absent {attendance.absent}</p>
          <p>Late {attendance.late} · Excused {attendance.excused} · Recorded {attendance.total}</p>
          <p className="mt-1">Exam sittings present: {row.examAttendance.present}</p>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 p-3 text-xs">
        <h3 className="font-bold">Comments</h3>
        <p className="mt-1"><b>Class teacher:</b> {classRemark || (overallGrade?.performanceRemark ? `Suggested from grade ${overallGrade.grade}: ${overallGrade.performanceRemark}` : "—")}</p>
        <p className="mt-1"><b>Principal:</b> {principalRemark || "—"}</p>
      </section>
      <footer className="grid grid-cols-3 gap-3 pt-2 text-center text-[10px]">
        {["Parent / Guardian", "Class Teacher", "Principal"].map((label) => (
          <div key={label} className="pt-6">
            <div className="border-t border-slate-500 pt-1">{label} signature</div>
          </div>
        ))}
      </footer>
      {(schoolAddress || schoolPhone || schoolEmail) && (
        <footer className="border-t border-slate-300 pt-2 text-center text-[9px] text-slate-600">
          {[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join(" · ")}
        </footer>
      )}
    </article>
  );
}

export default async function ExaminationReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportType: string }>;
  searchParams: Promise<Query>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const [{ reportType: rawReportType }, query] = await Promise.all([params, searchParams]);
  if (!Object.hasOwn(reportDefinitions, rawReportType)) notFound();
  const reportType = rawReportType as ReportType;
  const definition = reportDefinitions[reportType];
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  const isOnlineReport = reportType === "online-exam";
  if (!canManage && !["exam-routine", "subject-wise-marksheet", "online-exam"].includes(reportType)) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Link href="/admin/examinations" className="text-sm font-semibold text-violet-700">← Examinations</Link>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-950">Whole-class report access required</h1>
          <p className="mt-2 text-sm text-amber-900">
            Your access is limited to assigned subjects. Ask an examination manager to generate whole-class results and report cards.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-violet-800">
            <Link href={reportUrl("exam-routine", {})}>Exam Routine</Link>
            <Link href={reportUrl("subject-wise-marksheet", {})}>Assigned Subject Marksheet</Link>
            <Link href={reportUrl("online-exam", {})}>Online Exam Report</Link>
          </div>
        </section>
      </main>
    );
  }
  const hasResults = definition.results && !isOnlineReport;
  const rawExamId = first(query.examId);
  const rawClassId = first(query.classId);
  const rawSubjectId = first(query.subjectId);
  const rawEnrollmentId = first(query.enrollmentId);
  const requestedExamId = validId(rawExamId);
  const requestedClassId = validId(rawClassId);
  const requestedSubjectId = validId(rawSubjectId);
  const requestedEnrollmentId = validId(rawEnrollmentId);

  const assignedExamIds = canManage
    ? null
    : [...new Set((await db.select({ id: examinations.id }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
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
      .where(eq(examSubjects.schoolId, context.schoolId))).map((row) => row.id))];
  const examOptions = assignedExamIds && assignedExamIds.length === 0
    ? []
    : await db.select({
      id: examinations.id,
      name: examinations.name,
      status: examinations.status,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
      yearName: academicYears.name,
    }).from(examinations)
      .innerJoin(academicYears, and(
        eq(academicYears.id, examinations.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examinations.schoolId, context.schoolId),
        assignedExamIds ? inArray(examinations.id, assignedExamIds) : undefined,
      ))
      .orderBy(desc(examinations.startDate));
  const exam = examOptions.find((item) => item.id === requestedExamId) ??
    (requestedExamId ? null : examOptions.find((item) => hasResults ? item.status === "published" : true));
  if (requestedExamId && !exam) notFound();
  const examDetails = exam ? await db.select({
    id: examinations.id,
    name: examinations.name,
    status: examinations.status,
    startDate: examinations.startDate,
    endDate: examinations.endDate,
    academicYearId: examinations.academicYearId,
    yearName: academicYears.name,
    yearStart: academicYears.startDate,
    yearEnd: academicYears.endDate,
    termName: academicTerms.name,
    termStart: academicTerms.startDate,
    termEnd: academicTerms.endDate,
    branchId: examinations.branchId,
    examTypeName: examTypes.name,
    averagePassing: examTypes.averagePassing,
    averageMark: examTypes.averageMark,
    scaleId: examGradingScales.id,
    allowRanking: examGradingScales.allowRanking,
    schoolName: schools.name,
    schoolLogoUrl: schools.logoUrl,
    schoolAddress: schools.address,
    schoolPhone: schools.phone,
    schoolEmail: schools.email,
    schoolCurrency: schools.currency,
    schoolTimezone: schools.timezone,
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
    .innerJoin(schools, eq(schools.id, context.schoolId))
    .where(and(eq(examinations.id, exam.id), eq(examinations.schoolId, context.schoolId)))
    .limit(1).then((rows) => rows[0] ?? null) : null;
  const classes = examDetails ? await db.select({
    id: examClasses.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    classBranchId: classLevels.branchId,
    principalRemark: examClasses.principalRemark,
  }).from(examClasses)
    .innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examClasses.schoolId, context.schoolId),
      eq(examClasses.examinationId, examDetails.id),
      examDetails.branchId ? eq(classLevels.branchId, examDetails.branchId) : undefined,
    ))
    .orderBy(asc(classLevels.name)) : [];
  const examClass = classes.find((item) => item.id === requestedClassId) ?? classes[0] ?? null;

  const subjectRows = examDetails && examClass
    ? await db.select({
      id: examSubjects.id,
      name: subjects.name,
      code: subjects.code,
      examDate: examSubjects.examDate,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
      status: examSubjects.status,
      classSubjectId: classSubjects.id,
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
        eq(examSubjects.examClassId, examClass.id),
        hasResults ? eq(examSubjects.status, "published") : undefined,
      ))
      .orderBy(asc(examSubjects.examDate), asc(subjects.name))
    : [];
  const assignedAssessmentRows = !canManage && subjectRows.length
    ? await db.select({ id: examSubjects.id }).from(examSubjects)
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
      .where(and(
        eq(examSubjects.schoolId, context.schoolId),
        inArray(examSubjects.id, subjectRows.map((item) => item.id)),
      ))
    : [];
  const assignedAssessmentIds = canManage
    ? null
    : new Set(assignedAssessmentRows.map((row) => row.id));
  const assessments = subjectRows.filter((item) => assignedAssessmentIds === null || assignedAssessmentIds.has(item.id));
  const selectedSubject = assessments.find((item) => item.id === requestedSubjectId) ?? null;

  const resultRows = hasResults && examDetails && examClass && examDetails.status === "published" && assessments.length
    ? await db.select({
      enrollmentId: studentEnrollments.id,
      studentId: students.id,
      studentPublicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      profilePhoto: students.additionalDetails,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      sectionName: classSections.name,
      sectionId: classSections.id,
    }).from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
        eq(classSections.classLevelId, examClass.classLevelId),
        eq(classSections.academicYearId, examDetails.academicYearId),
      ))
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, examDetails.academicYearId),
        eq(studentEnrollments.status, "enrolled"),
        examDetails.branchId !== null ? eq(students.branchId, examDetails.branchId) : undefined,
      ))
      .orderBy(asc(classSections.name), asc(students.lastName), asc(students.firstName))
    : [];
  const sectionSummary = [...new Set(resultRows.map((row) => row.sectionName))].join(", ");
  const canViewPhotos = context.grantedPermissions.includes("students.view");
  const [markRows, gradeRows, attendanceRows, remarksRows, dailyAttendanceRows] = resultRows.length && assessments.length
    ? await Promise.all([
      db.select({
        enrollmentId: examMarks.enrollmentId,
        examSubjectId: examMarks.examSubjectId,
        marks: examMarks.marks,
        teacherRemark: examMarks.teacherRemark,
      }).from(examMarks).where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(examMarks.enrollmentId, resultRows.map((row) => row.enrollmentId)),
        inArray(examMarks.examSubjectId, assessments.map((row) => row.id)),
      )),
      db.select({
        minPercent: examGradeBands.minPercent,
        maxPercent: examGradeBands.maxPercent,
        grade: examGradeBands.grade,
        description: examGradeBands.description,
        performanceRemark: examGradeBands.performanceRemark,
      }).from(examGradeBands).where(eq(examGradeBands.gradingScaleId, examDetails!.scaleId))
        .orderBy(asc(examGradeBands.sortOrder)),
      db.select({
        enrollmentId: examAttendance.enrollmentId,
        status: examAttendance.status,
      }).from(examAttendance).where(and(
        eq(examAttendance.schoolId, context.schoolId),
        inArray(examAttendance.enrollmentId, resultRows.map((row) => row.enrollmentId)),
        inArray(examAttendance.examSubjectId, assessments.map((row) => row.id)),
      )),
      db.select({
        enrollmentId: examStudentRemarks.enrollmentId,
        remark: examStudentRemarks.classTeacherRemark,
      }).from(examStudentRemarks).where(and(
        eq(examStudentRemarks.schoolId, context.schoolId),
        eq(examStudentRemarks.examClassId, examClass!.id),
        inArray(examStudentRemarks.enrollmentId, resultRows.map((row) => row.enrollmentId)),
      )),
      db.select({
        enrollmentId: studentAttendance.enrollmentId,
        status: studentAttendance.status,
      }).from(studentAttendance).where(and(
        eq(studentAttendance.schoolId, context.schoolId),
        inArray(studentAttendance.enrollmentId, resultRows.map((row) => row.enrollmentId)),
        gte(studentAttendance.attendanceDate, examDetails!.termStart ?? examDetails!.yearStart),
        lte(studentAttendance.attendanceDate, examDetails!.termEnd ?? examDetails!.yearEnd),
      )),
    ])
    : [[], [], [], [], []];
  const bands = gradeBands(gradeRows);
  const marksByEnrollment = new Map<number, Map<number, number | null>>();
  const teacherRemarksByMark = new Map<string, string | null>();
  for (const mark of markRows) {
    const marks = marksByEnrollment.get(mark.enrollmentId) ?? new Map<number, number | null>();
    marks.set(mark.examSubjectId, mark.marks === null ? null : Number(mark.marks));
    marksByEnrollment.set(mark.enrollmentId, marks);
    teacherRemarksByMark.set(`${mark.enrollmentId}:${mark.examSubjectId}`, mark.teacherRemark);
  }
  const classRemarkByEnrollment = new Map(remarksRows.map((row) => [row.enrollmentId, row.remark]));
  const attendanceByEnrollment = new Map<number, { present: number; absent: number; late: number; excused: number; total: number }>();
  for (const entry of dailyAttendanceRows) {
    const counts = attendanceByEnrollment.get(entry.enrollmentId) ?? { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    if (entry.status === "present") counts.present += 1;
    else if (entry.status === "absent") counts.absent += 1;
    else if (entry.status === "late") counts.late += 1;
    else if (entry.status === "excused") counts.excused += 1;
    counts.total += 1;
    attendanceByEnrollment.set(entry.enrollmentId, counts);
  }
  const examAttendanceByEnrollment = new Map<number, { present: number; absent: number; late: number; excused: number }>();
  for (const entry of attendanceRows) {
    const counts = examAttendanceByEnrollment.get(entry.enrollmentId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    if (entry.status in counts) counts[entry.status as keyof typeof counts] += 1;
    examAttendanceByEnrollment.set(entry.enrollmentId, counts);
  }
  const results = resultRows.map((row) => {
    const marks = marksByEnrollment.get(row.enrollmentId) ?? new Map<number, number | null>();
    const complete = assessments.every((assessment) => typeof marks.get(assessment.id) === "number");
    const overall = complete ? calculateWeightedAverage(assessments.map((assessment) => ({
      marks: Number(marks.get(assessment.id)),
      maxMarks: Number(assessment.maxMarks),
      weight: Number(assessment.weight),
    }))) : null;
    return {
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      studentPublicId: row.studentPublicId,
      photoUrl: canViewPhotos && row.profilePhoto?.profilePhoto?.objectKey && row.profilePhoto.profilePhoto.fileName
        ? `/api/admin/students/${row.studentPublicId}/photo`
        : null,
      name: `${row.firstName} ${row.lastName}`,
      firstName: row.firstName,
      lastName: row.lastName,
      admissionNumber: row.admissionNumber,
      rollNumber: row.rollNumber,
      sectionName: row.sectionName,
      className: examClass?.className ?? "",
      marks,
      overall,
      complete,
      grade: overall ? gradeForPercentage(overall.percentage, bands) : null,
      classRemark: classRemarkByEnrollment.get(row.enrollmentId) ?? null,
      attendance: attendanceByEnrollment.get(row.enrollmentId) ?? { present: 0, absent: 0, late: 0, excused: 0, total: 0 },
      examAttendance: examAttendanceByEnrollment.get(row.enrollmentId) ?? { present: 0, absent: 0, late: 0, excused: 0 },
    };
  });
  const ranking = examDetails?.allowRanking
    ? rankScores(results.flatMap((row) => row.overall ? [{ id: row.enrollmentId, score: row.overall.percentage }] : []))
    : new Map<number, number>();
  const activeResult = results.find((row) => row.enrollmentId === requestedEnrollmentId) ?? null;
  const reportIsReady = !!examDetails && examDetails.status === "published";
  const canPrintBulkCards = reportType === "progress-card" || reportType === "progress-card-100-percent";
  const showFeeBalance = context.grantedPermissions.includes("payments.record") ||
    context.grantedPermissions.includes("fees.manage");
  const feeBalanceByStudent = new Map<number, number>();
  if (showFeeBalance && canPrintBulkCards && results.length && examDetails) {
    const invoices = await db.select({
      id: studentFeeInvoices.id,
      studentId: studentFeeInvoices.studentId,
      amount: studentFeeInvoices.amount,
      discountAmount: studentFeeInvoices.discountAmount,
      fineType: studentFeeInvoices.fineType,
      fineValue: studentFeeInvoices.fineValue,
      dueDate: studentFeeInvoices.dueDate,
    }).from(studentFeeInvoices).where(and(
      eq(studentFeeInvoices.schoolId, context.schoolId),
      inArray(studentFeeInvoices.studentId, [...new Set(results.map((row) => row.studentId))]),
    ));
    const paymentRows = invoices.length
      ? await db.select({
        invoiceId: feePayments.invoiceId,
        amount: feePayments.amount,
        reversedAmount: feePayments.reversedAmount,
      }).from(feePayments).where(and(
        eq(feePayments.schoolId, context.schoolId),
        inArray(feePayments.invoiceId, invoices.map((invoice) => invoice.id)),
      ))
      : [];
    const paidByInvoice = new Map<number, number>();
    for (const payment of paymentRows) {
      const amount = parseMoneyToMinorUnits(payment.amount);
      const reversed = parseMoneyToMinorUnits(payment.reversedAmount);
      if (amount === null || reversed === null || reversed > amount) {
        throw new Error("Stored fee payment or reversal amount is invalid.");
      }
      const netPaid = (paidByInvoice.get(payment.invoiceId) ?? 0) + amount - reversed;
      if (!Number.isSafeInteger(netPaid)) throw new Error("Stored fee payment total exceeds the supported range.");
      paidByInvoice.set(payment.invoiceId, netPaid);
    }
    const today = todayInTimezone(examDetails.schoolTimezone);
    for (const invoice of invoices) {
      const balance = calculateOutstandingInvoiceBalance({
        ...invoice,
        paidMinor: paidByInvoice.get(invoice.id) ?? 0,
        today,
      });
      if (balance === null) throw new Error("Stored fee invoice balance is invalid.");
      const total = (feeBalanceByStudent.get(invoice.studentId) ?? 0) + balance;
      if (!Number.isSafeInteger(total)) throw new Error("Outstanding fee balance exceeds the supported range.");
      feeBalanceByStudent.set(invoice.studentId, total);
    }
  }
  const routineRows = reportType === "exam-routine" ? assessments : [];
  const needsStudent = reportType === "mark-sheet";
  const printOrientation = reportType === "exam-routine" || reportType === "tabulation-sheet" ||
    reportType === "merit-list" || reportType === "previous-result" || reportType === "subject-wise-marksheet"
    ? "landscape" : "portrait";

  const previousExamRows = reportType === "previous-result" && examDetails && examClass
    ? await db.select({
      examId: examinations.id,
      examClassId: examClasses.id,
      name: examinations.name,
      startDate: examinations.startDate,
      yearName: academicYears.name,
    }).from(examClasses)
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.status, "published"),
        lt(examinations.startDate, examDetails.startDate),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, examinations.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examClasses.schoolId, context.schoolId),
        eq(examClasses.classLevelId, examClass.classLevelId),
      ))
      .orderBy(desc(examinations.startDate))
    : [];
  const previousAssessmentRows = previousExamRows.length
    ? await db.select({
      examId: examinations.id,
      examClassId: examClasses.id,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
        inArray(examClasses.id, previousExamRows.map((row) => row.examClassId)),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.status, "published"),
      ))
      .where(and(
        eq(examSubjects.schoolId, context.schoolId),
        eq(examSubjects.status, "published"),
      ))
    : [];
  const previousSubjectCounts = new Map<number, number>();
  for (const assessment of previousAssessmentRows) {
    previousSubjectCounts.set(assessment.examId, (previousSubjectCounts.get(assessment.examId) ?? 0) + 1);
  }
  const previousMarkRows = previousExamRows.length && results.length
    ? await db.select({
      studentId: studentEnrollments.studentId,
      examId: examinations.id,
      marks: examMarks.marks,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
    }).from(examMarks)
      .innerJoin(examSubjects, and(
        eq(examSubjects.id, examMarks.examSubjectId),
        eq(examSubjects.schoolId, context.schoolId),
        eq(examSubjects.status, "published"),
      ))
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
        inArray(examClasses.id, previousExamRows.map((row) => row.examClassId)),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .innerJoin(studentEnrollments, and(
        eq(studentEnrollments.id, examMarks.enrollmentId),
        eq(studentEnrollments.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(studentEnrollments.studentId, results.map((row) => row.studentId)),
        isNotNull(examMarks.marks),
      ))
    : [];
  const previousScores = new Map<string, Array<{ marks: number; maxMarks: number; weight: number }>>();
  for (const mark of previousMarkRows) {
    const key = `${mark.examId}:${mark.studentId}`;
    const scores = previousScores.get(key) ?? [];
    scores.push({ marks: Number(mark.marks), maxMarks: Number(mark.maxMarks), weight: Number(mark.weight) });
    previousScores.set(key, scores);
  }
  const previousExams = previousExamRows.slice(0, 6);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link href="/admin/examinations" className="text-sm font-semibold text-violet-700">← Examinations</Link>
          <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · Examination reports</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{definition.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{definition.description}</p>
        </div>
        {reportType !== "online-exam" && examDetails && examClass && (reportType === "exam-routine" || reportIsReady) && (
          <PrintButton
            label={canPrintBulkCards && !requestedEnrollmentId ? "Print all progress cards / Save PDF" : "Print / Save PDF"}
            targetId="exam-report-output"
            pageOrientation={printOrientation}
            pageSize="A4"
          />
        )}
      </header>

      <nav aria-label="Examination reports" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        {(Object.keys(reportDefinitions) as ReportType[]).map((type) => (
          <Link key={type} href={reportUrl(type, { examId: exam?.id, classId: examClass?.id })} aria-current={type === reportType ? "page" : undefined} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${type === reportType ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {reportDefinitions[type].title}
          </Link>
        ))}
      </nav>

      {isOnlineReport ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-950">Online exam tracking is not configured</h2>
          <p className="mt-2 text-sm text-amber-900">SchoolOS currently records in-person exam schedules, attendance and marks. It has no online exam attempt or submission records, so this report cannot show online attempts or scores yet.</p>
        </section>
      ) : (
        <>
          <form method="get" className="grid max-w-6xl gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
            <label className="min-w-0 text-sm font-medium">Examination
              <select name="examId" defaultValue={exam?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                <option value="">Select an exam</option>
                {examOptions.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.yearName}{option.status !== "published" ? ` · ${option.status}` : ""}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-sm font-medium">Class
              <select name="classId" defaultValue={examClass?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                <option value="">Select a class</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.className}</option>)}
              </select>
            </label>
            {reportType === "subject-wise-marksheet" && (
              <label className="min-w-0 text-sm font-medium">Subject
                <select name="subjectId" defaultValue={selectedSubject?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                  <option value="">Select a subject</option>
                  {assessments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
            {needsStudent && (
              <label className="min-w-0 text-sm font-medium">Student
                <select name="enrollmentId" defaultValue={activeResult?.enrollmentId ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                  <option value="">Select a student</option>
                  {results.map((row) => <option key={row.enrollmentId} value={row.enrollmentId}>{row.name}{row.admissionNumber ? ` · ${row.admissionNumber}` : ""}</option>)}
                </select>
              </label>
            )}
            <div className="flex items-end gap-2">
              <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Generate report</button>
              <Link href={`/admin/examinations/report-center/${reportType}`} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700">Reset</Link>
            </div>
          </form>

          {reportType === "exam-routine" && (
            <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
              {examDetails && examClass ? (
                <>
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} title={`${examDetails.name} · Exam Routine`} subtitle={`${examClass.className} · ${examDetails.yearName} · ${examDetails.startDate} – ${examDetails.endDate}`} />
                  <table className="print-report-table w-full border-collapse text-left text-sm">
                    <thead><tr><th>Date</th><th>Subject</th><th>Assessment</th><th>Maximum marks</th><th>Weight</th></tr></thead>
                    <tbody>{routineRows.map((item) => <tr key={item.id}><td>{item.examDate}</td><td>{item.name} <span className="text-xs text-slate-500">{item.code}</span></td><td>{examDetails.name}</td><td>{item.maxMarks}</td><td>{item.weight}</td></tr>)}</tbody>
                  </table>
                  {routineRows.length === 0 && <p className="text-sm text-slate-600">No scheduled subjects are configured for this class.</p>}
                </>
              ) : <p className="text-sm text-slate-600">Select an examination and class to create the routine.</p>}
            </section>
          )}

          {hasResults && !reportIsReady && examDetails && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 print:hidden">Reports unlock after the examination is published. Draft marks are not shown here.</p>
          )}

          {reportIsReady && examDetails && examClass && (
            <>
              {reportType === "merit-list" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} title={`${examDetails.name} · Merit List`} subtitle={`${examClass.className} · Sections: ${sectionSummary || "—"} · ${examDetails.yearName} · ${results.filter((row) => row.complete).length} complete results`} />
                  {!examDetails.allowRanking && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Ranking is disabled for this grading scale. Students are listed alphabetically.</p>}
                  <table className="print-report-table w-full border-collapse text-left text-sm">
                    <thead><tr><th>Position</th><th>Student</th><th>Section</th><th>Admission no.</th><th>Total</th><th>Average</th><th>Grade</th></tr></thead>
                    <tbody>{[...results].filter((row) => row.complete).sort((a, b) => examDetails.allowRanking ? (ranking.get(a.enrollmentId) ?? 99999) - (ranking.get(b.enrollmentId) ?? 99999) : a.name.localeCompare(b.name)).map((row) => (
                      <tr key={row.enrollmentId}><td>{examDetails.allowRanking ? ranking.get(row.enrollmentId) ?? "—" : "—"}</td><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td><td>{row.overall?.totalMarks.toFixed(2)} / {row.overall?.maxMarks.toFixed(2)}</td><td>{row.overall?.percentage.toFixed(2)}%</td><td>{row.grade?.grade ?? "—"} {row.grade?.description}</td></tr>
                    ))}</tbody>
                  </table>
                </section>
              )}

              {reportType === "mark-sheet" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  {activeResult ? (
                    <>
                      <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} title="Student Mark Sheet" subtitle={`${examDetails.name} · ${examDetails.termName ?? examDetails.yearName}`} />
                      <section className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                        <p><b>Student</b><br />{activeResult.name}</p><p><b>Admission no.</b><br />{activeResult.admissionNumber ?? "—"}</p>
                        <p><b>Class / section</b><br />{examClass.className} · {activeResult.sectionName}</p><p><b>Academic year</b><br />{examDetails.yearName}</p>
                      </section>
                      <table className="print-report-table w-full border-collapse text-left text-sm">
                        <thead><tr><th>Subject</th><th>Marks</th><th>Percentage</th><th>Grade</th><th>Teacher remark</th></tr></thead>
                        <tbody>{assessments.map((item) => {
                          const mark = activeResult.marks.get(item.id);
                          const percentage = typeof mark === "number" ? mark / Number(item.maxMarks) * 100 : null;
                          const band = percentage === null ? null : gradeForPercentage(percentage, bands);
                          const teacherRemark = teacherRemarksByMark.get(`${activeResult.enrollmentId}:${item.id}`);
                          return <tr key={item.id}><td>{item.name}</td><td>{formatMarks(mark)} / {item.maxMarks}</td><td>{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</td><td>{band?.grade ?? "—"}</td><td>{teacherRemark || (band?.performanceRemark ? `Suggested: ${band.performanceRemark}` : "—")}</td></tr>;
                        })}</tbody>
                        <tfoot><tr><td>Overall</td><td>{activeResult.overall ? `${activeResult.overall.totalMarks.toFixed(2)} / ${activeResult.overall.maxMarks.toFixed(2)}` : "Incomplete"}</td><td>{activeResult.overall ? `${activeResult.overall.percentage.toFixed(2)}%` : "—"}</td><td>{activeResult.grade?.grade ?? "—"}</td><td>{activeResult.grade?.performanceRemark ?? ""}</td></tr></tfoot>
                      </table>
                    </>
                  ) : <p className="text-sm text-slate-600">Select a student to generate their marksheet.</p>}
                </section>
              )}

              {reportType === "subject-wise-marksheet" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  {selectedSubject ? (
                    <>
                      <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} title={`${selectedSubject.name} · Subject Marksheet`} subtitle={`${examDetails.name} · ${examClass.className} · Sections: ${sectionSummary || "—"} · Maximum ${selectedSubject.maxMarks}`} />
                      <table className="print-report-table w-full border-collapse text-left text-sm">
                        <thead><tr><th>Roll no.</th><th>Student</th><th>Section</th><th>Admission no.</th><th>Marks</th><th>Percentage</th><th>Grade</th></tr></thead>
                        <tbody>{results.map((row) => {
                          const mark = row.marks.get(selectedSubject.id);
                          const percentage = typeof mark === "number" ? mark / Number(selectedSubject.maxMarks) * 100 : null;
                          const band = percentage === null ? null : gradeForPercentage(percentage, bands);
                          return <tr key={row.enrollmentId}><td>{row.rollNumber ?? "—"}</td><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td><td>{formatMarks(mark)} / {selectedSubject.maxMarks}</td><td>{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</td><td>{band?.grade ?? "—"}</td></tr>;
                        })}</tbody>
                      </table>
                    </>
                  ) : <p className="text-sm text-slate-600">Select a subject to generate its marksheet.</p>}
                </section>
              )}

              {reportType === "tabulation-sheet" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} title={`${examDetails.name} · Tabulation Sheet`} subtitle={`${examClass.className} · Sections: ${sectionSummary || "—"} · ${examDetails.termName ?? examDetails.yearName}`} />
                  <div className="overflow-x-auto">
                    <table className="print-report-table w-full border-collapse text-left text-xs">
                      <thead><tr><th>Position</th><th>Student</th><th>Section</th><th>Admission no.</th>{assessments.map((item) => <th key={item.id}>{item.name} / {item.maxMarks}</th>)}<th>Total</th><th>Average</th><th>Grade</th></tr></thead>
                      <tbody>{results.map((row) => <tr key={row.enrollmentId}><td>{examDetails.allowRanking ? ranking.get(row.enrollmentId) ?? "—" : "—"}</td><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td>{assessments.map((item) => <td key={item.id}>{formatMarks(row.marks.get(item.id))}</td>)}<td>{row.overall ? `${row.overall.totalMarks.toFixed(2)} / ${row.overall.maxMarks.toFixed(2)}` : "Incomplete"}</td><td>{row.overall ? `${row.overall.percentage.toFixed(2)}%` : "—"}</td><td>{row.grade?.grade ?? "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              )}

              {canPrintBulkCards && (
                <section id="exam-report-output" className="print-report-content space-y-5">
                  {requestedEnrollmentId && activeResult ? (
                    <ProgressCard
                      row={activeResult}
                      exam={{ name: examDetails.name, yearName: examDetails.yearName, termName: examDetails.termName, allowRanking: examDetails.allowRanking, assessments }}
                      bands={bands}
                      position={ranking.get(activeResult.enrollmentId) ?? null}
                      attendance={activeResult.attendance}
                      classRemark={activeResult.classRemark}
                      principalRemark={examClass.principalRemark}
                      showPercentages={reportType === "progress-card-100-percent"}
                      schoolName={examDetails.schoolName}
                      schoolLogoUrl={examDetails.schoolLogoUrl}
                      schoolAddress={examDetails.schoolAddress}
                      schoolPhone={examDetails.schoolPhone}
                      schoolEmail={examDetails.schoolEmail}
                      currency={examDetails.schoolCurrency}
                      feeBalanceMinor={feeBalanceByStudent.get(activeResult.studentId) ?? 0}
                      showFeeBalance={showFeeBalance}
                      last
                    />
                  ) : (
                    results.filter((row) => row.complete).map((row, index, completeRows) => (
                      <ProgressCard
                        key={row.enrollmentId}
                        row={row}
                        exam={{ name: examDetails.name, yearName: examDetails.yearName, termName: examDetails.termName, allowRanking: examDetails.allowRanking, assessments }}
                        bands={bands}
                        position={ranking.get(row.enrollmentId) ?? null}
                        attendance={row.attendance}
                        classRemark={row.classRemark}
                        principalRemark={examClass.principalRemark}
                        showPercentages={reportType === "progress-card-100-percent"}
                        schoolName={examDetails.schoolName}
                        schoolLogoUrl={examDetails.schoolLogoUrl}
                        schoolAddress={examDetails.schoolAddress}
                        schoolPhone={examDetails.schoolPhone}
                        schoolEmail={examDetails.schoolEmail}
                        currency={examDetails.schoolCurrency}
                        feeBalanceMinor={feeBalanceByStudent.get(row.studentId) ?? 0}
                        showFeeBalance={showFeeBalance}
                        last={index === completeRows.length - 1}
                      />
                    ))
                  )}
                  {results.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 print:hidden">No enrolled students are available for this class.</p>}
                  {results.length > 0 && results.every((row) => !row.complete) && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 print:hidden">No complete result cards are available. Incomplete exam records are excluded.</p>}
                  <div className="print:hidden flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <p className="w-full text-sm text-slate-600">Bulk printing includes only students with complete published marks. Choose a student for an individual card.</p>
                    {results.filter((row) => row.complete).map((row) => (
                      <Link key={row.enrollmentId} href={reportUrl(reportType, { examId: examDetails.id, classId: examClass.id, enrollmentId: row.enrollmentId })} className="rounded-lg border px-3 py-2 text-xs font-semibold text-violet-800">{row.name} · Print individually</Link>
                    ))}
                  </div>
                </section>
              )}

              {reportType === "previous-result" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} title={`${examClass.className} · Previous Results`} subtitle={`Sections: ${sectionSummary || "—"} · Published examinations before ${examDetails.name}`} />
                  {previousExams.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="print-report-table w-full border-collapse text-left text-xs">
                        <thead><tr><th>Student</th><th>Section</th><th>Admission no.</th>{previousExams.map((item) => <th key={item.examId}>{item.name}<span className="block font-normal">{item.yearName}</span></th>)}</tr></thead>
                        <tbody>{results.map((row) => <tr key={row.enrollmentId}><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td>{previousExams.map((item) => {
                          const scores = previousScores.get(`${item.examId}:${row.studentId}`) ?? [];
                          const overall = scores.length === previousSubjectCounts.get(item.examId)
                            ? calculateWeightedAverage(scores)
                            : null;
                          return <td key={item.examId}>{overall ? `${overall.percentage.toFixed(2)}%` : "—"}</td>;
                        })}</tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-slate-600">No earlier published results are available for this class.</p>}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
