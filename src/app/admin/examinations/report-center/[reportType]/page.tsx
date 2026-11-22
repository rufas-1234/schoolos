import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examAttendance,
  examGradeBands,
  examGradingScales,
  examMarks,
  examReportSignatures,
  examStudentRemarks,
  examSubjects,
  examTypes,
  examinations,
  feePayments,
  schools,
  staffMembers,
  studentEnrollments,
  studentFeeInvoices,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolLogoSource } from "@/lib/school-logo";
import { ReportSignatureStrip } from "@/app/admin/examinations/signatures/report-signature-strip";
import {
  canViewExamSubject,
  calculateWeightedAverage,
  examAssessmentResultState,
  gradeForPercentage,
  hasCompleteExamResult,
  rankScores,
  sortExamResultsByRank,
  type GradeBand,
} from "@/lib/examination-policy";
import {
  calculateOutstandingInvoiceBalance,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";
import {
  examRemarkVariantIndex,
  resolveExamReportRemark,
} from "@/lib/exam-report-remarks";
import { getDeputyHeadteacherSignatures, getExamTeacherSignatures } from "@/lib/exam-report-signatures";
import type { ExamTeacherSignature } from "@/lib/exam-report-signatures";

export const dynamic = "force-dynamic";
type ProgressAssessment = { id: number; name: string; maxMarks: string; weight: string; isCompulsory: boolean };

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

function assessmentStatusLabel(status: string | undefined, state: string | undefined): string {
  if (status === "not_applicable") return "Not taking";
  if (status === "x") return "X · Absent";
  if (status === "y") return "Y · Nullified (malpractice)";
  if (status === "absent") return "Absent";
  if (status === "excused") return "Excused";
  if (state === "missing") return "Missing mark";
  if (state === "no-result") return "No result";
  return "—";
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
  schoolAddress,
  schoolEmail,
  schoolPhone,
  title,
  subtitle,
}: {
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  title: string;
  subtitle: string;
}) {
  const logoSrc = schoolLogoSource(schoolLogoUrl);
  return (
    <header className="exam-report-heading flex items-center gap-4">
      {logoSrc && <Image src={logoSrc} unoptimized width={64} height={64} alt={`${schoolName} logo`} className="exam-report-school-logo h-16 w-16 object-contain" />}
      <div className="min-w-0 flex-1">
        <p className="exam-report-school-name text-sm font-bold uppercase tracking-wide text-slate-700">{schoolName}</p>
        {(schoolAddress || schoolPhone || schoolEmail) && (
          <p className="exam-report-school-contact mt-0.5 text-xs text-slate-600">
            {[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join(" · ")}
          </p>
        )}
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
  remarkVariantIndex,
  classRemark,
  principalRemark,
  showPercentages,
  teacherSignatures,
  schoolName,
  schoolLogoUrl,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  signatures,
  currency,
  feeBalanceMinor,
  showFeeBalance,
  reportDate,
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
    assessmentStates: Map<number, string>;
    attendanceStatuses: Map<number, string>;
    overall: { totalMarks: number; maxMarks: number; percentage: number } | null;
    complete: boolean;
  };
  exam: { name: string; yearName: string; termName: string | null; allowRanking: boolean; assessments: ProgressAssessment[] };
  bands: GradeBand[];
  position: number | null;
  remarkVariantIndex: number;
  classRemark: string | null;
  principalRemark: string | null;
  showPercentages: boolean;
  teacherSignatures: ExamTeacherSignature[];
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  signatures: { role: string; updatedAt: Date }[];
  currency: string;
  feeBalanceMinor: number;
  showFeeBalance: boolean;
  reportDate: string;
  last: boolean;
}) {
  const overallGrade = row.overall ? gradeForPercentage(row.overall.percentage, bands) : null;
  const teacherFeedback = resolveExamReportRemark(classRemark, overallGrade, "classTeacher", remarkVariantIndex);
  const headteacherFeedback = resolveExamReportRemark(principalRemark, overallGrade, "headteacher", remarkVariantIndex);
  const strongestSubjects = exam.assessments
    .flatMap((assessment) => {
      const mark = row.marks.get(assessment.id);
      if (row.assessmentStates.get(assessment.id) !== "scored" || typeof mark !== "number") return [];
      const percentage = mark / Number(assessment.maxMarks) * 100;
      return [{
        assessment,
        percentage,
        grade: gradeForPercentage(percentage, bands)?.grade ?? "—",
      }];
    })
    .sort((a, b) => b.percentage - a.percentage || a.assessment.name.localeCompare(b.assessment.name))
    .slice(0, 4);
  const studentReference = row.admissionNumber || `Enrollment ${row.enrollmentId}`;
  const schoolLogo = schoolLogoSource(schoolLogoUrl);
  const completedSubjectCount = exam.assessments.filter((assessment) => row.assessmentStates.get(assessment.id) === "scored").length;
  return (
    <article className={`academic-progress-card a4-report-card${last ? " a4-report-card-last" : ""}`}>
      <header className="academic-progress-header">
        <div className="academic-progress-brand">
          {schoolLogo && <Image src={schoolLogo} unoptimized width={76} height={76} alt={`${schoolName} logo`} className="academic-progress-logo" />}
          <div className="academic-progress-school">
            <p>{schoolName}</p>
            <span>{[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div className="academic-progress-title">
          <h2>Progress Report</h2>
          <p>{exam.name} · {exam.termName ?? exam.yearName}</p>
          <span>Academic performance report</span>
        </div>
        {row.photoUrl ? (
          <Image src={row.photoUrl} unoptimized width={76} height={88} alt={`${row.name} photo`} className="academic-progress-photo" />
        ) : <div className="academic-progress-photo-placeholder">Student<br />photo</div>}
      </header>

      <section className="academic-progress-overview">
        <div className="academic-progress-student">
          <h3>Student information</h3>
          <ReportField label="Student name" value={row.name} />
          <ReportField label="Student reference" value={studentReference} />
          <ReportField label="Class / section" value={`${row.className} · ${row.sectionName}`} />
          <ReportField label="Roll number" value={row.rollNumber ?? "—"} />
          <ReportField label="Academic year" value={exam.yearName} />
          <ReportField label="Examination" value={exam.name} />
          <ReportField label="Subjects completed" value={`${completedSubjectCount} of ${exam.assessments.length}`} />
          <ReportField label="Report date" value={reportDate} />
        </div>

        <div className="academic-progress-performance">
          <div className="academic-progress-section-title">
            <h3>Class performance profile</h3>
            {exam.allowRanking && <span>Class position · {position ?? "—"}</span>}
          </div>
          <div className="academic-progress-strengths">
            <h4>Subject performance profile</h4>
            {strongestSubjects.map(({ assessment, percentage, grade }) => (
              <div className="academic-progress-subject-score" key={assessment.id}>
                <span className="academic-progress-subject-name">{assessment.name}</span>
                <span className="academic-progress-subject-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} />
                </span>
                <strong>{percentage.toFixed(0)}%</strong>
                <span className="academic-progress-subject-grade">{grade}</span>
              </div>
            ))}
            {!strongestSubjects.length && <p className="academic-progress-empty">No published subject scores.</p>}
          </div>
        </div>
      </section>

      {bands.length > 0 && (
        <section className="academic-progress-grade-guide">
          <h3>Grade guide</h3>
          <div>
            {bands.map((band) => (
              <article key={`${band.grade}-${band.minPercent}`}>
                <strong>{band.grade}</strong>
                <span>{band.minPercent}–{band.maxPercent}%</span>
                <small>{band.description}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="academic-progress-assessment">
        <h3>Detailed assessment</h3>
        <div className="academic-progress-table-wrap">
          <table className="print-report-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>{showPercentages ? "Score (%)" : "Marks"}</th>
                {!showPercentages && <th>Score (%)</th>}
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>{exam.assessments.map((assessment) => {
              const mark = row.marks.get(assessment.id);
              const status = row.assessmentStates.get(assessment.id);
              const percentage = status === "scored" && typeof mark === "number"
                ? mark / Number(assessment.maxMarks) * 100
                : null;
              const band = percentage === null ? null : gradeForPercentage(percentage, bands);
              const scoreLabel = status === "scored" && typeof mark === "number"
                ? showPercentages && percentage !== null ? `${percentage.toFixed(2)}%`
                  : `${formatMarks(mark)} / ${assessment.maxMarks}`
                : assessmentStatusLabel(row.attendanceStatuses.get(assessment.id), status);
              return (
                <tr key={assessment.id}>
                  <td>{assessment.name}</td>
                  <td>{scoreLabel}</td>
                  {!showPercentages && <td>{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</td>}
                  <td>{band?.grade ?? "—"}{band?.description ? <span className="academic-progress-grade-description">{band.description}</span> : null}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="academic-progress-comments">
        <article>
          <h3>Teacher&apos;s feedback</h3>
          <p>{teacherFeedback || "No teacher comment recorded."}</p>
        </article>
        <article>
          <h3>Performance description</h3>
          <p>{overallGrade?.description || "Review the subject results above for this examination."}</p>
        </article>
        <article>
          <h3>Headteacher&apos;s remarks</h3>
          <p>{headteacherFeedback || "No headteacher comment recorded."}</p>
        </article>
      </section>
      <section className="exam-report-summary-grid grid gap-2 sm:grid-cols-2">
        <article className="exam-report-summary-card rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall performance</p>
          <strong className="mt-1 block text-xl text-slate-950">
            {row.overall ? `${row.overall.percentage.toFixed(1)}%` : "Incomplete"}
          </strong>
          <p className="mt-1 text-xs text-slate-600">
            {row.overall
              ? `${row.overall.totalMarks.toFixed(1)} / ${row.overall.maxMarks.toFixed(1)} marks · Grade ${overallGrade?.grade ?? "—"}`
              : "Published marks are incomplete"}
          </p>
        </article>
        {showFeeBalance && (
          <article className="exam-report-summary-card rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Outstanding fee balance</p>
            <strong className="mt-1 block text-lg text-slate-950">{currency} {(feeBalanceMinor / 100).toFixed(2)}</strong>
            <p className="mt-1 text-xs text-slate-600">Includes overdue fines and payments net of reversals.</p>
          </article>
        )}
      </section>
      <ReportSignatureStrip signatures={signatures} teacherSignatures={teacherSignatures} />
    </article>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <p className="academic-progress-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
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
  const isProgressCard = reportType === "progress-card" || reportType === "progress-card-100-percent";
  const configuredSignatures = await db.select({
    role: examReportSignatures.role,
    updatedAt: examReportSignatures.updatedAt,
  }).from(examReportSignatures)
    .where(and(
      eq(examReportSignatures.schoolId, context.schoolId),
      eq(examReportSignatures.role, "headteacher"),
    ));
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
            Assigned subjects only. Ask an exam manager for class results and report cards.
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
    termName: academicTerms.name,
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
      isCompulsory: classSubjects.isCompulsory,
      teacherId: classSubjects.teacherId,
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
  const assessments = subjectRows.filter((item) =>
    canViewExamSubject(context.grantedPermissions, assignedAssessmentIds?.has(item.id) ?? false),
  );
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
      classTeacherId: classSections.classTeacherId,
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
  const reportTeacherSignatures = await getExamTeacherSignatures(context.schoolId, [
    ...resultRows.map((row) => ({ teacherId: row.classTeacherId, role: "Class teacher" as const })),
    ...assessments.map((assessment) => ({ teacherId: assessment.teacherId, role: "Subject teacher" as const })),
  ]);
  const deputyHeadteacherSignatures = isProgressCard
    ? await getDeputyHeadteacherSignatures(context.schoolId)
    : [];
  const teacherSignaturesForStudent = (row: { classTeacherId: number | null }) =>
    reportTeacherSignatures.filter((signature) =>
     signature.role === "Subject teacher" ||
     signature.teacherId === row.classTeacherId,
    );
  const classTeacherSignatureForStudent = (row: { classTeacherId: number | null }) =>
    reportTeacherSignatures.filter((signature) =>
      signature.role === "Class teacher" && signature.teacherId === row.classTeacherId,
    );
  const sectionSummary = [...new Set(resultRows
    .filter((row) => !requestedEnrollmentId || row.enrollmentId === requestedEnrollmentId)
    .map((row) => row.sectionName))].join(", ");
  const canViewPhotos = context.grantedPermissions.includes("students.view");
  const [markRows, attendanceRows, gradeRows, remarksRows] = resultRows.length && assessments.length
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
        enrollmentId: examAttendance.enrollmentId,
        examSubjectId: examAttendance.examSubjectId,
        status: examAttendance.status,
      }).from(examAttendance).where(and(
        eq(examAttendance.schoolId, context.schoolId),
        inArray(examAttendance.enrollmentId, resultRows.map((row) => row.enrollmentId)),
        inArray(examAttendance.examSubjectId, assessments.map((row) => row.id)),
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
        enrollmentId: examStudentRemarks.enrollmentId,
        remark: examStudentRemarks.classTeacherRemark,
      }).from(examStudentRemarks).where(and(
        eq(examStudentRemarks.schoolId, context.schoolId),
        eq(examStudentRemarks.examClassId, examClass!.id),
        inArray(examStudentRemarks.enrollmentId, resultRows.map((row) => row.enrollmentId)),
      )),
    ])
    : [[], [], [], []];
  const bands = gradeBands(gradeRows);
  const marksByEnrollment = new Map<number, Map<number, number | null>>();
  const teacherRemarksByMark = new Map<string, string | null>();
  for (const mark of markRows) {
    const marks = marksByEnrollment.get(mark.enrollmentId) ?? new Map<number, number | null>();
    marks.set(mark.examSubjectId, mark.marks === null ? null : Number(mark.marks));
    marksByEnrollment.set(mark.enrollmentId, marks);
    teacherRemarksByMark.set(`${mark.enrollmentId}:${mark.examSubjectId}`, mark.teacherRemark);
  }
  const attendanceByEnrollment = new Map<number, Map<number, string>>();
  for (const attendance of attendanceRows) {
    const statuses = attendanceByEnrollment.get(attendance.enrollmentId) ?? new Map<number, string>();
    statuses.set(attendance.examSubjectId, attendance.status);
    attendanceByEnrollment.set(attendance.enrollmentId, statuses);
  }
  const classRemarkByEnrollment = new Map(remarksRows.map((row) => [row.enrollmentId, row.remark]));
  const results = resultRows.map((row) => {
    const marks = marksByEnrollment.get(row.enrollmentId) ?? new Map<number, number | null>();
    const attendanceStatuses = attendanceByEnrollment.get(row.enrollmentId) ?? new Map<number, string>();
    const assessmentStates = new Map(assessments.map((assessment) => [
      assessment.id,
      examAssessmentResultState({
        attendanceStatus: attendanceStatuses.get(assessment.id) ?? null,
        isCompulsory: assessment.isCompulsory,
        hasMark: marks.get(assessment.id) !== null && marks.has(assessment.id),
      }),
    ]));
    const complete = hasCompleteExamResult(assessmentStates.values());
    const overall = complete ? calculateWeightedAverage(assessments.flatMap((assessment) => {
      const mark = marks.get(assessment.id);
      return assessmentStates.get(assessment.id) === "scored" && typeof mark === "number"
        ? [{ marks: mark, maxMarks: Number(assessment.maxMarks), weight: Number(assessment.weight) }]
        : [];
    })) : null;
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
      classTeacherId: row.classTeacherId,
      className: examClass?.className ?? "",
      marks,
      assessmentStates,
      attendanceStatuses,
      overall,
      complete,
      grade: overall ? gradeForPercentage(overall.percentage, bands) : null,
      classRemark: classRemarkByEnrollment.get(row.enrollmentId) ?? null,
    };
  });
  const ranking = examDetails?.allowRanking
    ? rankScores(results.flatMap((row) => row.overall ? [{ id: row.enrollmentId, score: row.overall.percentage }] : []))
    : new Map<number, number>();
  const orderedResults = sortExamResultsByRank(results, ranking);
  const reportResults = requestedEnrollmentId
    ? results.filter((row) => row.enrollmentId === requestedEnrollmentId)
    : results;
  const reportOrderedResults = orderedResults.filter((row) =>
    !requestedEnrollmentId || row.enrollmentId === requestedEnrollmentId,
  );
  const meritResults = reportOrderedResults.filter((row) => row.complete);
  if (!examDetails?.allowRanking) meritResults.sort((first, second) => first.name.localeCompare(second.name));
  const activeResult = results.find((row) => row.enrollmentId === requestedEnrollmentId) ?? null;
  const reportIsReady = !!examDetails && examDetails.status === "published";
  const canPrintBulkCards = isProgressCard;
  const showFeeBalance = context.grantedPermissions.includes("fees.balance.view") ||
    context.grantedPermissions.includes("payments.record") ||
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
    <main className="exam-report-document mx-auto max-w-7xl space-y-6 p-6">
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
          <Link key={type} href={reportUrl(type, { examId: exam?.id, classId: examClass?.id, enrollmentId: activeResult?.enrollmentId })} aria-current={type === reportType ? "page" : undefined} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${type === reportType ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {reportDefinitions[type].title}
          </Link>
        ))}
        <Link href="/admin/examinations/report-center/annual-progress-card" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Annual Progress Card Report
        </Link>
      </nav>

      {isOnlineReport ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-950">Online exam tracking is not configured</h2>
          <p className="mt-2 text-sm text-amber-900">Online attempts aren&apos;t recorded; this report covers in-person schedules, attendance, and marks.</p>
        </section>
      ) : (
        <>
          <SmartFilterForm method="get" className="grid max-w-6xl gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
            <SearchableSelect label="Examination" name="examId" defaultValue={String(exam?.id ?? "")} required
              options={[{ value: "", label: "Select an exam" }, ...examOptions.map((option) => ({ value: String(option.id), label: `${option.name} · ${option.yearName}${option.status !== "published" ? ` · ${option.status}` : ""}` }))]}
              placeholder="Search examinations..." />
            <SearchableSelect label="Class" name="classId" defaultValue={String(examClass?.id ?? "")} required
              options={[{ value: "", label: "Select a class" }, ...classes.map((item) => ({ value: String(item.id), label: item.className }))]}
              placeholder="Search classes..." />
            {reportType === "subject-wise-marksheet" && (
              <SearchableSelect label="Subject" name="subjectId" defaultValue={String(selectedSubject?.id ?? "")} required
                options={[{ value: "", label: "Select a subject" }, ...assessments.map((item) => ({ value: String(item.id), label: item.name }))]}
                placeholder="Search subjects..." />
            )}
            {hasResults && (
              <SearchableSelect label="Student" name="enrollmentId" defaultValue={String(activeResult?.enrollmentId ?? "")} required={needsStudent} disabled={!results.length}
                options={[{ value: "", label: "Select a student" }, ...results.map((row) => ({ value: String(row.enrollmentId), label: `${row.name}${row.admissionNumber ? ` · ${row.admissionNumber}` : ""}` }))]}
                placeholder={results.length ? "Search students..." : "Select an exam and class first"} />
            )}
            <div className="flex items-end gap-2">
              <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Generate report</button>
              <Link href={`/admin/examinations/report-center/${reportType}`} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700">Reset</Link>
            </div>
          </SmartFilterForm>

          {reportType === "exam-routine" && (
            <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
              {examDetails && examClass ? (
                <>
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} schoolAddress={examDetails.schoolAddress} schoolPhone={examDetails.schoolPhone} schoolEmail={examDetails.schoolEmail} title={`${examDetails.name} · Exam Routine`} subtitle={`${examClass.className} · ${examDetails.yearName} · ${examDetails.startDate} – ${examDetails.endDate}`} />
                  <table className="print-report-table w-full border-collapse text-left text-sm">
                    <thead><tr><th>Date</th><th>Subject</th><th>Assessment</th><th>Maximum marks</th><th>Weight</th></tr></thead>
                    <tbody>{routineRows.map((item) => <tr key={item.id}><td>{item.examDate}</td><td>{item.name} <span className="text-xs text-slate-500">{item.code}</span></td><td>{examDetails.name}</td><td>{item.maxMarks}</td><td>{item.weight}</td></tr>)}</tbody>
                  </table>
                  {routineRows.length === 0 && <p className="text-sm text-slate-600">No scheduled subjects are configured for this class.</p>}
                  <ReportSignatureStrip signatures={configuredSignatures} teacherSignatures={reportTeacherSignatures} />
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
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} schoolAddress={examDetails.schoolAddress} schoolPhone={examDetails.schoolPhone} schoolEmail={examDetails.schoolEmail} title={`${examDetails.name} · Merit List`} subtitle={`${examClass.className} · Sections: ${sectionSummary || "—"} · ${examDetails.yearName} · ${reportResults.filter((row) => row.complete).length} complete results`} />
                  {!examDetails.allowRanking && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Ranking is disabled for this grading scale. Students are listed alphabetically.</p>}
                  <table className="print-report-table w-full border-collapse text-left text-sm">
                    <thead><tr><th>Position</th><th>Student</th><th>Section</th><th>Admission no.</th>{assessments.map((item) => <th key={item.id}>{item.name} / {item.maxMarks}</th>)}<th>Total</th><th>Average</th><th>Grade</th><th>Comments</th></tr></thead>
                    <tbody>{meritResults.map((row) => (
                      <tr key={row.enrollmentId}>
                        <td>{examDetails.allowRanking ? ranking.get(row.enrollmentId) ?? "—" : "—"}</td>
                        <td>{row.name}</td>
                        <td>{row.sectionName}</td>
                        <td>{row.admissionNumber ?? "—"}</td>
                        {assessments.map((item) => {
                          const mark = row.marks.get(item.id);
                          const state = row.assessmentStates.get(item.id);
                          const label = state === "scored" && typeof mark === "number"
                            ? `${formatMarks(mark)} / ${item.maxMarks}`
                            : assessmentStatusLabel(row.attendanceStatuses.get(item.id), state);
                          return <td key={item.id}>{label}</td>;
                        })}
                        <td>{row.overall?.totalMarks.toFixed(2)} / {row.overall?.maxMarks.toFixed(2)}</td>
                        <td>{row.overall?.percentage.toFixed(2)}%</td>
                        <td>{row.grade?.grade ?? "—"} {row.grade?.description}</td>
                        <td className="exam-report-comment">
                          <p><b>Class teacher:</b> {resolveExamReportRemark(row.classRemark, row.grade, "classTeacher", examRemarkVariantIndex(row.enrollmentId)) ?? "—"}</p>
                          <p className="mt-1"><b>Headteacher:</b> {resolveExamReportRemark(examClass.principalRemark, row.grade, "headteacher", examRemarkVariantIndex(row.enrollmentId)) ?? "—"}</p>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <ReportSignatureStrip signatures={configuredSignatures} teacherSignatures={reportTeacherSignatures} />
                </section>
              )}

              {reportType === "mark-sheet" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  {activeResult ? (
                    <>
                      <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} schoolAddress={examDetails.schoolAddress} schoolPhone={examDetails.schoolPhone} schoolEmail={examDetails.schoolEmail} title="Student Mark Sheet" subtitle={`${examDetails.name} · ${examDetails.termName ?? examDetails.yearName}`} />
                      <section className="exam-report-student-details grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                        <p><b>Student</b><br />{activeResult.name}</p><p><b>Admission no.</b><br />{activeResult.admissionNumber ?? "—"}</p>
                        <p><b>Class / section</b><br />{examClass.className} · {activeResult.sectionName}</p><p><b>Academic year</b><br />{examDetails.yearName}</p>
                      </section>
                      <table className="print-report-table w-full border-collapse text-left text-sm">
                        <thead><tr><th>Subject</th><th>Marks</th><th>Percentage</th><th>Grade</th><th>Teacher remark</th></tr></thead>
                        <tbody>{assessments.map((item) => {
                          const mark = activeResult.marks.get(item.id);
                          const state = activeResult.assessmentStates.get(item.id);
                          const percentage = state === "scored" && typeof mark === "number"
                            ? mark / Number(item.maxMarks) * 100
                            : null;
                          const band = percentage === null ? null : gradeForPercentage(percentage, bands);
                          const teacherRemark = teacherRemarksByMark.get(`${activeResult.enrollmentId}:${item.id}`);
                          const marksLabel = state === "scored" && typeof mark === "number"
                            ? `${formatMarks(mark)} / ${item.maxMarks}`
                            : assessmentStatusLabel(activeResult.attendanceStatuses.get(item.id), state);
                          return <tr key={item.id}><td>{item.name}</td><td>{marksLabel}</td><td>{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</td><td>{band?.grade ?? "—"}</td><td>{teacherRemark || band?.performanceRemark || "—"}</td></tr>;
                        })}</tbody>
                        <tfoot><tr><td>Overall</td><td>{activeResult.overall ? `${activeResult.overall.totalMarks.toFixed(2)} / ${activeResult.overall.maxMarks.toFixed(2)}` : "Incomplete"}</td><td>{activeResult.overall ? `${activeResult.overall.percentage.toFixed(2)}%` : "—"}</td><td>{activeResult.grade?.grade ?? "—"}</td><td>{activeResult.grade?.performanceRemark ?? ""}</td></tr></tfoot>
                      </table>
                      <ReportSignatureStrip signatures={configuredSignatures} teacherSignatures={activeResult ? teacherSignaturesForStudent(resultRows.find((row) => row.enrollmentId === activeResult.enrollmentId)!) : reportTeacherSignatures} />
                    </>
                  ) : <p className="text-sm text-slate-600">Select a student to generate their marksheet.</p>}
                </section>
              )}

              {reportType === "subject-wise-marksheet" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  {selectedSubject ? (
                    <>
                      <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} schoolAddress={examDetails.schoolAddress} schoolPhone={examDetails.schoolPhone} schoolEmail={examDetails.schoolEmail} title={`${selectedSubject.name} · Subject Marksheet`} subtitle={`${examDetails.name} · ${examClass.className} · Sections: ${sectionSummary || "—"} · Maximum ${selectedSubject.maxMarks}`} />
                      <table className="print-report-table w-full border-collapse text-left text-sm">
                        <thead><tr><th>Roll no.</th><th>Student</th><th>Section</th><th>Admission no.</th><th>Marks</th><th>Percentage</th><th>Grade</th></tr></thead>
                        <tbody>{reportResults.map((row) => {
                          const mark = row.marks.get(selectedSubject.id);
                          const state = row.assessmentStates.get(selectedSubject.id);
                          const percentage = state === "scored" && typeof mark === "number"
                            ? mark / Number(selectedSubject.maxMarks) * 100
                            : null;
                          const band = percentage === null ? null : gradeForPercentage(percentage, bands);
                          const marksLabel = state === "scored" && typeof mark === "number"
                            ? `${formatMarks(mark)} / ${selectedSubject.maxMarks}`
                            : assessmentStatusLabel(row.attendanceStatuses.get(selectedSubject.id), state);
                          return <tr key={row.enrollmentId}><td>{row.rollNumber ?? "—"}</td><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td><td>{marksLabel}</td><td>{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</td><td>{band?.grade ?? "—"}</td></tr>;
                        })}</tbody>
                      </table>
                      <ReportSignatureStrip signatures={configuredSignatures} teacherSignatures={reportTeacherSignatures.filter((signature) => signature.role === "Class teacher" || signature.teacherId === selectedSubject.teacherId)} />
                    </>
                  ) : <p className="text-sm text-slate-600">Select a subject to generate its marksheet.</p>}
                </section>
              )}

              {reportType === "tabulation-sheet" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} schoolAddress={examDetails.schoolAddress} schoolPhone={examDetails.schoolPhone} schoolEmail={examDetails.schoolEmail} title={`${examDetails.name} · Tabulation Sheet`} subtitle={`${examClass.className} · Sections: ${sectionSummary || "—"} · ${examDetails.termName ?? examDetails.yearName}`} />
                  <div className="overflow-x-auto">
                    <table className="print-report-table w-full border-collapse text-left text-xs">
                      <thead><tr><th>Position</th><th>Student</th><th>Section</th><th>Admission no.</th>{assessments.map((item) => <th key={item.id}>{item.name} / {item.maxMarks}</th>)}<th>Total</th><th>Average</th><th>Grade</th></tr></thead>
                      <tbody>{reportOrderedResults.map((row) => <tr key={row.enrollmentId}><td>{examDetails.allowRanking ? ranking.get(row.enrollmentId) ?? "—" : "—"}</td><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td>{assessments.map((item) => {
                        const mark = row.marks.get(item.id);
                        const state = row.assessmentStates.get(item.id);
                        const label = state === "scored" && typeof mark === "number"
                          ? formatMarks(mark)
                          : assessmentStatusLabel(row.attendanceStatuses.get(item.id), state);
                        return <td key={item.id}>{label}</td>;
                      })}<td>{row.overall ? `${row.overall.totalMarks.toFixed(2)} / ${row.overall.maxMarks.toFixed(2)}` : "Incomplete"}</td><td>{row.overall ? `${row.overall.percentage.toFixed(2)}%` : "—"}</td><td>{row.grade?.grade ?? "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <ReportSignatureStrip signatures={configuredSignatures} teacherSignatures={reportTeacherSignatures} />
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
                      remarkVariantIndex={examRemarkVariantIndex(activeResult.enrollmentId)}
                      classRemark={activeResult.classRemark}
                      principalRemark={examClass.principalRemark}
                      showPercentages={reportType === "progress-card-100-percent"}
                      schoolName={examDetails.schoolName}
                      schoolLogoUrl={examDetails.schoolLogoUrl}
                      schoolAddress={examDetails.schoolAddress}
                      schoolPhone={examDetails.schoolPhone}
                      schoolEmail={examDetails.schoolEmail}
                      signatures={configuredSignatures}
                      teacherSignatures={[
                        ...classTeacherSignatureForStudent(activeResult),
                        ...deputyHeadteacherSignatures,
                      ]}
                      currency={examDetails.schoolCurrency}
                      feeBalanceMinor={feeBalanceByStudent.get(activeResult.studentId) ?? 0}
                      showFeeBalance={showFeeBalance}
                      reportDate={todayInTimezone(examDetails.schoolTimezone)}
                      last
                    />
                  ) : (
                    reportResults.filter((row) => row.complete).map((row, index, completeRows) => (
                      <ProgressCard
                        key={row.enrollmentId}
                        row={row}
                        exam={{ name: examDetails.name, yearName: examDetails.yearName, termName: examDetails.termName, allowRanking: examDetails.allowRanking, assessments }}
                        bands={bands}
                        position={ranking.get(row.enrollmentId) ?? null}
                        remarkVariantIndex={examRemarkVariantIndex(row.enrollmentId)}
                        classRemark={row.classRemark}
                        principalRemark={examClass.principalRemark}
                        showPercentages={reportType === "progress-card-100-percent"}
                        schoolName={examDetails.schoolName}
                        schoolLogoUrl={examDetails.schoolLogoUrl}
                        schoolAddress={examDetails.schoolAddress}
                        schoolPhone={examDetails.schoolPhone}
                        schoolEmail={examDetails.schoolEmail}
                        signatures={configuredSignatures}
                        teacherSignatures={[
                          ...classTeacherSignatureForStudent(row),
                          ...deputyHeadteacherSignatures,
                        ]}
                        currency={examDetails.schoolCurrency}
                        feeBalanceMinor={feeBalanceByStudent.get(row.studentId) ?? 0}
                        showFeeBalance={showFeeBalance}
                        reportDate={todayInTimezone(examDetails.schoolTimezone)}
                        last={index === completeRows.length - 1}
                      />
                    ))
                  )}
                  {reportResults.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 print:hidden">No enrolled students are available for this selection.</p>}
                  {reportResults.length > 0 && reportResults.every((row) => !row.complete) && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 print:hidden">No complete result cards are available. Incomplete exam records are excluded.</p>}
                  <div className="print:hidden flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <p className="w-full text-sm text-slate-600">Bulk printing includes only students with complete published marks. Choose a student for an individual card.</p>
                    {reportResults.filter((row) => row.complete).map((row) => (
                      <Link key={row.enrollmentId} href={reportUrl(reportType, { examId: examDetails.id, classId: examClass.id, enrollmentId: row.enrollmentId })} className="rounded-lg border px-3 py-2 text-xs font-semibold text-violet-800">{row.name} · Print individually</Link>
                    ))}
                  </div>
                </section>
              )}

              {reportType === "previous-result" && (
                <section id="exam-report-output" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
                  <ReportHeading schoolName={examDetails.schoolName} schoolLogoUrl={examDetails.schoolLogoUrl} schoolAddress={examDetails.schoolAddress} schoolPhone={examDetails.schoolPhone} schoolEmail={examDetails.schoolEmail} title={`${examClass.className} · Previous Results`} subtitle={`Sections: ${sectionSummary || "—"} · Published examinations before ${examDetails.name}`} />
                  {previousExams.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="print-report-table w-full border-collapse text-left text-xs">
                        <thead><tr><th>Student</th><th>Section</th><th>Admission no.</th>{previousExams.map((item) => <th key={item.examId}>{item.name}<span className="block font-normal">{item.yearName}</span></th>)}</tr></thead>
                        <tbody>{reportResults.map((row) => <tr key={row.enrollmentId}><td>{row.name}</td><td>{row.sectionName}</td><td>{row.admissionNumber ?? "—"}</td>{previousExams.map((item) => {
                          const scores = previousScores.get(`${item.examId}:${row.studentId}`) ?? [];
                          const overall = scores.length === previousSubjectCounts.get(item.examId)
                            ? calculateWeightedAverage(scores)
                            : null;
                          return <td key={item.examId}>{overall ? `${overall.percentage.toFixed(2)}%` : "—"}</td>;
                        })}</tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-slate-600">No earlier published results are available for this class.</p>}
                  <ReportSignatureStrip signatures={configuredSignatures} teacherSignatures={reportTeacherSignatures} />
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
