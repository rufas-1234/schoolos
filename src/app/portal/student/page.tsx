import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
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
  feePayments,
  feeStructures,
  feeTypes,
  libraryBooks,
  libraryLoans,
  studentAttendance,
  studentEnrollments,
  studentFeeInvoices,
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
  formatFeeReportDate,
  parseMoneyToMinorUnits,
} from "@/lib/fees-policy";
import { FamilyPortalShell } from "../family-portal-shell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  results?: string;
  fees?: string;
  library?: string;
}>;

export default async function StudentPortalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [context, query] = await Promise.all([requireSchoolMember(), searchParams]);
  const linkedStudentRecords = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "student"),
    ));
  const linkedStudentIds = linkedStudentRecords.map(({ studentId }) => studentId);
  const libraryFilter = query.library?.trim().slice(0, 100) ?? "";
  const linkedStudents = linkedStudentIds.length || context.user.email
    ? await db.select({
    id: students.id,
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
        typeName: feeTypes.name,
      }).from(studentFeeInvoices)
        .innerJoin(feeStructures, and(
          eq(feeStructures.id, studentFeeInvoices.feeStructureId),
          eq(feeStructures.schoolId, context.schoolId),
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
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:rounded-3xl sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Your learning workspace</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-4xl">Welcome, {context.user.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            View published results, your timetable, fee records, personal profile, and library activity.
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
            <section aria-label="Student summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={GraduationCap} label="Student profiles" value={linkedStudents.length} />
              <SummaryCard icon={CalendarDays} label="Weekly lessons" value={timetable.length} />
              <SummaryCard icon={ClipboardCheck} label="Published reports" value={reports.length} />
              <SummaryCard icon={CalendarDays} label="Attendance records" value={attendance.length} />
            </section>

            <section id="learning" className="space-y-4">
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

            <section id="timetable" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading title="Class timetable" description="Weekly lesson times for your current class section." />
                {timetable.length > 0 && <PrintButton targetId="student-timetable-print" label="Print timetable" pageOrientation="landscape" />}
              </div>
              {timetable.length ? (
                <div id="student-timetable-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="grid gap-3 p-3 sm:hidden print:hidden">
                    {timetable.map((lesson, index) => {
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
                        {timetable.map((lesson, index) => {
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

            <section id="results" className="space-y-4">
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
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        <header className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Published academic report</p>
                            <h3 className="mt-1 text-lg font-bold text-slate-950">{report.examName}</h3>
                            <p className="mt-1 text-sm text-slate-600">
                              {[student && `${student.firstName} ${student.lastName}`, report.admissionNumber, report.className, report.sectionName, report.termName, report.yearName].filter(Boolean).join(" · ")}
                            </p>
                            {report.rollNumber && <p className="mt-1 text-xs text-slate-500">Roll no. {report.rollNumber}</p>}
                          </div>
                          <PrintButton targetId={`student-report-${report.examId}-${report.enrollmentId}`} label="Print report" />
                        </header>
                        <div className="grid grid-cols-3 gap-2 p-4 sm:px-5">
                          <ReportMetric label="Total" value={`${report.score.totalMarks.toFixed(2)} / ${report.score.maxMarks.toFixed(2)}`} />
                          <ReportMetric label="Percentage" value={`${report.score.percentage.toFixed(2)}%`} />
                          <ReportMetric label="Grade" value={report.grade?.grade ?? "—"} />
                        </div>
                        {report.grade && (
                          <p className="px-4 pb-3 text-xs text-slate-600 sm:px-5">
                            {[report.grade.description, report.grade.performanceRemark].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <div className="hidden overflow-x-auto px-4 pb-4 sm:block sm:px-5 print:block">
                          <table className="w-full min-w-[42rem] text-left text-sm">
                            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Subject</th>
                                <th className="px-3 py-2">Marks</th>
                                <th className="px-3 py-2">Percent</th>
                                <th className="px-3 py-2">Grade</th>
                                <th className="px-3 py-2">Teacher remark</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {report.rows.map((row, index) => (
                                <tr key={`${row.subjectName}-${row.examDate}-${index}`}>
                                  <td className="px-3 py-2 font-medium text-slate-800">
                                    {row.subjectName} {row.subjectCode && <span className="text-xs text-slate-500">{row.subjectCode}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">{row.marks} / {row.maxMarks}</td>
                                  <td className="px-3 py-2 text-slate-700">{row.percentage.toFixed(2)}%</td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {row.grade?.grade ?? "—"}{row.grade && <span className="ml-1 text-xs text-slate-500">{row.grade.description}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">{row.teacherRemark || row.grade?.performanceRemark || "—"}</td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                                <td className="px-3 py-2">Overall</td>
                                <td className="px-3 py-2">{report.score.totalMarks.toFixed(2)} / {report.score.maxMarks.toFixed(2)}</td>
                                <td className="px-3 py-2">{report.score.percentage.toFixed(2)}%</td>
                                <td className="px-3 py-2">{report.grade?.grade ?? "—"}</td>
                                <td className="px-3 py-2">{report.grade?.performanceRemark ?? ""}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="grid gap-2 px-4 pb-4 sm:hidden print:hidden">
                          {report.rows.map((row, index) => (
                            <div key={`${row.subjectName}-${row.examDate}-mobile-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                              <div className="min-w-0">
                                <p className="break-words font-medium text-slate-900">
                                  {row.subjectName} {row.subjectCode && <span className="text-xs text-slate-500">{row.subjectCode}</span>}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {row.percentage.toFixed(2)}% · Grade {row.grade?.grade ?? "—"}
                                </p>
                                <p className="mt-1 break-words text-xs text-slate-600">
                                  {row.teacherRemark || row.grade?.performanceRemark || "—"}
                                </p>
                              </div>
                              <p className="shrink-0 font-semibold text-slate-800">{row.marks} / {row.maxMarks}</p>
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-3 border-t border-slate-200 p-4 text-sm sm:grid-cols-2 sm:px-5">
                          <div>
                            <h4 className="font-semibold text-slate-800">Class teacher&apos;s remarks</h4>
                            <p className="mt-1 text-slate-600">{report.classTeacherRemark || report.grade?.performanceRemark || "—"}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-800">Headteacher&apos;s remarks</h4>
                            <p className="mt-1 text-slate-600">{report.principalRemark || "—"}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState>No complete published reports match this search.</EmptyState>}
            </section>

            <section id="fees" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading title="Fees, invoices and receipts" description="Balances include recorded payments, reversals, discounts, and applicable overdue fines." />
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleInvoices.map((invoice) => (
                    <article
                      key={invoice.id}
                      id={`student-invoice-${invoice.id}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{invoice.invoiceNumber}</p>
                          <h3 className="mt-1 font-bold text-slate-950">{invoice.typeName}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {linkedStudents.find((student) => student.id === invoice.studentId)?.firstName}{" "}
                            {linkedStudents.find((student) => student.id === invoice.studentId)?.lastName}
                          </p>
                        </div>
                        <PrintButton targetId={`student-invoice-${invoice.id}`} label="Print invoice" />
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <InfoItem label="Due date" value={invoice.dueDate} />
                        <InfoItem label="Invoice amount" value={formatMoney(invoice.amountMinor)} />
                        <InfoItem label="Discount" value={formatMoney(invoice.discountMinor)} />
                        <InfoItem label="Late fine" value={formatMoney(invoice.fineMinor)} />
                        <InfoItem label="Paid" value={formatMoney(invoice.paidMinor)} />
                        <InfoItem label="Balance" value={formatMoney(invoice.balanceMinor)} />
                      </dl>
                    </article>
                  ))}
                </div>
              ) : <EmptyState>No invoices match the selected filter.</EmptyState>}
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-slate-950">Payment receipts</h3>
                {paymentRows.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {paymentRows.map((payment) => {
                      const amount = parseMoneyToMinorUnits(payment.amount);
                      const reversed = parseMoneyToMinorUnits(payment.reversedAmount);
                      const fine = parseMoneyToMinorUnits(payment.fineAmount);
                      if (amount === null || reversed === null || fine === null || reversed > amount) {
                        throw new Error("Stored fee receipt amount is invalid.");
                      }
                      return (
                        <article key={payment.id} id={`student-receipt-${payment.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt {payment.receiptNumber}</p>
                              <p className="mt-1 font-bold text-slate-950">{formatMoney(amount)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Invoice {payment.invoiceNumber} · {
                                  linkedStudents.find((student) => student.id === payment.studentId)?.firstName
                                } {
                                  linkedStudents.find((student) => student.id === payment.studentId)?.lastName
                                }
                              </p>
                            </div>
                            <PrintButton targetId={`student-receipt-${payment.id}`} label="Print receipt" />
                          </div>
                          <p className="mt-2 text-sm capitalize text-slate-600">{paymentMethodLabel(payment.paymentMethod)} · {formatFeeReportDate(payment.paidAt, context.schoolTimezone)}</p>
                          {payment.reference && <p className="mt-1 break-words text-xs text-slate-500">Reference: {payment.reference}</p>}
                          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                            <InfoItem label="Net retained" value={formatMoney(amount - reversed)} />
                            <InfoItem label="Late fine included" value={formatMoney(fine)} />
                            {reversed > 0 && <InfoItem label="Reversed / refunded" value={formatMoney(reversed)} />}
                          </dl>
                        </article>
                      );
                    })}
                  </div>
                ) : <EmptyState>No payment receipts are available yet.</EmptyState>}
              </div>
            </section>

            <section id="profile" className="space-y-4">
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

            <section id="library" className="space-y-4">
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

            <section id="attendance" className="space-y-4">
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

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function FilterForm({
  name,
  value,
  placeholder,
  selectOptions,
}: {
  name: "results" | "fees" | "library";
  value: string;
  placeholder: string;
  selectOptions?: Array<{ value: string; label: string }>;
}) {
  return (
    <form method="get" action="/portal/student" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {selectOptions ? (
        <select
          name={name}
          defaultValue={value}
          aria-label="Filter invoices"
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
