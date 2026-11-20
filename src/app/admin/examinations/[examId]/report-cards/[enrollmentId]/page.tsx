import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
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
import { PrintButton } from "@/components/print-button";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolLogoSource } from "@/lib/school-logo";
import { ReportSignatureStrip } from "@/app/admin/examinations/signatures/report-signature-strip";
import { getExamTeacherSignatures } from "@/lib/exam-report-signatures";
import {
  calculateWeightedAverage,
  canPreviewDraftTestReport,
  examAssessmentResultState,
  gradeForPercentage,
  hasCompleteExamResult,
  rankScores,
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

export const dynamic = "force-dynamic";

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

export default async function ReportCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string; enrollmentId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const [{ examId: rawExamId, enrollmentId: rawEnrollmentId }, query] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(rawExamId) || !/^\d+$/.test(rawEnrollmentId)) notFound();
  const examId = Number(rawExamId);
  const enrollmentId = Number(rawEnrollmentId);
  const [record] = await db.select({
    examinationId: examinations.id,
    examinationName: examinations.name,
    examinationStatus: examinations.status,
    academicYearId: examinations.academicYearId,
    academicYearStatus: academicYears.status,
    branchId: examinations.branchId,
    termId: examinations.academicTermId,
    scaleId: examGradingScales.id,
    scaleName: examGradingScales.name,
    allowRanking: examGradingScales.allowRanking,
    yearName: academicYears.name,
    termName: academicTerms.name,
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
    schoolAddress: schools.address,
    schoolPhone: schools.phone,
    schoolEmail: schools.email,
    schoolCurrency: schools.currency,
    schoolTimezone: schools.timezone,
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
    ))
    .limit(1);

  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!record || record.branchId !== null && record.branchId !== record.studentBranchId) notFound();
  const draftPreview = canPreviewDraftTestReport({
    requested: query.preview === "test",
    examName: record.examinationName,
    examStatus: record.examinationStatus,
    canManage,
  });
  const classSubjectStatuses = await db.select({ status: examSubjects.status }).from(examSubjects)
    .where(and(
      eq(examSubjects.schoolId, context.schoolId),
      eq(examSubjects.examClassId, record.examClassId),
    ));
  const classPublished = classSubjectStatuses.length > 0 && classSubjectStatuses.every((subject) => subject.status === "published");
  if (!classPublished && !draftPreview) notFound();

  const signatureRows = await db.select({
    role: examReportSignatures.role,
    updatedAt: examReportSignatures.updatedAt,
  })
    .from(examReportSignatures)
    .where(and(
      eq(examReportSignatures.schoolId, context.schoolId),
      eq(examReportSignatures.role, "headteacher"),
    ));
  const canViewFeeBalance = context.grantedPermissions.includes("fees.balance.view") ||
    context.grantedPermissions.includes("payments.record") ||
    context.grantedPermissions.includes("fees.manage");
  let feeBalanceMinor = 0;
  if (canViewFeeBalance) {
    const invoices = await db.select({
      id: studentFeeInvoices.id,
      amount: studentFeeInvoices.amount,
      discountAmount: studentFeeInvoices.discountAmount,
      fineType: studentFeeInvoices.fineType,
      fineValue: studentFeeInvoices.fineValue,
      dueDate: studentFeeInvoices.dueDate,
    }).from(studentFeeInvoices).where(and(
      eq(studentFeeInvoices.schoolId, context.schoolId),
      eq(studentFeeInvoices.studentId, record.studentId),
    ));
    const payments = invoices.length
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
    for (const payment of payments) {
      const amount = parseMoneyToMinorUnits(payment.amount);
      const reversed = parseMoneyToMinorUnits(payment.reversedAmount);
      if (amount === null || reversed === null || reversed > amount) {
        throw new Error("Stored fee payment or reversal amount is invalid.");
      }
      const netPaid = (paidByInvoice.get(payment.invoiceId) ?? 0) + amount - reversed;
      if (!Number.isSafeInteger(netPaid)) throw new Error("Stored fee payment total exceeds the supported range.");
      paidByInvoice.set(payment.invoiceId, netPaid);
    }
    const today = todayInTimezone(record.schoolTimezone);
    for (const invoice of invoices) {
      const invoiceBalance = calculateOutstandingInvoiceBalance({
        ...invoice,
        paidMinor: paidByInvoice.get(invoice.id) ?? 0,
        today,
      });
      if (invoiceBalance === null) throw new Error("Stored fee invoice balance is invalid.");
      feeBalanceMinor += invoiceBalance;
      if (!Number.isSafeInteger(feeBalanceMinor)) throw new Error("Outstanding fee balance exceeds the supported range.");
    }
  }

  if (!canManage) {
    if (record.academicYearStatus !== "active" || record.classTeacherId === null) notFound();
    const appointedTeacher = await db.select({ id: teachers.id }).from(teachers)
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.status, "active"),
      ))
      .where(and(
        eq(teachers.id, record.classTeacherId),
        eq(teachers.schoolId, context.schoolId),
        eq(teachers.status, "active"),
      ))
      .limit(1);
    if (!appointedTeacher.length) notFound();
  }
  const assessments = await db.select({
    id: examSubjects.id,
    subjectName: subjects.name,
    subjectCode: subjects.code,
    maxMarks: examSubjects.maxMarks,
    weight: examSubjects.weight,
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
      eq(examSubjects.examClassId, record.examClassId),
      eq(examSubjects.schoolId, context.schoolId),
      draftPreview ? eq(examSubjects.status, "draft") : eq(examSubjects.status, "published"),
    ))
    .orderBy(asc(subjects.name));
  const teacherSignatures = await getExamTeacherSignatures(context.schoolId, [
    { teacherId: record.classTeacherId, role: "Class teacher" },
    ...assessments.map((assessment) => ({ teacherId: assessment.teacherId, role: "Subject teacher" as const })),
  ]);
  const assessmentIds = assessments.map((assessment) => assessment.id);
  const [markRows, attendanceRows] = assessmentIds.length
    ? await Promise.all([
      db.select({
        id: examMarks.id,
        examSubjectId: examMarks.examSubjectId,
        marks: examMarks.marks,
        teacherRemark: examMarks.teacherRemark,
      }).from(examMarks).where(and(
        eq(examMarks.schoolId, context.schoolId),
        eq(examMarks.enrollmentId, record.enrollmentId),
        inArray(examMarks.examSubjectId, assessmentIds),
      )),
      db.select({
        examSubjectId: examAttendance.examSubjectId,
        status: examAttendance.status,
        note: examAttendance.note,
      }).from(examAttendance).where(and(
        eq(examAttendance.schoolId, context.schoolId),
        eq(examAttendance.enrollmentId, record.enrollmentId),
        inArray(examAttendance.examSubjectId, assessmentIds),
      )),
    ])
    : [[], []];
  const markByAssessment = new Map(markRows.map((mark) => [mark.examSubjectId, mark]));
  const attendanceByAssessment = new Map(attendanceRows.map((entry) => [entry.examSubjectId, entry]));
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
  const outcomes = assessments.map((assessment) => {
    const mark = markByAssessment.get(assessment.id);
    const attendance = attendanceByAssessment.get(assessment.id);
    const resultState = examAssessmentResultState({
      attendanceStatus: attendance?.status ?? null,
      isCompulsory: assessment.isCompulsory,
      hasMark: mark?.marks !== null && mark?.marks !== undefined,
    });
    const score = resultState === "scored" && mark?.marks !== null && mark?.marks !== undefined
      ? Number(mark.marks)
      : null;
    const percentage = score === null ? null : score / Number(assessment.maxMarks) * 100;
    return {
      ...assessment,
      markId: mark?.id ?? assessment.id,
      marks: score,
      teacherRemark: mark?.teacherRemark ?? null,
      attendanceStatus: attendance?.status ?? null,
      attendanceNote: attendance?.note ?? null,
      resultState,
      percentage,
      grade: percentage === null ? null : gradeForPercentage(percentage, bands),
    };
  });
  const overall = hasCompleteExamResult(outcomes.map((item) => item.resultState))
    ? calculateWeightedAverage(outcomes.flatMap((item) =>
      item.resultState === "scored" && item.marks !== null
        ? [{ marks: item.marks, maxMarks: Number(item.maxMarks), weight: Number(item.weight) }]
        : [],
    ))
    : null;
  const overallGrade = overall ? gradeForPercentage(overall.percentage, bands) : null;
  let classRank: number | null = null;
  let classSize = 0;
  if (record.allowRanking) {
    const classScores = await db.select({
      enrollmentId: studentEnrollments.id,
      examMarkId: examMarks.id,
      examSubjectId: examSubjects.id,
      marks: examMarks.marks,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
      isCompulsory: classSubjects.isCompulsory,
      attendanceStatus: examAttendance.status,
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
        draftPreview ? eq(examSubjects.status, "draft") : eq(examSubjects.status, "published"),
      ))
      .innerJoin(classSubjects, and(
        eq(classSubjects.id, examSubjects.classSubjectId),
        eq(classSubjects.schoolId, context.schoolId),
      ))
      .leftJoin(examAttendance, and(
        eq(examAttendance.examSubjectId, examSubjects.id),
        eq(examAttendance.enrollmentId, studentEnrollments.id),
        eq(examAttendance.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, record.academicYearId),
        eq(studentEnrollments.status, "enrolled"),
      ));
    const totals = new Map<number, Array<{ marks: number; maxMarks: number; weight: number }>>();
    for (const mark of classScores) {
      if (mark.marks === null || examAssessmentResultState({
        attendanceStatus: mark.attendanceStatus,
        isCompulsory: mark.isCompulsory,
        hasMark: true,
      }) !== "scored") continue;
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
  const [classRemark] = await db.select({
    remark: examStudentRemarks.classTeacherRemark,
  }).from(examStudentRemarks).where(and(
    eq(examStudentRemarks.schoolId, context.schoolId),
    eq(examStudentRemarks.examClassId, record.examClassId),
    eq(examStudentRemarks.enrollmentId, record.enrollmentId),
  )).limit(1);
  const remarkVariantIndex = examRemarkVariantIndex(record.enrollmentId);
  const classTeacherFeedback = resolveExamReportRemark(classRemark?.remark, overallGrade, "classTeacher", remarkVariantIndex);
  const headteacherFeedback = resolveExamReportRemark(record.principalRemark, overallGrade, "headteacher", remarkVariantIndex);
  const photo = record.profilePhoto?.profilePhoto;
  const photoAllowed = context.grantedPermissions.includes("students.view");
  const photoUrl = photoAllowed && photo?.objectKey && photo.fileName
    ? `/api/admin/students/${record.studentPublicId}/photo`
    : null;
  const schoolLogo = schoolLogoSource(record.schoolLogoUrl);

  return (
    <main className="exam-report-document mx-auto max-w-4xl space-y-5 p-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link href={`/admin/examinations/${examId}`} className="text-sm font-semibold text-violet-700">← Back to {record.examinationName}</Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">Student report card</h1>
        </div>
        <PrintButton label="Print / save A4 PDF" targetId="student-report-card" pageSize="A4" />
      </header>
      <article id="student-report-card" className="a4-report-card a4-report-card-last print-report-content space-y-5 rounded-2xl border border-slate-200 bg-white p-7 text-slate-900 print:rounded-none print:border-0 print:p-0">
        {draftPreview && <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-center text-sm font-bold uppercase tracking-wide text-amber-950 print:border-2">Draft test preview — not official; scores are synthetic</div>}
        <header className="print-report-heading flex items-center gap-4">
          {schoolLogo && <Image src={schoolLogo} unoptimized width={64} height={64} alt={`${record.schoolName} logo`} className="exam-report-school-logo h-16 w-16 rounded-lg object-contain" />}
          <div className="min-w-0 flex-1">
            <p className="exam-report-school-name text-sm font-semibold uppercase tracking-wide text-violet-700">{record.schoolName}</p>
            <p className="exam-report-school-contact mt-0.5 text-xs text-slate-600">
              {[record.schoolAddress, record.schoolPhone, record.schoolEmail].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-1 text-2xl font-bold">Statement of Marks</h2>
            <p className="mt-1 text-sm text-slate-600">{record.examinationName} · {record.termName ?? record.yearName}</p>
          </div>
          {photoUrl && <Image src={photoUrl} unoptimized width={80} height={80} alt={`${record.studentFirstName} ${record.studentLastName}`} className="exam-report-student-photo h-20 w-20 rounded-xl object-cover" />}
        </header>
        <section className="exam-report-student-details grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <p><span className="font-semibold text-slate-500">Student</span><br />{record.studentFirstName} {record.studentLastName}</p>
          <p><span className="font-semibold text-slate-500">Admission number</span><br />{record.admissionNumber ?? "—"}</p>
          <p><span className="font-semibold text-slate-500">Class / section</span><br />{record.className} · {record.sectionName}</p>
          <p><span className="font-semibold text-slate-500">Academic year</span><br />{record.yearName}</p>
          <p><span className="font-semibold text-slate-500">Term</span><br />{record.termName ?? "Not specified"}</p>
          {record.allowRanking && <p><span className="font-semibold text-slate-500">Class position</span><br />{classRank ?? "—"} of {classSize}</p>}
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl bg-violet-800 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-100">Overall performance</p>
            <p className="mt-1 text-3xl font-bold">{overall ? `${overall.percentage.toFixed(2)}%` : "—"}</p>
            <p className="mt-1 text-sm text-violet-100">{overall
              ? `${overall.totalMarks.toFixed(2)} of ${overall.maxMarks.toFixed(2)} · Grade ${overallGrade?.grade ?? "—"}${overallGrade?.description ? ` · ${overallGrade.description}` : ""}`
              : "Incomplete or no numeric results"}</p>
          </article>
          {canViewFeeBalance && (
            <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Outstanding fee balance</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{record.schoolCurrency} {(feeBalanceMinor / 100).toFixed(2)}</p>
              <p className="mt-1 text-xs text-slate-600">Includes applicable overdue fines and payments net of reversals.</p>
            </article>
          )}
        </section>
        <section className="print-report-panel overflow-x-auto rounded-xl border border-slate-200">
          <table className="print-report-table w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="p-3">Subject</th><th className="p-3">Marks</th><th className="p-3">Percentage</th><th className="p-3">Grade</th><th className="p-3">Teacher remark</th></tr></thead>
            <tbody>{outcomes.map((item) => (
              <tr key={item.markId} className="border-t border-slate-200">
                <td className="p-3 font-medium">{item.subjectName} <span className="text-xs text-slate-500">{item.subjectCode}</span></td>
                <td className="p-3">{item.resultState === "scored" ? `${item.marks} / ${item.maxMarks}`
                  : item.attendanceStatus === "not_applicable" ? "Not taking"
                  : item.attendanceStatus === "x" ? `X · Absent${item.attendanceNote ? ` · ${item.attendanceNote}` : ""}`
                  : item.attendanceStatus === "y" ? `Y · Nullified (malpractice)${item.attendanceNote ? ` · ${item.attendanceNote}` : ""}`
                  : item.attendanceStatus === "absent" ? "Absent"
                  : item.attendanceStatus === "excused" ? "Excused"
                  : "Missing mark"}</td>
                <td className="p-3">{item.percentage === null ? "—" : `${item.percentage.toFixed(2)}%`}</td>
                <td className="p-3">{item.grade?.grade ?? "—"}{item.grade && <span className="ml-1 text-xs text-slate-500">{item.grade.description}</span>}</td>
                <td className="p-3">{item.teacherRemark || item.grade?.performanceRemark || "—"}</td>
              </tr>
            ))}</tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <tr><td className="p-3">Overall</td><td className="p-3">{overall ? `${overall.totalMarks.toFixed(2)} / ${overall.maxMarks.toFixed(2)}` : "Incomplete"}</td><td className="p-3">{overall ? `${overall.percentage.toFixed(2)}%` : "—"}</td><td className="p-3">{overallGrade?.grade ?? "—"} {overallGrade?.description}</td><td className="p-3">{overallGrade?.performanceRemark ?? ""}</td></tr>
            </tfoot>
          </table>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4"><h3 className="font-bold">Class teacher&apos;s remarks</h3><p className="mt-2 text-sm">{classTeacherFeedback ?? "—"}</p></div>
          <div className="rounded-xl border p-4"><h3 className="font-bold">Headteacher&apos;s remarks</h3><p className="mt-2 text-sm">{headteacherFeedback ?? "—"}</p></div>
        </section>
        <ReportSignatureStrip signatures={signatureRows} teacherSignatures={teacherSignatures} />
        <footer className="flex flex-wrap justify-between gap-2 border-t pt-3 text-xs text-slate-500">
          <span>{record.schoolName}</span>
          <span>{record.examinationName} · {record.yearName}</span>
        </footer>
      </article>
    </main>
  );
}
