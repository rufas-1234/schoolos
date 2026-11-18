import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { BookOpenCheck, CreditCard, UsersRound } from "lucide-react";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examMarks,
  examSubjects,
  examinations,
  studentAttendance,
  studentEnrollments,
  studentFeeInvoices,
  students,
  subjects,
  userStudentLinks,
} from "@/db/schema";
import { requireSchoolMember } from "@/lib/access-control";
import { FamilyPortalShell } from "../family-portal-shell";

export const dynamic = "force-dynamic";

export default async function ParentPortalPage() {
  const context = await requireSchoolMember();
  const linkedStudentRecords = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "parent"),
    ));
  const linkedStudentIds = linkedStudentRecords.map(({ studentId }) => studentId);
  const children = await db.select({
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
  }).from(students)
    .where(and(
      eq(students.schoolId, context.schoolId),
      inArray(students.status, ["admitted", "active"]),
      linkedStudentIds.length
        ? or(eq(students.guardianEmail, context.user.email), inArray(students.id, linkedStudentIds))
        : eq(students.guardianEmail, context.user.email),
    ))
    .orderBy(students.lastName, students.firstName);
  const childIds = children.map((child) => child.id);
  const [enrollments, attendance, results, invoices] = childIds.length
    ? await Promise.all([
      db.select({
        studentId: studentEnrollments.studentId,
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
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
          inArray(studentEnrollments.studentId, childIds),
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
          inArray(studentAttendance.studentId, childIds),
        ))
        .orderBy(desc(studentAttendance.attendanceDate))
        .limit(60),
      db.select({
        studentId: studentEnrollments.studentId,
        examName: examinations.name,
        subjectName: subjects.name,
        marks: examMarks.marks,
        maxMarks: examSubjects.maxMarks,
        examDate: examSubjects.examDate,
      }).from(examMarks)
        .innerJoin(studentEnrollments, and(
          eq(studentEnrollments.id, examMarks.enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
        ))
        .innerJoin(examSubjects, and(
          eq(examSubjects.id, examMarks.examSubjectId),
          eq(examSubjects.schoolId, context.schoolId),
          eq(examSubjects.status, "published"),
        ))
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.schoolId, context.schoolId),
          eq(examinations.status, "published"),
        ))
        .innerJoin(classSubjects, and(
          eq(classSubjects.id, examSubjects.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examMarks.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, childIds),
          isNotNull(examMarks.marks),
        ))
        .orderBy(desc(examSubjects.examDate))
        .limit(80),
      db.select({
        studentId: studentFeeInvoices.studentId,
        invoiceNumber: studentFeeInvoices.invoiceNumber,
        amount: studentFeeInvoices.amount,
        discountAmount: studentFeeInvoices.discountAmount,
        dueDate: studentFeeInvoices.dueDate,
        status: studentFeeInvoices.status,
      }).from(studentFeeInvoices)
        .where(and(
          eq(studentFeeInvoices.schoolId, context.schoolId),
          inArray(studentFeeInvoices.studentId, childIds),
        ))
        .orderBy(desc(studentFeeInvoices.dueDate))
        .limit(80),
    ])
    : [[], [], [], []];
  const newestEnrollmentByChild = new Map<number, (typeof enrollments)[number]>();
  for (const enrollment of enrollments) {
    if (!newestEnrollmentByChild.has(enrollment.studentId)) {
      newestEnrollmentByChild.set(enrollment.studentId, enrollment);
    }
  }
  const unpaidInvoices = invoices.filter((invoice) =>
    invoice.status !== "paid" && invoice.status !== "cancelled",
  );

  return (
    <FamilyPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalType="parent"
    >
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
        <header className="rounded-3xl bg-gradient-to-br from-violet-800 to-indigo-900 p-6 text-white shadow-lg sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-200">Your family workspace</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Welcome, {context.user.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100">
            Follow your children’s school placement, published progress, attendance, and fee invoices.
          </p>
        </header>

        {children.length === 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <h2 className="font-semibold">Parent account not linked</h2>
            <p className="mt-1 leading-6">
              This account is not matched to an active student record. Ask the school administrator to add this
              account email to your child’s guardian email field.
            </p>
          </section>
        ) : (
          <>
            <section aria-label="Family summary" className="grid gap-4 sm:grid-cols-3">
              <SummaryCard icon={UsersRound} label="Linked children" value={children.length} />
              <SummaryCard icon={BookOpenCheck} label="Published subject results" value={results.length} />
              <SummaryCard icon={CreditCard} label="Outstanding invoices" value={unpaidInvoices.length} />
            </section>

            <section id="children" className="space-y-4">
              <SectionHeading title="My children" description="Current active-year placements for children linked to this account." />
              <div className="grid gap-4 lg:grid-cols-2">
                {children.map((child) => {
                  const enrollment = newestEnrollmentByChild.get(child.id);
                  return (
                    <article key={child.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {child.admissionNumber ? `Admission no. ${child.admissionNumber}` : "Student profile"}
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-slate-950">{child.firstName} {child.lastName}</h2>
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

            <section id="progress" className="space-y-4">
              <SectionHeading title="Academic progress" description="Only published results are included." />
              {results.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[42rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Student</th>
                          <th className="px-4 py-3 font-semibold">Examination</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Marks</th>
                          <th className="px-4 py-3 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {results.map((result, index) => {
                          const child = children.find((item) => item.id === result.studentId);
                          return (
                            <tr key={`${result.examName}-${result.subjectName}-${result.examDate}-${result.studentId}-${index}`}>
                              <td className="px-4 py-3 font-medium text-slate-900">{child?.firstName} {child?.lastName}</td>
                              <td className="px-4 py-3 text-slate-700">{result.examName}</td>
                              <td className="px-4 py-3 text-slate-700">{result.subjectName}</td>
                              <td className="px-4 py-3 font-semibold text-slate-800">{result.marks} / {result.maxMarks}</td>
                              <td className="px-4 py-3 text-slate-700">{result.examDate}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState>No published exam results are available yet.</EmptyState>
              )}
            </section>

            <section id="fees" className="space-y-4">
              <SectionHeading title="Fee invoices" description="Review invoices recorded for your linked children." />
              {invoices.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[38rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Student</th>
                          <th className="px-4 py-3 font-semibold">Invoice</th>
                          <th className="px-4 py-3 font-semibold">Invoice total</th>
                          <th className="px-4 py-3 font-semibold">Due date</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoices.map((invoice, index) => {
                          const child = children.find((item) => item.id === invoice.studentId);
                          const invoiceTotal = Math.max(0, Number(invoice.amount) - Number(invoice.discountAmount));
                          return (
                            <tr key={`${invoice.invoiceNumber}-${index}`}>
                              <td className="px-4 py-3 font-medium text-slate-900">{child?.firstName} {child?.lastName}</td>
                              <td className="px-4 py-3 text-slate-700">{invoice.invoiceNumber}</td>
                              <td className="px-4 py-3 text-slate-700">{invoiceTotal.toFixed(2)}</td>
                              <td className="px-4 py-3 text-slate-700">{invoice.dueDate}</td>
                              <td className="px-4 py-3 capitalize text-slate-700">{invoice.status.replaceAll("_", " ")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState>No fee invoices are available yet.</EmptyState>
              )}
              {unpaidInvoices.length > 0 && (
                <p className="text-xs text-slate-500">Amounts show invoice totals after discount; recorded payments may change the remaining balance.</p>
              )}
            </section>

            <section id="attendance" className="space-y-4">
              <SectionHeading title="Attendance" description="Recent attendance recorded for your children." />
              {attendance.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {attendance.map((record, index) => {
                    const child = children.find((item) => item.id === record.studentId);
                    return (
                      <article key={`${record.studentId}-${record.attendanceDate}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="font-semibold text-slate-900">{child?.firstName} {child?.lastName}</p>
                        <p className="mt-1 text-sm text-slate-600">{record.attendanceDate} · {record.status.replaceAll("_", " ")}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState>No attendance records have been entered yet.</EmptyState>
              )}
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
  icon: typeof UsersRound;
  label: string;
  value: number;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="rounded-xl bg-violet-50 p-3 text-violet-700">
        <Icon size={20} aria-hidden="true" />
      </span>
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

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      {children}
    </p>
  );
}
