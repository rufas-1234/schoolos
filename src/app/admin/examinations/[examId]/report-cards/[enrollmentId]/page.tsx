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
  examGradeBands,
  examGradingScales,
  examMarks,
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
import {
  calculateWeightedAverage,
  canPreviewDraftTestReport,
  gradeForPercentage,
  rankScores,
  type GradeBand,
} from "@/lib/examination-policy";
import {
  calculateOutstandingInvoiceBalance,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";

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
  if (record.examinationStatus !== "published" && !draftPreview) notFound();

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
      draftPreview ? eq(examSubjects.status, "draft") : eq(examSubjects.status, "published"),
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
        draftPreview ? eq(examSubjects.status, "draft") : eq(examSubjects.status, "published"),
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
          {schoolLogo && <Image src={schoolLogo} unoptimized width={64} height={64} alt={`${record.schoolName} logo`} className="h-16 w-16 rounded-lg object-contain" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">{record.schoolName}</p>
            <h2 className="mt-1 text-2xl font-bold">Academic report</h2>
            <p className="mt-1 text-sm text-slate-600">{record.examinationName} · {record.termName ?? record.yearName}</p>
          </div>
          {photoUrl && <Image src={photoUrl} unoptimized width={80} height={80} alt={`${record.studentFirstName} ${record.studentLastName}`} className="h-20 w-20 rounded-xl object-cover" />}
        </header>
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
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
            <p className="mt-1 text-3xl font-bold">{overall.percentage.toFixed(2)}%</p>
            <p className="mt-1 text-sm text-violet-100">{overall.totalMarks.toFixed(2)} of {overall.maxMarks.toFixed(2)} · Grade {overallGrade?.grade ?? "—"}{overallGrade?.description ? ` · ${overallGrade.description}` : ""}</p>
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
                <td className="p-3">{item.marks} / {item.maxMarks}</td>
                <td className="p-3">{item.percentage.toFixed(2)}%</td>
                <td className="p-3">{item.grade?.grade ?? "—"}{item.grade && <span className="ml-1 text-xs text-slate-500">{item.grade.description}</span>}</td>
                <td className="p-3">{item.teacherRemark || (item.grade?.performanceRemark ? `Suggested: ${item.grade.performanceRemark}` : "—")}</td>
              </tr>
            ))}</tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <tr><td className="p-3">Overall</td><td className="p-3">{overall.totalMarks.toFixed(2)} / {overall.maxMarks.toFixed(2)}</td><td className="p-3">{overall.percentage.toFixed(2)}%</td><td className="p-3">{overallGrade?.grade ?? "—"} {overallGrade?.description}</td><td className="p-3">{overallGrade?.performanceRemark ?? ""}</td></tr>
            </tfoot>
          </table>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4"><h3 className="font-bold">Class teacher&apos;s remarks</h3><p className="mt-2 text-sm">{classRemark?.remark || (overallGrade?.performanceRemark ? `Suggested from grade ${overallGrade.grade}: ${overallGrade.performanceRemark}` : "—")}</p></div>
          <div className="rounded-xl border p-4"><h3 className="font-bold">Principal&apos;s remarks</h3><p className="mt-2 text-sm">{record.principalRemark ?? "—"}</p></div>
        </section>
        <section className="grid grid-cols-3 gap-3 pt-4 text-center text-xs">
          {["Parent / Guardian", "Class Teacher", "Principal"].map((label) => (
            <div key={label} className="pt-8">
              <div className="border-t border-slate-500 pt-1">{label} signature</div>
            </div>
          ))}
        </section>
        <footer className="flex flex-wrap justify-between gap-2 border-t pt-3 text-xs text-slate-500">
          <span>{[record.schoolAddress, record.schoolPhone, record.schoolEmail].filter(Boolean).join(" · ") || record.schoolName}</span>
          <span>{record.examinationName} · {record.yearName}</span>
        </footer>
      </article>
    </main>
  );
}
