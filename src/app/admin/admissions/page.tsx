import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { AdminDataTable, type AdminTableFilter } from "@/components/admin-data-table";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { StudentStatusForm } from "@/app/admin/students/student-status-form";

function uniqueOptions(options: Array<{ value: string; label: string }>) {
  return [...new Map(options.map((option) => [option.value, option])).values()];
}

export default async function AdmissionDeskPage() {
  const context = await requireSchoolPermission("students.update");
  const records = await db.select({
    id: students.id,
    publicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    phone: students.phone,
    email: students.email,
    guardianName: students.guardianName,
    guardianPhone: students.guardianPhone,
    submittedAt: students.createdAt,
    branchId: schoolBranches.id,
    branchName: schoolBranches.name,
    classLevelId: classLevels.id,
    className: classLevels.name,
    sectionId: classSections.id,
    sectionName: classSections.name,
    yearName: academicYears.name,
  }).from(students)
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.studentId, students.id),
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.status, "pending"),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.academicYearId, studentEnrollments.academicYearId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(academicYears, and(
      eq(academicYears.id, studentEnrollments.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .leftJoin(schoolBranches, and(
      eq(schoolBranches.id, students.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .where(and(eq(students.schoolId, context.schoolId), eq(students.status, "pending")))
    .orderBy(asc(students.createdAt), asc(students.lastName), asc(students.firstName));
  const filters: AdminTableFilter[] = [{
    key: "branchFilter",
    label: "branch",
    options: uniqueOptions(records.map((record) => ({
      value: String(record.branchId ?? "__unassigned__"),
      label: record.branchName ?? "Unassigned",
    }))),
  }, {
    key: "classFilter",
    label: "class",
    options: uniqueOptions(records.map((record) => ({
      value: String(record.classLevelId),
      label: record.className,
    }))),
  }];
  const publicFormPath = `/admission/${context.schoolPublicId}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-rose-900">Student Info</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Admission Desk</h1>
        <p className="mt-2 text-sm text-slate-600">Share the online registration link, review submitted students, then approve or reject each admission.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold text-rose-950">Online registration form</h2>
          <p className="mt-1 break-all font-mono text-xs text-rose-900">{publicFormPath}</p>
        </div>
        <Link href={publicFormPath} target="_blank" rel="noreferrer" className="inline-flex shrink-0 justify-center rounded-lg bg-rose-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-950">
          Preview form
        </Link>
      </section>

      <AdminDataTable
        title="Pending admissions"
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission number" },
          { key: "branch", label: "Branch" },
          { key: "classSection", label: "Class (section)" },
          { key: "contact", label: "Contact" },
          { key: "submitted", label: "Submitted" },
        ]}
        rows={records.map((record) => {
          const studentName = `${record.firstName} ${record.lastName}`;
          return {
            id: record.id,
            values: {
              student: studentName,
              admissionNumber: record.admissionNumber ?? "",
              branch: record.branchName ?? "Unassigned",
              branchFilter: String(record.branchId ?? "__unassigned__"),
              classSection: `${record.className} (${record.sectionName})`,
              classFilter: String(record.classLevelId),
              contact: record.phone || record.guardianPhone || record.email || "",
              submitted: record.submittedAt.toISOString().slice(0, 10),
            },
            searchableText: [
              studentName,
              record.admissionNumber ?? "",
              record.phone ?? "",
              record.email ?? "",
              record.guardianName ?? "",
              record.guardianPhone ?? "",
              record.branchName ?? "",
              record.className,
              record.sectionName,
              record.yearName,
            ].join(" "),
            actions: (
              <div className="flex flex-wrap gap-2">
                <StudentStatusForm
                  publicId={record.publicId}
                  studentName={studentName}
                  currentStatus="pending"
                  nextStatus="admitted"
                />
                <StudentStatusForm
                  publicId={record.publicId}
                  studentName={studentName}
                  currentStatus="pending"
                  nextStatus="rejected"
                />
              </div>
            ),
          };
        })}
        filters={filters}
        requireSearchCriteria
        emptyMessage="There are no pending admissions to review."
      />
    </div>
  );
}
