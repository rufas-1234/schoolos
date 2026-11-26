import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { CalendarDays, CreditCard, IdCard, Printer } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { ExamAccessCard, type ExamCardRecord } from "@/components/exam-access-card";
import { StudentIdCard, type StudentIdCardRecord } from "@/components/student-id-card";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  examClasses,
  examFeeClearances,
  examinations,
  feePayments,
  feeStructures,
  studentEnrollments,
  studentFeeInvoices,
  students,
  userStudentLinks,
} from "@/db/schema";
import { FamilyPortalShell } from "@/app/portal/family-portal-shell";
import { requireSchoolMember } from "@/lib/access-control";
import { calculateOutstandingInvoiceBalance, formatFeeReportDate, parseMoneyToMinorUnits } from "@/lib/fees-policy";
import { getExamCardEligibility } from "@/lib/exam-card-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import examStyles from "@/app/admin/examinations/[examId]/cards/exam-cards.module.css";
import idStyles from "@/app/admin/students/ids/student-ids.module.css";

export const dynamic = "force-dynamic";

export default async function StudentCardsPage() {
  const context = await requireSchoolMember();
  const today = formatFeeReportDate(new Date(), context.schoolTimezone ?? "UTC");
  const linkedRows = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "student"),
    ));
  const linkedStudentIds = linkedRows.map((row) => row.studentId);
  const linkedStudents = linkedStudentIds.length || context.user.email
    ? await db.select({
      id: students.id,
      publicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      dateOfBirth: students.dateOfBirth,
      currentAddress: students.currentAddress,
      fatherName: students.fatherName,
      fatherPhone: students.fatherPhone,
      motherName: students.motherName,
      guardianName: students.guardianName,
      guardianPhone: students.guardianPhone,
      phone: students.phone,
      additionalDetails: students.additionalDetails,
    }).from(students).where(and(
      eq(students.schoolId, context.schoolId),
      inArray(students.status, ["active", "admitted"]),
      linkedStudentIds.length
        ? inArray(students.id, linkedStudentIds)
        : eq(students.email, context.user.email!),
    ))
    : [];
  const studentIds = linkedStudents.map((student) => student.id);

  const [enrollments, examRows] = studentIds.length
    ? await Promise.all([
      db.select({
        studentId: studentEnrollments.studentId,
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
        rollNumber: studentEnrollments.rollNumber,
      }).from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, studentEnrollments.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, studentIds),
          eq(studentEnrollments.status, "enrolled"),
        ))
        .orderBy(desc(academicYears.startDate), desc(studentEnrollments.enrolledAt)),
      db.select({
        examinationId: examinations.id,
        examName: examinations.name,
        examStartDate: examinations.startDate,
        examEndDate: examinations.endDate,
        academicYearId: examinations.academicYearId,
        academicTermId: examinations.academicTermId,
        yearName: academicYears.name,
        enrollmentId: studentEnrollments.id,
        studentId: students.id,
        publicId: students.publicId,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
        rollNumber: studentEnrollments.rollNumber,
        className: classLevels.name,
        sectionName: classSections.name,
        additionalDetails: students.additionalDetails,
      }).from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, studentEnrollments.academicYearId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(examClasses, and(
          eq(examClasses.classLevelId, classLevels.id),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.schoolId, context.schoolId),
          eq(examinations.academicYearId, studentEnrollments.academicYearId),
          gte(examinations.endDate, today),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, examinations.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .innerJoin(students, and(
          eq(students.id, studentEnrollments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, studentIds),
          eq(studentEnrollments.status, "enrolled"),
        ))
        .orderBy(asc(examinations.startDate), asc(students.firstName), asc(students.lastName)),
    ])
    : [[], []];

  const newestEnrollmentByStudent = new Map<number, (typeof enrollments)[number]>();
  for (const enrollment of enrollments) {
    if (!newestEnrollmentByStudent.has(enrollment.studentId)) {
      newestEnrollmentByStudent.set(enrollment.studentId, enrollment);
    }
  }
  const idCards: StudentIdCardRecord[] = linkedStudents.map((student) => {
    const enrollment = newestEnrollmentByStudent.get(student.id);
    return {
      id: student.id,
      publicId: student.publicId,
      name: `${student.firstName} ${student.lastName}`.trim(),
      admissionNumber: student.admissionNumber,
      dateOfBirth: student.dateOfBirth,
      className: enrollment?.className ?? null,
      sectionName: enrollment?.sectionName ?? null,
      rollNumber: enrollment?.rollNumber ?? null,
      yearName: enrollment?.yearName ?? null,
      fatherName: student.fatherName ?? student.guardianName,
      motherName: student.motherName,
      phone: student.phone ?? student.guardianPhone ?? student.fatherPhone,
      address: student.currentAddress,
      photoUrl: student.additionalDetails?.profilePhoto?.objectKey
        ? `/api/portal/student/${student.publicId}/photo`
        : null,
    };
  });

  const enrollmentIds = [...new Set(examRows.map((row) => row.enrollmentId))];
  const yearIds = [...new Set(examRows.map((row) => row.academicYearId))];
  const examinationIds = [...new Set(examRows.map((row) => row.examinationId))];
  const [invoiceRows, clearanceRows] = enrollmentIds.length
    ? await Promise.all([
      db.select({
        enrollmentId: studentFeeInvoices.enrollmentId,
        academicYearId: feeStructures.academicYearId,
        academicTermId: feeStructures.academicTermId,
        amount: studentFeeInvoices.amount,
        discountAmount: studentFeeInvoices.discountAmount,
        fineType: studentFeeInvoices.fineType,
        fineValue: studentFeeInvoices.fineValue,
        dueDate: studentFeeInvoices.dueDate,
        paidMinor: sql<string>`COALESCE(SUM(${feePayments.amount} - ${feePayments.reversedAmount}), 0)`,
      }).from(studentFeeInvoices)
        .innerJoin(feeStructures, and(
          eq(feeStructures.id, studentFeeInvoices.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
          inArray(feeStructures.academicYearId, yearIds),
        ))
        .leftJoin(feePayments, and(
          eq(feePayments.invoiceId, studentFeeInvoices.id),
          eq(feePayments.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          inArray(studentFeeInvoices.enrollmentId, enrollmentIds),
          inArray(studentFeeInvoices.studentId, studentIds),
        ))
        .groupBy(
          studentFeeInvoices.enrollmentId,
          feeStructures.academicYearId,
          feeStructures.academicTermId,
          studentFeeInvoices.amount,
          studentFeeInvoices.discountAmount,
          studentFeeInvoices.fineType,
          studentFeeInvoices.fineValue,
          studentFeeInvoices.dueDate,
          studentFeeInvoices.id,
        ),
      db.select({
        examinationId: examFeeClearances.examinationId,
        enrollmentId: examFeeClearances.enrollmentId,
        reason: examFeeClearances.reason,
      }).from(examFeeClearances).where(and(
        eq(examFeeClearances.schoolId, context.schoolId),
        inArray(examFeeClearances.examinationId, examinationIds),
        inArray(examFeeClearances.enrollmentId, enrollmentIds),
      )),
    ])
    : [[], []];

  const invoicesByEnrollmentYear = new Map<string, typeof invoiceRows>();
  for (const invoice of invoiceRows) {
    const key = `${invoice.enrollmentId}:${invoice.academicYearId}`;
    const group = invoicesByEnrollmentYear.get(key) ?? [];
    group.push(invoice);
    invoicesByEnrollmentYear.set(key, group);
  }
  const clearanceByExamEnrollment = new Map(clearanceRows.map((clearance) => [
    `${clearance.examinationId}:${clearance.enrollmentId}`,
    clearance.reason,
  ]));
  const examCards = examRows.map((row) => {
    const invoicesForExam = invoicesByEnrollmentYear.get(`${row.enrollmentId}:${row.academicYearId}`) ?? [];
    const balance = { balanceMinor: 0, invoiceCount: 0, outstandingInvoiceCount: 0 };
    for (const invoice of invoicesForExam) {
      if (row.academicTermId && invoice.academicTermId && invoice.academicTermId !== row.academicTermId) continue;
      const paidMinor = parseMoneyToMinorUnits(invoice.paidMinor ?? "0");
      if (paidMinor === null) throw new Error("Stored exam-fee payment total is invalid.");
      const invoiceBalance = calculateOutstandingInvoiceBalance({
        amount: invoice.amount,
        discountAmount: invoice.discountAmount,
        fineType: invoice.fineType,
        fineValue: invoice.fineValue,
        dueDate: invoice.dueDate,
        paidMinor,
        today,
      });
      if (invoiceBalance === null) throw new Error("Stored exam-fee invoice balance is invalid.");
      balance.balanceMinor += invoiceBalance;
      if (!Number.isSafeInteger(balance.balanceMinor)) throw new Error("Exam-fee balance exceeds the supported range.");
      balance.invoiceCount += 1;
      if (invoiceBalance > 0) balance.outstandingInvoiceCount += 1;
    }
    const clearanceReason = clearanceByExamEnrollment.get(`${row.examinationId}:${row.enrollmentId}`) ?? null;
    const record: ExamCardRecord = {
      id: row.enrollmentId,
      publicId: row.publicId,
      name: `${row.firstName} ${row.lastName}`.trim(),
      admissionNumber: row.admissionNumber,
      rollNumber: row.rollNumber,
      className: row.className,
      sectionName: row.sectionName,
      photoUrl: row.additionalDetails?.profilePhoto?.objectKey
        ? `/api/portal/student/${row.publicId}/photo`
        : null,
      eligibility: getExamCardEligibility(balance.balanceMinor, clearanceReason),
      invoiceCount: balance.invoiceCount,
      outstandingInvoiceCount: balance.outstandingInvoiceCount,
      clearanceReason,
    };
    return { ...row, record };
  });
  const eligibleExamCards = examCards.filter((card) => card.record.eligibility !== "fees-outstanding");
  const blockedExamCards = examCards.filter((card) => card.record.eligibility === "fees-outstanding");
  const schoolLogo = schoolLogoSource(context.schoolLogoUrl);

  return (
    <FamilyPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      schoolAddress={context.schoolAddress}
      schoolPhone={context.schoolPhone}
      schoolEmail={context.schoolEmail}
      userName={context.user.name}
      portalType="student"
      schoolChoices={context.schoolChoices}
      currentSchoolPublicId={context.schoolPublicId}
    >
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Student portal</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">My school cards</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Print your student ID and eligible exam access cards. Exam cards are available after fees are cleared or the school approves an exception.
              </p>
            </div>
            <Link href="/portal/student?section=overview" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Back to student portal</Link>
          </div>
        </header>

        {!linkedStudents.length ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <h2 className="font-semibold">Student account not linked</h2>
            <p className="mt-1 leading-6">Ask the school administrator to link this account to your student profile before printing cards.</p>
          </section>
        ) : (
          <>
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-slate-950"><IdCard size={19} className="text-violet-700" /> Student ID cards</h2>
                  <p className="mt-1 text-sm text-slate-500">Your official school ID in CR80 / ID-1 format.</p>
                </div>
                <PrintButton
                  targetId="student-portal-id-cards"
                  label="Print student ID cards"
                  pageOrientation="landscape"
                  pageSize="ID-1"
                  disabled={!idCards.length}
                />
              </div>
              {idCards.length ? (
                <div id="student-portal-id-cards" className={idStyles.cardGrid}>
                  {idCards.map((record, index) => (
                    <article
                      className={idStyles.cardItem}
                      key={record.id}
                      data-selected="true"
                      data-last-selected={index === idCards.length - 1}
                    >
                      <StudentIdCard
                        record={record}
                        schoolName={context.schoolName}
                        schoolEmail={context.schoolEmail}
                        schoolLogo={schoolLogo}
                        schoolPhone={context.schoolPhone}
                        schoolAddress={context.schoolAddress}
                      />
                    </article>
                  ))}
                </div>
              ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No linked student profile is available to print.</p>}
            </section>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-slate-950"><CalendarDays size={19} className="text-violet-700" /> Exam access cards</h2>
                  <p className="mt-1 text-sm text-slate-500">Upcoming exams for your current examination rosters.</p>
                </div>
                <PrintButton
                  targetId="student-portal-exam-cards"
                  label="Print eligible exam cards"
                  pageOrientation="landscape"
                  pageSize="ID-1"
                  disabled={!eligibleExamCards.length}
                />
              </div>
              {eligibleExamCards.length ? (
                <div id="student-portal-exam-cards" className={examStyles.cardGrid}>
                  {eligibleExamCards.map((card, index) => (
                    <article
                      className={examStyles.cardItem}
                      key={`${card.examinationId}:${card.enrollmentId}`}
                      data-selected="true"
                      data-last-selected={index === eligibleExamCards.length - 1}
                    >
                      <ExamAccessCard
                        record={card.record}
                        examName={card.examName}
                        examYear={card.yearName}
                        examStartDate={card.examStartDate}
                        examEndDate={card.examEndDate}
                        schoolName={context.schoolName}
                        schoolLogo={schoolLogo}
                        schoolAddress={context.schoolAddress}
                        schoolPhone={context.schoolPhone}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  No eligible upcoming exam cards are available right now.
                </div>
              )}
              {blockedExamCards.length > 0 && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><CreditCard size={16} /> Exam cards awaiting fee clearance</h3>
                  <ul className="space-y-2">
                    {blockedExamCards.map((card) => (
                      <li key={`${card.examinationId}:${card.enrollmentId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-800">{card.record.name} · {card.examName} · {card.yearName}</span>
                        <span className="text-xs text-amber-800">Clear the exam-period balance or contact the school office for an approved exception.</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!examCards.length && (
                <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  <Printer size={16} /> Your school has not added you to an upcoming examination roster yet.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </FamilyPortalShell>
  );
}
