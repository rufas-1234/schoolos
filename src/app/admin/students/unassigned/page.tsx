import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  AdminActionDialog,
  AdminDataTable,
  type AdminTableFilter,
} from "@/components/admin-data-table";
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
import { StudentPlacementForm } from "../../academics/management-forms";

export default async function UnassignedStudentsPage() {
  const context = await requireSchoolPermission("students.view");
  const [branches, activeYears] = await Promise.all([
    db
      .select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(eq(schoolBranches.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name)),
    db
      .select({ id: academicYears.id, name: academicYears.name })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active")))
      .orderBy(asc(academicYears.startDate)),
  ]);
  const activeYear = activeYears[0];
  const [sections, unassignedStudents] = activeYear
    ? await Promise.all([
        db
          .select({
            id: classSections.id,
            branchId: schoolBranches.id,
            className: classLevels.name,
            sectionName: classSections.name,
            branchName: schoolBranches.name,
          })
          .from(classSections)
          .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
          .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
          .where(
            and(
              eq(classSections.schoolId, context.schoolId),
              eq(classSections.academicYearId, activeYear.id),
              eq(classLevels.schoolId, context.schoolId),
            ),
          )
          .orderBy(asc(schoolBranches.name), asc(classLevels.name), asc(classSections.name)),
        db
          .select({
            id: students.id,
            firstName: students.firstName,
            lastName: students.lastName,
            admissionNumber: students.admissionNumber,
            branchId: schoolBranches.id,
            branchName: schoolBranches.name,
            branchCode: schoolBranches.code,
            phone: students.phone,
          })
          .from(students)
          .leftJoin(
            schoolBranches,
            and(
              eq(students.branchId, schoolBranches.id),
              eq(schoolBranches.schoolId, context.schoolId),
            ),
          )
          .leftJoin(
            studentEnrollments,
            and(
              eq(studentEnrollments.studentId, students.id),
              eq(studentEnrollments.schoolId, context.schoolId),
              eq(studentEnrollments.academicYearId, activeYear.id),
              inArray(studentEnrollments.status, ["pending", "enrolled"]),
            ),
          )
          .where(
            and(
              eq(students.schoolId, context.schoolId),
              inArray(students.status, ["admitted", "active"]),
              isNull(studentEnrollments.id),
            ),
          )
          .orderBy(asc(students.lastName), asc(students.firstName)),
      ])
    : [[], []];

  const canUpdate = context.grantedPermissions.includes("students.update");
  const sectionOptions = sections.map((section) => ({
    id: section.id,
    branchId: section.branchId,
    label: `${section.className} ${section.sectionName}`,
  }));
  const branchOptions = branches.map((branch) => ({
    id: branch.id,
    label: branch.name,
  }));
  const studentOptions = unassignedStudents.map((student) => ({
    id: student.id,
    label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
  }));
  const branchFilters: AdminTableFilter[] = [{
    key: "branchFilter",
    label: "branch",
    options: [
      ...branches.map((branch) => ({
        value: String(branch.id),
        label: branch.name,
      })),
      ...(unassignedStudents.some((student) => student.branchId === null)
        ? [{ value: "none", label: "No branch assigned" }]
        : []),
    ],
  }];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Student Info</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Unassigned students
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {activeYear
            ? `Students without a class enrollment for ${activeYear.name}.`
            : "Set an academic year to active before assigning students to classes."}
        </p>
      </header>

      <AdminDataTable
        title="Unassigned students"
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission number" },
          { key: "branch", label: "Branch" },
          { key: "phone", label: "Contact" },
        ]}
        rows={unassignedStudents.map((student) => ({
          id: student.id,
          values: {
            student: `${student.firstName} ${student.lastName}`,
            admissionNumber: student.admissionNumber ?? "",
            branch: student.branchName ?? "Not assigned",
            branchFilter: student.branchId === null ? "none" : String(student.branchId),
            phone: student.phone ?? "",
          },
        }))}
        filters={branchFilters}
        requireSearchCriteria
        toolbarActions={canUpdate && studentOptions.length > 0 && sectionOptions.length > 0 ? (
          <AdminActionDialog label="Place student" title="Place an unassigned student">
            <StudentPlacementForm
              branches={branchOptions}
              students={studentOptions}
              sections={sectionOptions}
            />
          </AdminActionDialog>
        ) : null}
        emptyMessage={activeYear
          ? "No admitted or active students are unassigned for this academic year."
          : "No active academic year is available."}
      />
      {canUpdate && studentOptions.length > 0 && sectionOptions.length === 0 && activeYear && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Add class sections to {activeYear.name} before placing unassigned students.
        </p>
      )}
    </div>
  );
}
