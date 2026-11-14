import { and, asc, eq } from "drizzle-orm";
import { AdminDataTable, type AdminTableFilter } from "@/components/admin-data-table";
import { db } from "@/db";
import { schoolBranches, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { transitionStudentStatus } from "../actions";

export default async function DisabledStudentsPage() {
  const context = await requireSchoolPermission("students.view");
  const [branches, records] = await Promise.all([
    db
      .select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(eq(schoolBranches.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name)),
    db
      .select({
        id: students.id,
        publicId: students.publicId,
        firstName: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
        phone: students.phone,
        branchId: schoolBranches.id,
        branchName: schoolBranches.name,
      })
      .from(students)
      .leftJoin(
        schoolBranches,
        and(eq(students.branchId, schoolBranches.id), eq(schoolBranches.schoolId, context.schoolId)),
      )
      .where(and(eq(students.schoolId, context.schoolId), eq(students.status, "disabled")))
      .orderBy(asc(students.lastName), asc(students.firstName)),
  ]);
  const canUpdate = context.grantedPermissions.includes("students.update");
  const filters: AdminTableFilter[] = [{
    key: "branchFilter",
    label: "branch",
    options: branches.map((branch) => ({
      value: String(branch.id),
      label: branch.name,
    })),
  }];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Student Info</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Disabled students
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Review disabled student records and restore eligible students to active status.
        </p>
      </header>

      <AdminDataTable
        title="Disabled students"
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission number" },
          { key: "branch", label: "Branch" },
          { key: "phone", label: "Contact" },
        ]}
        rows={records.map((record) => ({
          id: record.id,
          values: {
            student: `${record.firstName} ${record.lastName}`,
            admissionNumber: record.admissionNumber ?? "",
            branch: record.branchName ?? "Not assigned",
            branchFilter: record.branchId === null ? "" : String(record.branchId),
            phone: record.phone ?? "",
          },
          actions: canUpdate ? (
            <form action={transitionStudentStatus}>
              <input type="hidden" name="publicId" value={record.publicId} />
              <input type="hidden" name="nextStatus" value="active" />
              <button
                type="submit"
                className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-800"
              >
                Restore
              </button>
            </form>
          ) : null,
        }))}
        filters={filters}
        requireSearchCriteria
        emptyMessage="There are no disabled student records."
      />
    </div>
  );
}
