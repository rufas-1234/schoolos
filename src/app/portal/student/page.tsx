import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
} from "lucide-react";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classRooms,
  classRoutines,
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
  feeGroups,
  feePayments,
  feePaymentReversals,
  feeStructures,
  feeTypes,
  libraryBooks,
  libraryLoans,
  studentAttendance,
  studentEnrollments,
  studentFeeInvoices,
  schoolBranches,
  schools,
  students,
  subjects,
  userStudentLinks,
} from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { requireSchoolMember } from "@/lib/access-control";
import {
  calculateWeightedAverage,
  gradeForPercentage,
  type GradeBand,
} from "@/lib/examination-policy";
import {
  calculateFineMinorUnits,
  calculateOutstandingInvoiceBalance,
  feeDisplayName,
  feeInvoiceStatus,
  formatFeeReportDate,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import { FamilyPortalShell } from "../family-portal-shell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  section?: string | string[];
  results?: string;
  fees?: string;
  library?: string;
  timetable?: string;
}>;

export default async function StudentPortalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [context, query] = await Promise.all([requireSchoolMember(), searchParams]);
  const requestedSection = typeof query.section === "string" ? query.section : "overview";
  const activeSection = [
    "overview",
    "learning",
    "timetable",
    "results",
    "fees",
    "receipts",
    "profile",
    "library",
    "attendance",
  ].includes(requestedSection) ? requestedSection : "overview";
  const linkedStudentRecords = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "student"),
    ));
  const linkedStudentIds = linkedStudentRecords.map(({ studentId }) => studentId);
  const libraryFilter = query.library?.trim().slice(0, 100) ?? "";
  const timetableFilter = typeof query.timetable === "string" ? query.timetable : "all";
  const linkedStudents = linkedStudentIds.length || context.user.email
    ? await db.select({
    id: students.id,
    publicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    dateOfBirth: students.dateOfBirth,
    admissionDate: students.admissionDate,
    gender: students.gender,
    email: students.email,
    phone: students.phone,
    religion: students.religion,
    bloodGroup: students.bloodGroup,
    currentAddress: students.currentAddress,
    permanentAddress: students.permanentAddress,
    fatherName: students.fatherName,
    fatherPhone: students.fatherPhone,
    motherName: students.motherName,
    motherPhone: students.motherPhone,
    guardianName: students.guardianName,
    guardianRelation: students.guardianRelation,
    guardianEmail: students.guardianEmail,
    guardianPhone: students.guardianPhone,
    guardianAddress: students.guardianAddress,
    status: students.status,
  }).from(students)
    .where(and(
      eq(students.schoolId, context.schoolId),
      inArray(students.status, ["admitted", "active"]),
      linkedStudentIds.length
        ? inArray(students.id, linkedStudentIds)
        : eq(students.email, context.user.email!),
    ))
    : [];
  const studentIds = linkedStudents.map((student) => student.id);

  const [enrollments, attendance, resultRows, invoices, loans, books] = studentIds.length
    ? await Promise.all([
      db.select({
        id: studentEnrollments.id,
        studentId: studentEnrollments.studentId,
        classSectionId: studentEnrollments.classSectionId,
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
        academicYearId: studentEnrollments.academicYearId,
      }).from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(students, and(
          eq(students.id, studentEnrollments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, studentEnrollments.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, studentIds),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ))
        .orderBy(desc(academicYears.startDate)),
      db.select({
        studentId: studentAttendance.studentId,
        attendanceDate: studentAttendance.attendanceDate,
        status: studentAttendance.status,
      }).from(studentAttendance)
        .where(and(
          eq(studentAttendance.schoolId, context.schoolId),
          inArray(studentAttendance.studentId, studentIds),
        ))
        .orderBy(desc(studentAttendance.attendanceDate))
        .limit(40),
      db.select({
        studentId: studentEnrollments.studentId,
        enrollmentId: studentEnrollments.id,
        examId: examinations.id,
        examName: examinations.name,
        yearName: academicYears.name,
        className: classLevels.name,
        sectionName: classSections.name,
        rollNumber: studentEnrollments.rollNumber,
        admissionNumber: students.admissionNumber,
        termName: academicTerms.name,
        examClassId: examClasses.id,
        principalRemark: examClasses.principalRemark,
        gradingScaleId: examGradingScales.id,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        marks: examMarks.marks,
        teacherRemark: examMarks.teacherRemark,
        maxMarks: examSubjects.maxMarks,
        weight: examSubjects.weight,
        examDate: examSubjects.examDate,
      }).from(examMarks)
        .innerJoin(studentEnrollments, and(
          eq(studentEnrollments.id, examMarks.enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(students, and(
          eq(students.id, studentEnrollments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, studentEnrollments.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.schoolId, context.schoolId),
          eq(examinations.academicYearId, studentEnrollments.academicYearId),
          eq(examinations.status, "published"),
          or(
            isNull(examinations.branchId),
            eq(examinations.branchId, students.branchId!),
          ),
        ))
        .innerJoin(examGradingScales, and(
          eq(examGradingScales.id, examinations.gradingScaleId),
          eq(examGradingScales.schoolId, context.schoolId),
        ))
        .innerJoin(examClasses, and(
          eq(examClasses.examinationId, examinations.id),
          eq(examClasses.classLevelId, classLevels.id),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examSubjects, and(
          eq(examSubjects.id, examMarks.examSubjectId),
          eq(examSubjects.examClassId, examClasses.id),
          eq(examSubjects.schoolId, context.schoolId),
          eq(examSubjects.status, "published"),
        ))
        .innerJoin(classSubjects, and(
          eq(classSubjects.id, examSubjects.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .leftJoin(academicTerms, and(
          eq(academicTerms.id, examinations.academicTermId!),
          eq(academicTerms.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examMarks.schoolId, context.schoolId),
          eq(studentEnrollments.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, studentIds),
          eq(studentEnrollments.status, "enrolled"),
        ))
        .orderBy(asc(subjects.name)),
      db.select({
        id: studentFeeInvoices.id,
        studentId: studentFeeInvoices.studentId,
        invoiceNumber: studentFeeInvoices.invoiceNumber,
        amount: studentFeeInvoices.amount,
        discountAmount: studentFeeInvoices.discountAmount,
        fineType: studentFeeInvoices.fineType,
        fineValue: studentFeeInvoices.fineValue,
        dueDate: studentFeeInvoices.dueDate,
        createdAt: studentFeeInvoices.createdAt,
        typeName: feeTypes.name,
        groupName: feeGroups.name,
        branchName: schoolBranches.name,
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
        termName: academicTerms.name,
        admissionNumber: students.admissionNumber,
        rollNumber: studentEnrollments.rollNumber,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        guardianName: students.guardianName,
        guardianAddress: students.guardianAddress,
        guardianPhone: students.guardianPhone,
        fatherName: students.fatherName,
        fatherPhone: students.fatherPhone,
      }).from(studentFeeInvoices)
        .innerJoin(students, and(
          eq(students.id, studentFeeInvoices.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(studentEnrollments, and(
          eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(schoolBranches, and(
          eq(schoolBranches.id, classLevels.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
        .innerJoin(feeStructures, and(
          eq(feeStructures.id, studentFeeInvoices.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, feeStructures.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .leftJoin(academicTerms, and(
          eq(academicTerms.id, feeStructures.academicTermId!),
          eq(academicTerms.schoolId, context.schoolId),
        ))
        .innerJoin(feeGroups, and(
          eq(feeGroups.id, feeStructures.feeGroupId),
          eq(feeGroups.schoolId, context.schoolId),
        ))
        .innerJoin(feeTypes, and(
          eq(feeTypes.id, feeStructures.feeTypeId),
          eq(feeTypes.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          inArray(studentFeeInvoices.studentId, studentIds),
        ))
        .orderBy(desc(studentFeeInvoices.dueDate)),
      db.select({
        studentId: libraryLoans.studentId,
        title: libraryBooks.title,
        author: libraryBooks.author,
        issuedAt: libraryLoans.issuedAt,
        dueDate: libraryLoans.dueDate,
        returnedAt: libraryLoans.returnedAt,
        status: libraryLoans.status,
      }).from(libraryLoans)
        .innerJoin(libraryBooks, and(
          eq(libraryBooks.id, libraryLoans.bookId),
          eq(libraryBooks.schoolId, context.schoolId),
        ))
        .where(and(
          eq(libraryLoans.schoolId, context.schoolId),
          inArray(libraryLoans.studentId, studentIds),
        ))
        .orderBy(desc(libraryLoans.issuedAt)),
      db.select({
        title: libraryBooks.title,
        author: libraryBooks.author,
        category: libraryBooks.category,
        availableCopies: libraryBooks.availableCopies,
      }).from(libraryBooks)
        .where(and(
          eq(libraryBooks.schoolId, context.schoolId),
          eq(libraryBooks.status, "active"),
          libraryFilter
            ? or(
              like(libraryBooks.title, `%${libraryFilter}%`),
              like(libraryBooks.author, `%${libraryFilter}%`),
              like(libraryBooks.category, `%${libraryFilter}%`),
            )
            : undefined,
        ))
        .orderBy(libraryBooks.title)
        .limit(libraryFilter ? 250 : 50),
    ])
    : [[], [], [], [], [], []];

  const newestEnrollmentByStudent = new Map<number, (typeof enrollments)[number]>();
  for (const enrollment of enrollments) {
    if (!newestEnrollmentByStudent.has(enrollment.studentId)) {
      newestEnrollmentByStudent.set(enrollment.studentId, enrollment);
    }
  }
  const currentEnrollments = [...newestEnrollmentByStudent.values()];
  const currentSectionIds = [...new Set(currentEnrollments.map((enrollment) => enrollment.classSectionId))];
  const timetable = currentSectionIds.length
    ? await db.select({
      classSectionId: classRoutines.classSectionId,
      dayOfWeek: classRoutines.dayOfWeek,
      startsAt: classRoutines.startsAt,
      endsAt: classRoutines.endsAt,
      subjectName: subjects.name,
      roomNumber: classRooms.roomNumber,
    }).from(classRoutines)
      .innerJoin(classSubjects, and(
        eq(classSubjects.id, classRoutines.classSubjectId),
        eq(classSubjects.schoolId, context.schoolId),
      ))
      .innerJoin(subjects, and(
        eq(subjects.id, classSubjects.subjectId),
        eq(subjects.schoolId, context.schoolId),
      ))
      .leftJoin(classRooms, and(
        eq(classRooms.id, classRoutines.classRoomId!),
        eq(classRooms.schoolId, context.schoolId),
      ))
      .where(and(
        eq(classRoutines.schoolId, context.schoolId),
        inArray(classRoutines.classSectionId, currentSectionIds),
      ))
      .orderBy(classRoutines.dayOfWeek, classRoutines.startsAt)
    : [];
  const weekdays = new Map([[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"]]);

  const reportGroups = new Map<string, {
    studentId: number;
    enrollmentId: number;
    examId: number;
    examName: string;
    yearName: string;
    className: string;
    sectionName: string;
    rollNumber: string | null;
    admissionNumber: string | null;
    termName: string | null;
    examClassId: number;
    principalRemark: string | null;
    gradingScaleId: number;
    rows: typeof resultRows;
  }>();
  for (const row of resultRows) {
    const key = `${row.studentId}:${row.examId}:${row.enrollmentId}`;
    const group = reportGroups.get(key);
    if (group) group.rows.push(row);
    else reportGroups.set(key, {
      studentId: row.studentId,
      enrollmentId: row.enrollmentId,
      examId: row.examId,
      examName: row.examName,
      yearName: row.yearName,
      className: row.className,
      sectionName: row.sectionName,
      rollNumber: row.rollNumber,
      admissionNumber: row.admissionNumber,
      termName: row.termName,
      examClassId: row.examClassId,
      principalRemark: row.principalRemark,
      gradingScaleId: row.gradingScaleId,
      rows: [row],
    });
  }
  const completeReports = [...reportGroups.values()].flatMap((report) => {
    if (report.rows.some((row) => row.marks === null)) return [];
    const score = calculateWeightedAverage(report.rows.map((row) => ({
      marks: Number(row.marks),
      maxMarks: Number(row.maxMarks),
      weight: Number(row.weight),
    })));
    return score ? [{ ...report, score }] : [];
  });
  const scaleIds = [...new Set(completeReports.map((report) => report.gradingScaleId))];
  const gradeBands = scaleIds.length
    ? await db.select({
      gradingScaleId: examGradeBands.gradingScaleId,
      minPercent: examGradeBands.minPercent,
      maxPercent: examGradeBands.maxPercent,
      grade: examGradeBands.grade,
      description: examGradeBands.description,
      performanceRemark: examGradeBands.performanceRemark,
    }).from(examGradeBands)
      .where(inArray(examGradeBands.gradingScaleId, scaleIds))
      .orderBy(examGradeBands.sortOrder)
    : [];
  const gradesByScale = new Map<number, GradeBand[]>();
  for (const band of gradeBands) {
    const bands = gradesByScale.get(band.gradingScaleId) ?? [];
    bands.push({
      minPercent: Number(band.minPercent),
      maxPercent: Number(band.maxPercent),
      grade: band.grade,
      description: band.description,
      performanceRemark: band.performanceRemark,
    });
    gradesByScale.set(band.gradingScaleId, bands);
  }
  const reportRemarks = completeReports.length
    ? await db.select({
      examClassId: examStudentRemarks.examClassId,
      enrollmentId: examStudentRemarks.enrollmentId,
      remark: examStudentRemarks.classTeacherRemark,
    }).from(examStudentRemarks)
      .where(and(
        eq(examStudentRemarks.schoolId, context.schoolId),
        inArray(examStudentRemarks.examClassId, [...new Set(completeReports.map((report) => report.examClassId))]),
        inArray(examStudentRemarks.enrollmentId, [...new Set(completeReports.map((report) => report.enrollmentId))]),
      ))
    : [];
  const remarksByReport = new Map(reportRemarks.map((remark) => [
    `${remark.examClassId}:${remark.enrollmentId}`,
    remark.remark,
  ]));
  const reports = completeReports.map((report) => {
    const bands = gradesByScale.get(report.gradingScaleId) ?? [];
    return {
      ...report,
      grade: gradeForPercentage(report.score.percentage, bands),
      classTeacherRemark: remarksByReport.get(`${report.examClassId}:${report.enrollmentId}`) ?? null,
      rows: report.rows.map((row) => {
        const percentage = Number(row.marks) / Number(row.maxMarks) * 100;
        return {
          ...row,
          percentage,
          grade: gradeForPercentage(percentage, bands),
        };
      }),
    };
  });
  const schoolDetails = await db.select({
    name: schools.name,
    address: schools.address,
    phone: schools.phone,
    email: schools.email,
  }).from(schools).where(eq(schools.id, context.schoolId)).limit(1);
  const schoolLogo = schoolLogoSource(context.schoolLogoUrl);

  const paymentRows = invoices.length
    ? await db.select({
      id: feePayments.id,
      invoiceId: feePayments.invoiceId,
      studentId: studentFeeInvoices.studentId,
      invoiceNumber: studentFeeInvoices.invoiceNumber,
      receiptNumber: feePayments.receiptNumber,
      amount: feePayments.amount,
      fineAmount: feePayments.fineAmount,
      reversedAmount: feePayments.reversedAmount,
      paymentMethod: feePayments.paymentMethod,
      reference: feePayments.reference,
      paidAt: feePayments.paidAt,
      notes: feePayments.notes,
    }).from(feePayments)
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
        inArray(studentFeeInvoices.studentId, studentIds),
      ))
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        inArray(feePayments.invoiceId, invoices.map((invoice) => invoice.id)),
      ))
      .orderBy(desc(feePayments.paidAt))
    : [];
  const reversalRows = paymentRows.length
    ? await db.select({
      paymentId: feePaymentReversals.paymentId,
      amount: feePaymentReversals.amount,
      reversalType: feePaymentReversals.reversalType,
      reason: feePaymentReversals.reason,
      reference: feePaymentReversals.reference,
      createdAt: feePaymentReversals.createdAt,
    }).from(feePaymentReversals)
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        inArray(feePaymentReversals.paymentId, paymentRows.map((payment) => payment.id)),
      ))
      .orderBy(asc(feePaymentReversals.createdAt))
    : [];
  const reversalsByPayment = new Map<number, typeof reversalRows>();
  for (const reversal of reversalRows) {
    const current = reversalsByPayment.get(reversal.paymentId) ?? [];
    current.push(reversal);
    reversalsByPayment.set(reversal.paymentId, current);
  }
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
  const today = formatFeeReportDate(new Date(), context.schoolTimezone);
  const invoiceRows = invoices.map((invoice) => {
    const balanceMinor = calculateOutstandingInvoiceBalance({
      amount: invoice.amount,
      discountAmount: invoice.discountAmount,
      fineType: invoice.fineType,
      fineValue: invoice.fineValue,
      dueDate: invoice.dueDate,
      paidMinor: paidByInvoice.get(invoice.id) ?? 0,
      today,
    });
    if (balanceMinor === null) throw new Error("Stored fee invoice balance is invalid.");
    const amountMinor = parseMoneyToMinorUnits(invoice.amount);
    const discountMinor = parseMoneyToMinorUnits(invoice.discountAmount);
    if (amountMinor === null || discountMinor === null) throw new Error("Stored fee invoice amount is invalid.");
    const fineMinor = today > invoice.dueDate
      ? calculateFineMinorUnits(amountMinor - discountMinor, invoice.fineType, invoice.fineValue)
      : 0;
    if (fineMinor === null) throw new Error("Stored fee invoice fine is invalid.");
    return {
      ...invoice,
      balanceMinor,
      paidMinor: paidByInvoice.get(invoice.id) ?? 0,
      amountMinor,
      discountMinor,
      fineMinor,
    };
  });
  const totalBalanceMinor = invoiceRows.reduce((total, invoice) => total + invoice.balanceMinor, 0);
  if (!Number.isSafeInteger(totalBalanceMinor)) throw new Error("Outstanding fee balance exceeds the supported range.");
  const resultSearch = query.results?.trim().slice(0, 100).toLocaleLowerCase() ?? "";
  const feeFilter = query.fees === "outstanding" ? "outstanding" : "all";
  const librarySearch = libraryFilter.toLocaleLowerCase();
  const visibleReports = reports.filter((report) =>
    !resultSearch || `${report.examName} ${report.yearName} ${report.termName ?? ""} ${
      linkedStudents.find((student) => student.id === report.studentId)?.firstName ?? ""
    } ${linkedStudents.find((student) => student.id === report.studentId)?.lastName ?? ""}`.toLocaleLowerCase().includes(resultSearch),
  );
  const visibleInvoices = invoiceRows.filter((invoice) => feeFilter !== "outstanding" || invoice.balanceMinor > 0);
  const visibleLoans = loans.filter((loan) =>
    !librarySearch || `${loan.title} ${loan.author} ${loan.status}`.toLocaleLowerCase().includes(librarySearch),
  );
  const visibleBooks = books.filter((book) =>
    !librarySearch || `${book.title} ${book.author} ${book.category ?? ""}`.toLocaleLowerCase().includes(librarySearch),
  );
  const visibleTimetable = timetable.filter((lesson) =>
    timetableFilter === "all" || lesson.dayOfWeek === Number(timetableFilter),
  );
  const formatMoney = (minor: number) => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: context.schoolCurrency,
  }).format(minor / 100);
  const paymentMethodLabel = (method: string) => method.replaceAll("_", " ");

  return (
    <FamilyPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalType="student"
    >
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Student portal</p>
          <h1 className="mt-2 text-2xl font-bold capitalize text-slate-950 sm:text-3xl">
            {activeSection === "overview" ? `Welcome, ${context.user.name}` : activeSection === "fees" ? "Invoices and fees" : activeSection === "receipts" ? "Payment receipts" : activeSection === "timetable" ? "Class timetable" : activeSection === "results" ? "Exam results" : activeSection === "profile" ? "My profile" : activeSection === "library" ? "Library" : activeSection === "attendance" ? "Attendance" : "My learning"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {activeSection === "overview"
              ? "A clear overview of your learning, results, attendance, and school services."
              : activeSection === "profile"
                ? "Your student profile is read-only. Contact the school office to request a correction."
                : "View your official school records and information."}
          </p>
        </header>

        {linkedStudents.length === 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <h2 className="font-semibold">Student account not linked</h2>
            <p className="mt-1 leading-6">
              This account is not matched to an active student record. Ask the school administrator to link your student profile.
            </p>
          </section>
        ) : (
          <>
            <section aria-label="Student summary" className={`grid grid-cols-2 gap-3 xl:grid-cols-4 ${activeSection !== "overview" ? "hidden" : ""}`}>
              <SummaryCard icon={GraduationCap} label="Student profiles" value={linkedStudents.length} />
              <SummaryCard icon={CalendarDays} label="Weekly lessons" value={timetable.length} />
              <SummaryCard icon={ClipboardCheck} label="Published reports" value={reports.length} />
              <SummaryCard icon={CalendarDays} label="Attendance records" value={attendance.length} />
            </section>
            <section className={`grid gap-4 lg:grid-cols-[1.2fr_0.8fr] ${activeSection !== "overview" ? "hidden" : ""}`}>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-slate-950">Current class placement</h2>
                <div className="mt-3 divide-y divide-slate-100">
                  {linkedStudents.map((student) => {
                    const enrollment = newestEnrollmentByStudent.get(student.id);
                    return (
                      <p key={student.id} className="py-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{student.firstName} {student.lastName}</span>
                        <span className="mt-1 block text-slate-500">
                          {enrollment ? `${enrollment.className} · ${enrollment.sectionName} · ${enrollment.yearName}` : "No active-year class placement"}
                        </span>
                      </p>
                    );
                  })}
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-slate-950">Outstanding fees</h2>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(totalBalanceMinor)}</p>
                <Link href="/portal/student?section=fees" className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:text-violet-900">
                  View invoices
                </Link>
              </article>
              <nav aria-label="Student portal shortcuts" className="grid gap-2 sm:grid-cols-2 lg:col-span-2">
                {[
                  ["results", "View exam results"],
                  ["timetable", "Open class timetable"],
                  ["receipts", "View payment receipts"],
                  ["profile", "View student profile"],
                ].map(([section, label]) => (
                  <Link key={section} href={`/portal/student?section=${section}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-800">
                    {label} <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </nav>
            </section>

            <section id="learning" className={`space-y-4 ${activeSection !== "learning" ? "hidden" : ""}`}>
              <SectionHeading title="My learning" description="Your current active-year class placement." />
              <div className="grid gap-4 lg:grid-cols-2">
                {linkedStudents.map((student) => {
                  const enrollment = newestEnrollmentByStudent.get(student.id);
                  return (
                    <article key={student.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {student.admissionNumber ? `Admission no. ${student.admissionNumber}` : "Student profile"}
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-slate-950">{student.firstName} {student.lastName}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {enrollment
                          ? `${enrollment.className} · ${enrollment.sectionName} · ${enrollment.yearName}`
                          : "No active-year class placement is available yet."}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section id="timetable" className={`space-y-4 ${activeSection !== "timetable" ? "hidden" : ""}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading title="Class timetable" description="Weekly lesson times for your current class section." />
                {timetable.length > 0 && <PrintButton targetId="student-timetable-print" label="Print timetable" pageOrientation="landscape" />}
              </div>
              <FilterForm
                name="timetable"
                value={timetableFilter}
                placeholder=""
                selectOptions={[
                  { value: "all", label: "All weekdays" },
                  ...[1, 2, 3, 4, 5].map((day) => ({ value: String(day), label: weekdays.get(day) ?? `Day ${day}` })),
                ]}
              />
              {visibleTimetable.length ? (
                <div id="student-timetable-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="grid gap-3 p-3 sm:hidden print:hidden">
                    {visibleTimetable.map((lesson, index) => {
                      const enrollment = currentEnrollments.find((entry) => entry.classSectionId === lesson.classSectionId);
                      const student = linkedStudents.find((entry) => entry.id === enrollment?.studentId);
                      return (
                        <article key={`${lesson.classSectionId}-${lesson.dayOfWeek}-${lesson.startsAt}-${lesson.subjectName}-${index}`} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-bold text-slate-950">{lesson.subjectName}</h3>
                            <span className="shrink-0 text-xs font-semibold text-violet-700">{weekdays.get(lesson.dayOfWeek) ?? `Day ${lesson.dayOfWeek}`}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{lesson.startsAt}–{lesson.endsAt}</p>
                          <p className="mt-1 text-xs text-slate-500">Room {lesson.roomNumber ?? "not assigned"}</p>
                          {linkedStudents.length > 1 && student && <p className="mt-1 text-xs text-slate-500">{student.firstName} {student.lastName}</p>}
                        </article>
                      );
                    })}
                  </div>
                  <div className="hidden overflow-x-auto sm:block print:block">
                    <table className="w-full min-w-[35rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Day</th>
                          <th className="px-4 py-3 font-semibold">Time</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                          {linkedStudents.length > 1 && <th className="px-4 py-3 font-semibold">Student</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleTimetable.map((lesson, index) => {
                          const enrollment = currentEnrollments.find((entry) => entry.classSectionId === lesson.classSectionId);
                          const student = linkedStudents.find((entry) => entry.id === enrollment?.studentId);
                          return (
                            <tr key={`${lesson.classSectionId}-${lesson.dayOfWeek}-${lesson.startsAt}-${lesson.subjectName}-${index}`}>
                              <td className="px-4 py-3 font-medium text-slate-900">{weekdays.get(lesson.dayOfWeek) ?? `Day ${lesson.dayOfWeek}`}</td>
                              <td className="px-4 py-3 text-slate-700">{lesson.startsAt}–{lesson.endsAt}</td>
                              <td className="px-4 py-3 text-slate-700">{lesson.subjectName}</td>
                              <td className="px-4 py-3 text-slate-700">{lesson.roomNumber ?? "Not assigned"}</td>
                              {linkedStudents.length > 1 && (
                                <td className="px-4 py-3 text-slate-700">{student ? `${student.firstName} ${student.lastName}` : "—"}</td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : <EmptyState>No timetable has been scheduled for your current class yet.</EmptyState>}
            </section>

            <section id="results" className={`space-y-4 ${activeSection !== "results" ? "hidden" : ""}`}>
              <SectionHeading title="Published results" description="Printable report-style summaries are available after every subject result is published." />
              <FilterForm name="results" value={query.results ?? ""} placeholder="Search reports by exam or student" />
              {visibleReports.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {visibleReports.map((report) => {
                    const student = linkedStudents.find((entry) => entry.id === report.studentId);
                    return (
                      <article
                        key={`${report.examId}-${report.enrollmentId}`}
                        id={`student-report-${report.examId}-${report.enrollmentId}`}
                        className="exam-report-document a4-report-card a4-report-card-last print-report-content space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-7"
                      >
                        <header className="print:hidden flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-700">Published report card</p>
                          <PrintButton targetId={`student-report-${report.examId}-${report.enrollmentId}`} label="Print / save A4 PDF" pageSize="A4" />
                        </header>
                        <header className="print-report-heading flex items-center gap-4">
                          {schoolLogo && (
                            <Image src={schoolLogo} unoptimized width={64} height={64} alt={`${context.schoolName} logo`} className="exam-report-school-logo h-16 w-16 rounded-lg object-contain" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="exam-report-school-name text-sm font-semibold uppercase tracking-wide text-violet-700">{schoolDetails[0]?.name ?? context.schoolName}</p>
                            <p className="exam-report-school-contact mt-0.5 text-xs text-slate-600">
                              {[schoolDetails[0]?.address, schoolDetails[0]?.phone, schoolDetails[0]?.email].filter(Boolean).join(" · ")}
                            </p>
                            <h2 className="mt-1 text-2xl font-bold">Statement of Marks</h2>
                            <p className="mt-1 text-sm text-slate-600">{report.examName} · {report.termName ?? report.yearName}</p>
                          </div>
                        </header>
                        <section className="exam-report-student-details grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                          <p><span className="font-semibold text-slate-500">Student</span><br />{student ? `${student.firstName} ${student.lastName}` : "—"}</p>
                          <p><span className="font-semibold text-slate-500">Admission number</span><br />{report.admissionNumber ?? "—"}</p>
                          <p><span className="font-semibold text-slate-500">Class / section</span><br />{report.className} · {report.sectionName}</p>
                          <p><span className="font-semibold text-slate-500">Academic year</span><br />{report.yearName}</p>
                          <p><span className="font-semibold text-slate-500">Term</span><br />{report.termName ?? "Not specified"}</p>
                          {report.rollNumber && <p><span className="font-semibold text-slate-500">Roll number</span><br />{report.rollNumber}</p>}
                        </section>
                        <section className="grid gap-3 sm:grid-cols-2">
                          <article className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall performance</p>
                            <p className="mt-1 text-3xl font-bold text-slate-900">{report.score.percentage.toFixed(2)}%</p>
                            <p className="mt-1 text-sm text-slate-600">{report.score.totalMarks.toFixed(2)} of {report.score.maxMarks.toFixed(2)} · Grade {report.grade?.grade ?? "—"}{report.grade?.description ? ` · ${report.grade.description}` : ""}</p>
                          </article>
                        </section>
                        <section className="print-report-panel overflow-x-auto rounded-xl border border-slate-200">
                          <table className="print-report-table w-full min-w-[640px] border-collapse text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                              <tr><th className="p-3">Subject</th><th className="p-3">Marks</th><th className="p-3">Percentage</th><th className="p-3">Grade</th><th className="p-3">Teacher remark</th></tr>
                            </thead>
                            <tbody>{report.rows.map((row, index) => (
                              <tr key={`${row.subjectName}-${row.examDate}-${index}`} className="border-t border-slate-200">
                                <td className="p-3 font-medium">{row.subjectName} {row.subjectCode && <span className="text-xs text-slate-500">{row.subjectCode}</span>}</td>
                                <td className="p-3">{row.marks} / {row.maxMarks}</td>
                                <td className="p-3">{row.percentage.toFixed(2)}%</td>
                                <td className="p-3">{row.grade?.grade ?? "—"}{row.grade && <span className="ml-1 text-xs text-slate-500">{row.grade.description}</span>}</td>
                                <td className="p-3">{row.teacherRemark || row.grade?.performanceRemark || "—"}</td>
                              </tr>
                            ))}</tbody>
                            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                              <tr><td className="p-3">Overall</td><td className="p-3">{report.score.totalMarks.toFixed(2)} / {report.score.maxMarks.toFixed(2)}</td><td className="p-3">{report.score.percentage.toFixed(2)}%</td><td className="p-3">{report.grade?.grade ?? "—"} {report.grade?.description}</td><td className="p-3">{report.grade?.performanceRemark ?? ""}</td></tr>
                            </tfoot>
                          </table>
                        </section>
                        <section className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-xl border p-4"><h3 className="font-bold">Class teacher&apos;s remarks</h3><p className="mt-2 text-sm">{report.classTeacherRemark || report.grade?.performanceRemark || "—"}</p></div>
                          <div className="rounded-xl border p-4"><h3 className="font-bold">Headteacher&apos;s remarks</h3><p className="mt-2 text-sm">{report.principalRemark || "—"}</p></div>
                        </section>
                        <section className="grid grid-cols-3 gap-3 pt-4 text-center text-xs">
                          {(["Headteacher", "Class teacher", "Subject teacher"] as const).map((label) => (
                            <div key={label} className="flex min-h-16 flex-col justify-end pt-1">
                              <div className="border-t border-slate-500 pt-1">{label} signature</div>
                            </div>
                          ))}
                        </section>
                        <footer className="flex flex-wrap justify-between gap-2 border-t pt-3 text-xs text-slate-500">
                          <span>{context.schoolName}</span><span>{report.examName} · {report.yearName}</span>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState>No complete published reports match this search.</EmptyState>}
            </section>

            <section id="fees" className={`space-y-4 ${activeSection !== "fees" ? "hidden" : ""}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading title="Fee invoices" description="Invoices and balances use the school’s official fee records, including discounts, payments, reversals, and overdue fines." />
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
                  Total outstanding: {formatMoney(totalBalanceMinor)}
                </p>
              </div>
              <FilterForm
                name="fees"
                value={feeFilter}
                placeholder=""
                selectOptions={[{ value: "all", label: "All invoices" }, { value: "outstanding", label: "Outstanding only" }]}
              />
              {visibleInvoices.length ? (
                <div className="grid gap-5">
                  {visibleInvoices.map((invoice) => (
                    <article
                      key={invoice.id}
                      id={`student-invoice-${invoice.id}`}
                      className="fee-invoice-page fee-invoice-card space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-7"
                    >
                      <header className="fee-invoice-title-row flex flex-wrap items-start justify-between gap-5">
                        <div>
                          <h2 className="fee-invoice-title">INVOICE</h2>
                          <p className="mt-2 text-base font-bold text-slate-900">{schoolDetails[0]?.name ?? context.schoolName}</p>
                          {[schoolDetails[0]?.address, schoolDetails[0]?.email, schoolDetails[0]?.phone].filter(Boolean).map((detail, index) => (
                            <p key={`${index}-${detail}`} className="mt-1 text-sm text-slate-600">{detail}</p>
                          ))}
                        </div>
                        <div className="flex flex-col items-start gap-3 sm:items-end">
                          <div className="fee-invoice-number-block">
                            <span>Invoice #</span>
                            <strong>{invoice.invoiceNumber}</strong>
                          </div>
                          <PrintButton targetId={`student-invoice-${invoice.id}`} label="Print invoice" />
                        </div>
                      </header>
                      <section className="fee-invoice-parties grid gap-5 sm:grid-cols-2">
                        <div>
                          <h3>BILL TO</h3>
                          <p className="font-semibold">{invoice.guardianName || invoice.fatherName || `${invoice.studentFirstName} ${invoice.studentLastName}`}</p>
                          {invoice.guardianAddress && <p>{invoice.guardianAddress}</p>}
                          {(invoice.guardianPhone || invoice.fatherPhone) && <p>{invoice.guardianPhone || invoice.fatherPhone}</p>}
                          {invoice.guardianName && <p>Parent / guardian of {invoice.studentFirstName} {invoice.studentLastName}</p>}
                        </div>
                        <div>
                          <h3>STUDENT</h3>
                          <p className="font-semibold">{invoice.studentFirstName} {invoice.studentLastName}</p>
                          <p>Admission No. {invoice.admissionNumber || "—"} · Roll {invoice.rollNumber || "—"}</p>
                          <p>{invoice.branchName} · {invoice.className} ({invoice.sectionName})</p>
                        </div>
                      </section>
                      <dl className="fee-invoice-meta grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
                        <div><dt>Invoice date</dt><dd>{invoice.createdAt.toISOString().slice(0, 10)}</dd></div>
                        <div><dt>Academic year</dt><dd>{invoice.yearName}</dd></div>
                        <div><dt>Term</dt><dd>{invoice.termName || "—"}</dd></div>
                        <div><dt>Due date</dt><dd>{invoice.dueDate}</dd></div>
                      </dl>
                      <div className="fee-invoice-divider" aria-hidden="true">★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★</div>
                      <div className="overflow-x-auto">
                        <table className="fee-invoice-items w-full min-w-[34rem] border-collapse text-left text-sm">
                          <thead>
                            <tr><th>Qty</th><th>Description</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>1</td>
                              <td>{feeDisplayName(invoice.typeName)}{invoice.groupName ? ` · ${invoice.groupName}` : ""}</td>
                              <td className="text-right">{context.schoolCurrency} {(invoice.amountMinor / 100).toFixed(2)}</td>
                              <td className="text-right">{context.schoolCurrency} {(invoice.amountMinor / 100).toFixed(2)}</td>
                            </tr>
                            {invoice.discountMinor > 0 && <tr><td></td><td>Discount</td><td></td><td className="text-right">− {context.schoolCurrency} {(invoice.discountMinor / 100).toFixed(2)}</td></tr>}
                            {invoice.fineMinor > 0 && <tr><td></td><td>Late fine</td><td></td><td className="text-right">{context.schoolCurrency} {(invoice.fineMinor / 100).toFixed(2)}</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="fee-invoice-totals ml-auto grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-right text-sm">
                        <span>Subtotal</span><strong>{context.schoolCurrency} {(invoice.amountMinor / 100).toFixed(2)}</strong>
                        {invoice.discountMinor > 0 && <><span>Discount</span><strong>− {context.schoolCurrency} {(invoice.discountMinor / 100).toFixed(2)}</strong></>}
                        {invoice.fineMinor > 0 && <><span>Late fine</span><strong>{context.schoolCurrency} {(invoice.fineMinor / 100).toFixed(2)}</strong></>}
                        <span className="fee-invoice-total-label">Total</span><strong className="fee-invoice-total-amount">{context.schoolCurrency} {((invoice.amountMinor - invoice.discountMinor + invoice.fineMinor) / 100).toFixed(2)}</strong>
                        <span>Amount paid</span><strong>{context.schoolCurrency} {(invoice.paidMinor / 100).toFixed(2)}</strong>
                        <span className="font-semibold">Amount due</span><strong className="fee-invoice-balance">{context.schoolCurrency} {(invoice.balanceMinor / 100).toFixed(2)}</strong>
                        <span>Payment status</span><strong className="fee-invoice-status capitalize">{feeInvoiceStatus(invoice.amountMinor - invoice.discountMinor + invoice.fineMinor, invoice.paidMinor) ?? "unpaid"}</strong>
                      </div>
                      <footer className="fee-invoice-footer grid gap-5 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div>
                          <p className="fee-invoice-thank-you">Thank you</p>
                          <p className="mt-1 text-sm text-slate-600">We appreciate your timely payment.</p>
                        </div>
                        <div className="sm:text-right">
                          <h3>PAYMENT INFORMATION</h3>
                          <p>Use invoice number <strong>{invoice.invoiceNumber}</strong> as your payment reference.</p>
                          <p>Please keep this invoice for your records.</p>
                        </div>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : <EmptyState>No invoices match the selected filter.</EmptyState>}
            </section>

            <section id="receipts" className={`space-y-4 ${activeSection !== "receipts" ? "hidden" : ""}`}>
              <SectionHeading title="Payment receipts" description="Official receipts for payments recorded against your student invoices." />
              {paymentRows.length ? (
                <div className="grid gap-5">
                  {paymentRows.map((payment) => {
                    const amount = parseMoneyToMinorUnits(payment.amount);
                    const reversed = parseMoneyToMinorUnits(payment.reversedAmount);
                    const fine = parseMoneyToMinorUnits(payment.fineAmount);
                    const invoice = invoiceRows.find((row) => row.id === payment.invoiceId);
                    if (amount === null || reversed === null || fine === null || reversed > amount || !invoice) {
                      throw new Error("Stored fee receipt or invoice data is invalid.");
                    }
                    const net = amount - reversed;
                    const paymentReversals = reversalsByPayment.get(payment.id) ?? [];
                    return (
                      <article key={payment.id} id={`student-receipt-${payment.id}`} className="fee-receipt-page mx-auto w-full max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-6">
                        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Official payment receipt</p>
                            <h2 className="mt-1 text-2xl font-bold">{schoolDetails[0]?.name ?? context.schoolName}</h2>
                            <p className="mt-1 text-sm font-medium text-slate-600">Receipt no. {payment.receiptNumber}</p>
                          </div>
                          <PrintButton targetId={`student-receipt-${payment.id}`} label="Print receipt" />
                        </header>
                        <section className="fee-receipt-total rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Amount received</p>
                          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{context.schoolCurrency} {payment.amount}</p>
                          <p className="mt-2 text-sm text-slate-600">
                            Payment recorded on {formatFeeReportDate(payment.paidAt, context.schoolTimezone)}
                          </p>
                        </section>
                        <section className="grid gap-4 sm:grid-cols-2">
                          <ReceiptField label="Student" value={`${invoice.studentFirstName} ${invoice.studentLastName}`} />
                          <ReceiptField label="Admission / roll number" value={`${invoice.admissionNumber || "—"} / ${invoice.rollNumber || "—"}`} />
                          <ReceiptField label="Branch / class / section" value={`${invoice.branchName} / ${invoice.className} / ${invoice.sectionName}`} />
                          <ReceiptField label="Fee" value={feeDisplayName(invoice.typeName)} />
                          <ReceiptField label="Invoice" value={payment.invoiceNumber} />
                          <ReceiptField label="Payment method" value={paymentMethodLabel(payment.paymentMethod)} />
                          <ReceiptField label="Reference" value={payment.reference || "—"} />
                        </section>
                        <section className="space-y-3 rounded-xl bg-slate-50 p-5">
                          <ReceiptTotal label="Payment amount" value={`${context.schoolCurrency} ${payment.amount}`} />
                          <ReceiptTotal label="Reversed / refunded" value={formatMoney(reversed)} />
                          <ReceiptTotal label="Net payment retained" value={formatMoney(net)} />
                          <ReceiptTotal label="Late fine included" value={`${context.schoolCurrency} ${payment.fineAmount}`} />
                        </section>
                        {payment.notes && (
                          <div>
                            <h3 className="text-sm font-semibold">Notes</h3>
                            <p className="mt-1 text-sm text-slate-600">{payment.notes}</p>
                          </div>
                        )}
                        {paymentReversals.length > 0 && (
                          <section>
                            <h3 className="text-sm font-semibold">Reversals and refunds</h3>
                            <ul className="mt-2 space-y-2 text-sm text-slate-600">
                              {paymentReversals.map((reversal, index) => (
                                <li key={`${reversal.createdAt.toISOString()}-${index}`}>
                                  {reversal.reversalType} · {context.schoolCurrency} {reversal.amount} · {reversal.reason}
                                  {reversal.reference ? ` · Ref ${reversal.reference}` : ""}
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}
                        <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">Invoice due date: {invoice.dueDate}</p>
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState>No payment receipts are available yet.</EmptyState>}
            </section>

            <section id="profile" className={`space-y-4 ${activeSection !== "profile" ? "hidden" : ""}`}>
              <SectionHeading title="My profile" description="These details are read-only. Contact the school office to request a correction." />
              <div className="grid gap-4 lg:grid-cols-2">
                {linkedStudents.map((student) => (
                  <article key={student.id} id={`student-profile-${student.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-950">{student.firstName} {student.lastName}</h3>
                        <p className="mt-1 text-sm text-slate-500">{student.admissionNumber ?? "Admission number not recorded"}</p>
                      </div>
                      <PrintButton targetId={`student-profile-${student.id}`} label="Print profile" />
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoItem label="Date of birth" value={student.dateOfBirth} />
                      <InfoItem label="Gender" value={student.gender} />
                      <InfoItem label="Admission date" value={student.admissionDate} />
                      <InfoItem label="Status" value={student.status} />
                      <InfoItem label="Email" value={student.email} />
                      <InfoItem label="Phone" value={student.phone} />
                      <InfoItem label="Religion" value={student.religion} />
                      <InfoItem label="Blood group" value={student.bloodGroup} />
                      <InfoItem label="Current address" value={student.currentAddress} />
                      <InfoItem label="Permanent address" value={student.permanentAddress} />
                      <InfoItem label="Father" value={student.fatherName} />
                      <InfoItem label="Father's phone" value={student.fatherPhone} />
                      <InfoItem label="Mother" value={student.motherName} />
                      <InfoItem label="Mother's phone" value={student.motherPhone} />
                      <InfoItem label="Guardian" value={student.guardianName} />
                      <InfoItem label="Guardian relation" value={student.guardianRelation} />
                      <InfoItem label="Guardian email" value={student.guardianEmail} />
                      <InfoItem label="Guardian phone" value={student.guardianPhone} />
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section id="library" className={`space-y-4 ${activeSection !== "library" ? "hidden" : ""}`}>
              <SectionHeading title="Library" description="Check borrowed items and search the school’s available catalogue. The unfiltered list shows the first 50 titles." />
              <FilterForm name="library" value={query.library ?? ""} placeholder="Search books, authors, or loan status" />
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-950">My loans</h3>
                  {visibleLoans.length ? visibleLoans.map((loan, index) => {
                    const student = linkedStudents.find((entry) => entry.id === loan.studentId);
                    const overdue = loan.status === "active" && loan.dueDate < today;
                    return (
                      <article key={`${loan.title}-${loan.issuedAt}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="font-semibold text-slate-950">{loan.title}</h4>
                            <p className="text-sm text-slate-600">{loan.author}</p>
                          </div>
                          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                            {overdue ? "Overdue" : loan.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                          Issued {loan.issuedAt} · Due {loan.dueDate}{loan.returnedAt ? ` · Returned ${loan.returnedAt}` : ""}
                          {linkedStudents.length > 1 && student ? ` · ${student.firstName} ${student.lastName}` : ""}
                        </p>
                      </article>
                    );
                  }) : <EmptyState>No library loans match this search.</EmptyState>}
                </div>
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-950">Available catalogue</h3>
                  {visibleBooks.length ? visibleBooks.map((book, index) => (
                    <article key={`${book.title}-${book.author}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h4 className="font-semibold text-slate-950">{book.title}</h4>
                      <p className="mt-1 text-sm text-slate-600">{book.author}{book.category ? ` · ${book.category}` : ""}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {book.availableCopies > 0 ? `${book.availableCopies} available` : "Currently unavailable"}
                      </p>
                    </article>
                  )) : <EmptyState>No catalogue entries match this search.</EmptyState>}
                  {librarySearch && visibleBooks.length === 250 && (
                    <p className="text-xs text-slate-500">Showing the first 250 matches. Refine your search to narrow the results.</p>
                  )}
                </div>
              </div>
            </section>

            <section id="attendance" className={`space-y-4 ${activeSection !== "attendance" ? "hidden" : ""}`}>
              <SectionHeading title="Attendance" description="Recent attendance records entered by the school." />
              {attendance.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {attendance.map((record, index) => {
                    const student = linkedStudents.find((entry) => entry.id === record.studentId);
                    return (
                      <article key={`${record.studentId}-${record.attendanceDate}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="font-semibold text-slate-900">{record.attendanceDate}</p>
                        <p className="mt-1 text-sm capitalize text-slate-600">{record.status.replaceAll("_", " ")}</p>
                        {linkedStudents.length > 1 && student && <p className="mt-1 text-xs text-slate-500">{student.firstName} {student.lastName}</p>}
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState>No attendance records have been entered yet.</EmptyState>}
            </section>
          </>
        )}
      </main>
    </FamilyPortalShell>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GraduationCap;
  label: string;
  value: number;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span className="rounded-xl bg-violet-50 p-3 text-violet-700"><Icon size={20} aria-hidden="true" /></span>
      <span>
        <span className="block text-2xl font-bold text-slate-950">{value}</span>
        <span className="block text-sm text-slate-500">{label}</span>
      </span>
    </article>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </header>
  );
}

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{value || "Not recorded"}</dd>
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ReceiptTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterForm({
  name,
  value,
  placeholder,
  selectOptions,
}: {
  name: "results" | "fees" | "library" | "timetable";
  value: string;
  placeholder: string;
  selectOptions?: Array<{ value: string; label: string }>;
}) {
  return (
    <form method="get" action="/portal/student" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="section" value={name === "fees" ? "fees" : name} />
      {selectOptions ? (
        <select
          name={name}
          defaultValue={value}
          aria-label={name === "fees" ? "Filter invoices" : "Filter timetable"}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 sm:w-56"
        >
          {selectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input
          type="search"
          name={name}
          defaultValue={value}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={100}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 sm:max-w-sm"
        />
      )}
      <button type="submit" className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Apply filter
      </button>
    </form>
  );
}

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">{children}</p>;
}
