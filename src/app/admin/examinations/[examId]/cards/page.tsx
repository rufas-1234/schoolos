import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { SmartFilterForm } from "@/components/smart-filter-form";
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
  schools,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { formatFeeReportDate, calculateOutstandingInvoiceBalance, parseMoneyToMinorUnits } from "@/lib/fees-policy";
import { getExamCardEligibility } from "@/lib/exam-card-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import { ExamCardRegister, type ExamCardRecord } from "./exam-card-register";
import styles from "./exam-cards.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  search?: string;
  classLevelId?: string;
  status?: string;
}>;

export default async function ExaminationCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: SearchParams;
}) {
  const context = await requireSchoolPermission(["examinations.create", "fees.manage"]);
  const [{ examId: rawExamId }, query] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(rawExamId)) notFound();
  const examId = Number(rawExamId);
  if (!Number.isSafeInteger(examId) || examId <= 0) notFound();

  const [exam] = await db.select({
    id: examinations.id,
    name: examinations.name,
    startDate: examinations.startDate,
    endDate: examinations.endDate,
    academicYearId: examinations.academicYearId,
    academicTermId: examinations.academicTermId,
    yearName: academicYears.name,
  }).from(examinations)
    .innerJoin(academicYears, and(
      eq(academicYears.id, examinations.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examinations.id, examId),
      eq(examinations.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!exam) notFound();

  const [school, classes] = await Promise.all([
    db.select({
      name: schools.name,
      logoUrl: schools.logoUrl,
      address: schools.address,
      phone: schools.phone,
      timezone: schools.timezone,
    }).from(schools).where(eq(schools.id, context.schoolId)).limit(1),
    db.select({
      id: classLevels.id,
      name: classLevels.name,
    }).from(examClasses)
      .innerJoin(classLevels, and(
        eq(classLevels.id, examClasses.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examClasses.schoolId, context.schoolId),
        eq(examClasses.examinationId, exam.id),
      ))
      .orderBy(asc(classLevels.name)),
  ]);
  const selectedClassId = query.classLevelId && /^\d+$/.test(query.classLevelId)
    ? classes.find((item) => item.id === Number(query.classLevelId))?.id
    : undefined;
  const search = query.search?.trim().slice(0, 100) ?? "";
  const searchPattern = `%${search.replace(/[\\%_]/g, "\\$&").toLowerCase()}%`;
  const rosterConditions = [
    eq(examClasses.schoolId, context.schoolId),
    eq(examClasses.examinationId, exam.id),
    eq(studentEnrollments.schoolId, context.schoolId),
    eq(studentEnrollments.academicYearId, exam.academicYearId),
    eq(studentEnrollments.status, "enrolled"),
    eq(students.schoolId, context.schoolId),
  ];
  if (selectedClassId) rosterConditions.push(eq(examClasses.classLevelId, selectedClassId));
  if (search) rosterConditions.push(or(
    like(sql`lower(concat(${students.firstName}, ' ', ${students.lastName}))`, searchPattern),
    like(sql`lower(coalesce(${students.admissionNumber}, ''))`, searchPattern),
    like(sql`lower(coalesce(${studentEnrollments.rollNumber}, ''))`, searchPattern),
    like(sql`lower(${classLevels.name})`, searchPattern),
    like(sql`lower(${classSections.name})`, searchPattern),
  )!);

  const roster = await db.select({
    enrollmentId: studentEnrollments.id,
    publicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    rollNumber: studentEnrollments.rollNumber,
    className: classLevels.name,
    sectionName: classSections.name,
    additionalDetails: students.additionalDetails,
  }).from(examClasses)
    .innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(classSections, and(
      eq(classSections.classLevelId, examClasses.classLevelId),
      eq(classSections.academicYearId, exam.academicYearId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.classSectionId, classSections.id),
      eq(studentEnrollments.schoolId, context.schoolId),
    ))
    .innerJoin(students, and(
      eq(students.id, studentEnrollments.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .where(and(...rosterConditions))
    .orderBy(asc(classLevels.name), asc(students.firstName), asc(students.lastName))
    .limit(3000);

  const enrollmentIds = roster.map((row) => row.enrollmentId);
  const [invoices, clearances] = enrollmentIds.length
    ? await Promise.all([
      db.select({
        id: studentFeeInvoices.id,
        enrollmentId: studentFeeInvoices.enrollmentId,
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
          eq(feeStructures.academicYearId, exam.academicYearId),
          ...(exam.academicTermId
            ? [or(isNull(feeStructures.academicTermId), eq(feeStructures.academicTermId, exam.academicTermId))!]
            : []),
        ))
        .leftJoin(feePayments, and(
          eq(feePayments.invoiceId, studentFeeInvoices.id),
          eq(feePayments.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          inArray(studentFeeInvoices.enrollmentId, enrollmentIds),
        ))
        .groupBy(
          studentFeeInvoices.id,
          studentFeeInvoices.enrollmentId,
          studentFeeInvoices.amount,
          studentFeeInvoices.discountAmount,
          studentFeeInvoices.fineType,
          studentFeeInvoices.fineValue,
          studentFeeInvoices.dueDate,
        ),
      db.select({
        enrollmentId: examFeeClearances.enrollmentId,
        reason: examFeeClearances.reason,
      }).from(examFeeClearances).where(and(
        eq(examFeeClearances.schoolId, context.schoolId),
        eq(examFeeClearances.examinationId, exam.id),
        inArray(examFeeClearances.enrollmentId, enrollmentIds),
      )),
    ])
    : [[], []];

  const today = formatFeeReportDate(new Date(), school[0]?.timezone ?? "UTC");
  const balanceByEnrollment = new Map<number, {
    balanceMinor: number;
    invoiceCount: number;
    outstandingInvoiceCount: number;
  }>(
    enrollmentIds.map((id) => [id, { balanceMinor: 0, invoiceCount: 0, outstandingInvoiceCount: 0 }]),
  );
  for (const invoice of invoices) {
    const paidMinor = parseMoneyToMinorUnits(invoice.paidMinor ?? "0");
    if (paidMinor === null) throw new Error("Stored exam-fee payment total is invalid.");
    const balanceMinor = calculateOutstandingInvoiceBalance({
      amount: invoice.amount,
      discountAmount: invoice.discountAmount,
      fineType: invoice.fineType,
      fineValue: invoice.fineValue,
      dueDate: invoice.dueDate,
      paidMinor,
      today,
    });
    if (balanceMinor === null) throw new Error("Stored exam-fee invoice balance is invalid.");
    const current = balanceByEnrollment.get(invoice.enrollmentId);
    if (!current) throw new Error("An exam-fee invoice was returned for a non-roster student.");
    current.invoiceCount += 1;
    current.balanceMinor += balanceMinor;
    if (balanceMinor > 0) current.outstandingInvoiceCount += 1;
  }
  const clearanceByEnrollment = new Map(clearances.map((clearance) => [
    clearance.enrollmentId,
    clearance.reason,
  ]));
  const records: ExamCardRecord[] = roster.map((row) => {
    const balance = balanceByEnrollment.get(row.enrollmentId);
    if (!balance) throw new Error("A roster student's exam-fee status could not be calculated.");
    const clearanceReason = clearanceByEnrollment.get(row.enrollmentId) ?? null;
    const eligibility = getExamCardEligibility(balance.balanceMinor, clearanceReason);
    const photo = row.additionalDetails?.profilePhoto;
    return {
      id: row.enrollmentId,
      publicId: row.publicId,
      name: `${row.firstName} ${row.lastName}`.trim(),
      admissionNumber: row.admissionNumber,
      rollNumber: row.rollNumber,
      className: row.className,
      sectionName: row.sectionName,
      photoUrl: photo?.objectKey ? `/api/admin/students/${row.publicId}/photo` : null,
      eligibility,
      invoiceCount: balance.invoiceCount,
      outstandingInvoiceCount: balance.outstandingInvoiceCount,
      clearanceReason,
    };
  });
  const statusFilter = query.status === "blocked" || query.status === "eligible" ? query.status : "all";
  const visibleRecords = records.filter((record) =>
    statusFilter === "all" ||
    (statusFilter === "eligible" && record.eligibility !== "fees-outstanding") ||
    (statusFilter === "blocked" && record.eligibility === "fees-outstanding"),
  );
  const eligibleCount = records.filter((record) => record.eligibility !== "fees-outstanding").length;
  const exceptionCount = records.filter((record) => record.eligibility === "approved-exception").length;
  const selectionKey = [search, selectedClassId ?? "", statusFilter].join(":");
  const schoolName = school[0]?.name ?? context.schoolName;

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <Link href={`/admin/examinations/${exam.id}`} className={styles.backLink}>← {exam.name}</Link>
          <p className={styles.eyebrow}>EXAM SERVICES · {exam.yearName}</p>
          <h1>Exam access cards</h1>
          <p>
              ID-1/CR80 cards for students with no balance due for this exam&apos;s year and term, or an approved exception with a recorded reason. Students with no billed fees for this period have no balance due.
          </p>
        </div>
      </header>

      <section className={styles.summary} aria-label="Exam card eligibility summary">
        <div><strong>{records.length}</strong><span>Roster students</span></div>
        <div><strong>{eligibleCount}</strong><span>Eligible to receive a card</span></div>
        <div><strong>{exceptionCount}</strong><span>Approved fee exceptions</span></div>
        <div><strong>{records.length - eligibleCount}</strong><span>Balance due</span></div>
      </section>

      <SmartFilterForm method="get" action={`/admin/examinations/${exam.id}/cards`} className={styles.filters}>
        <label className={styles.searchField}>Search by name, admission no., roll no., class or section
          <input type="search" name="search" placeholder="Start typing to filter" defaultValue={search} />
        </label>
        <label>Class
          <select name="classLevelId" defaultValue={selectedClassId ? String(selectedClassId) : ""}>
            <option value="">All classes</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Eligibility
          <select name="status" defaultValue={statusFilter}>
            <option value="all">All students</option>
            <option value="eligible">Eligible cards</option>
            <option value="blocked">Balance due</option>
          </select>
        </label>
      </SmartFilterForm>

      <ExamCardRegister
        key={selectionKey}
        examId={exam.id}
        examName={exam.name}
        examYear={exam.yearName}
        examStartDate={exam.startDate}
        examEndDate={exam.endDate}
        records={visibleRecords}
        schoolName={schoolName}
        schoolLogo={schoolLogoSource(school[0]?.logoUrl ?? null)}
        schoolAddress={school[0]?.address ?? null}
        schoolPhone={school[0]?.phone ?? null}
      />

      {roster.length === 3000 && (
        <p className={styles.limitNotice}>Showing the first 3,000 roster students. Narrow the search or class filter to process additional records.</p>
      )}
    </main>
  );
}
