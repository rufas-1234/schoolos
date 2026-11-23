import { and, asc, desc, eq } from "drizzle-orm";
import { Award, Printer } from "lucide-react";
import Link from "next/link";
import { AdminDataTable, type AdminTableColumn, type AdminTableFilter, type AdminTableRow } from "@/components/admin-data-table";
import { db } from "@/db";
import { academicYears, studentCertificates, studentEnrollments, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";
import { CertificateIssueForm } from "./certificate-issue-form";

const suggestedCategories = [
  "Academic Excellence",
  "Leadership",
  "Participation",
  "Prefect",
  "Service",
  "Sports",
];

const columns: AdminTableColumn[] = [
  { key: "certificateNumber", label: "Certificate number" },
  { key: "student", label: "Student" },
  { key: "category", label: "Category" },
  { key: "title", label: "Certificate title" },
  { key: "issuedAt", label: "Issue date" },
  { key: "academicYear", label: "Academic year" },
];

export default async function CertificatesPage() {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const { years, selectedYear } = await getSchoolAcademicYearSelection(context.schoolId);
  const [enrolledStudents, certificates] = selectedYear
    ? await Promise.all([
      db
        .selectDistinct({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          admissionNumber: students.admissionNumber,
        })
        .from(studentEnrollments)
        .innerJoin(students, and(
          eq(students.id, studentEnrollments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, selectedYear.id),
          eq(studentEnrollments.status, "enrolled"),
        ))
        .orderBy(asc(students.lastName), asc(students.firstName)),
      db
        .select({
          id: studentCertificates.id,
          publicId: studentCertificates.publicId,
          certificateNumber: studentCertificates.certificateNumber,
          category: studentCertificates.category,
          title: studentCertificates.title,
          issuedAt: studentCertificates.issuedAt,
          firstName: students.firstName,
          lastName: students.lastName,
          admissionNumber: students.admissionNumber,
          academicYear: academicYears.name,
        })
        .from(studentCertificates)
        .innerJoin(students, and(
          eq(students.id, studentCertificates.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, studentCertificates.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentCertificates.schoolId, context.schoolId),
          eq(studentCertificates.academicYearId, selectedYear.id),
        ))
        .orderBy(desc(studentCertificates.issuedAt), desc(studentCertificates.id)),
    ])
    : [[], []];

  const categories = [...new Set([
    ...suggestedCategories,
    ...certificates.map((certificate) => certificate.category),
  ])].sort((first, second) => first.localeCompare(second));
  const filters: AdminTableFilter[] = [{
    key: "category",
    label: "Category",
    options: categories.map((category) => ({ value: category, label: category })),
  }];
  const rows: AdminTableRow[] = certificates.map((certificate) => {
    const studentName = `${certificate.firstName} ${certificate.lastName}`;
    return {
      id: certificate.id,
      values: {
        certificateNumber: certificate.certificateNumber,
        student: certificate.admissionNumber
          ? `${studentName} · ${certificate.admissionNumber}`
          : studentName,
        category: certificate.category,
        title: certificate.title,
        issuedAt: certificate.issuedAt,
        academicYear: certificate.academicYear,
      },
      searchableText: [
        certificate.certificateNumber,
        studentName,
        certificate.admissionNumber,
        certificate.category,
        certificate.title,
        certificate.academicYear,
      ].filter(Boolean).join(" "),
      actions: (
        <Link
          href={`/admin/academics/certificates/${certificate.publicId}/print?academicYearId=${selectedYear?.id}`}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-sm font-semibold text-violet-800 transition hover:bg-violet-50"
        >
          <Printer size={15} aria-hidden="true" />
          Print
        </Link>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-50 p-2.5 text-violet-700">
            <Award size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-orange-700">Academic records</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Certificates</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Issue certificates for academic, leadership, sports, service, and other school achievements.
              The register follows the selected academic year.
            </p>
          </div>
        </div>
      </header>

      {selectedYear ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
          <CertificateIssueForm
            academicYearId={selectedYear.id}
            academicYearName={selectedYear.name}
            issueDate={new Intl.DateTimeFormat("en-CA", { timeZone: context.schoolTimezone }).format(new Date())}
            students={enrolledStudents.map((student) => ({
              id: student.id,
              label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
            }))}
            categories={categories}
          />
          <AdminDataTable
            title={`Certificates · ${selectedYear.name}`}
            mobileCardView
            columns={columns}
            filters={filters}
            rows={rows}
            emptyMessage={`No certificates have been issued for ${selectedYear.name}.`}
          />
        </div>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {years.length
            ? "Select an academic year from the header to issue or review certificates."
            : "Create an academic year before issuing student certificates."}
        </section>
      )}
    </div>
  );
}
