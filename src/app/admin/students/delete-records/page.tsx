import { and, asc, eq } from "drizzle-orm";
import {
  AdminDataTable,
  AdminDeleteButton,
  type AdminTableFilter,
} from "@/components/admin-data-table";
import { db } from "@/db";
import { schoolBranches, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { deleteStudentRecord } from "./actions";

const studentStatusLabels: Record<string, string> = {
  pending: "Pending review",
  admitted: "Admitted",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
  disabled: "Disabled",
};

export default async function DeleteStudentRecordsPage() {
  const context = await requireSchoolPermission("students.delete");
  const records = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      phone: students.phone,
      status: students.status,
      branchId: schoolBranches.id,
      branchName: schoolBranches.name,
    })
    .from(students)
    .leftJoin(
      schoolBranches,
      and(
        eq(students.branchId, schoolBranches.id),
        eq(schoolBranches.schoolId, context.schoolId),
      ),
    )
    .where(eq(students.schoolId, context.schoolId))
    .orderBy(asc(students.lastName), asc(students.firstName));

  const branchOptions = new Map<number, string>();
  for (const record of records) {
    if (record.branchId !== null && record.branchName) {
      branchOptions.set(record.branchId, record.branchName);
    }
  }
  const filters: AdminTableFilter[] = [
    {
      key: "branchFilter",
      label: "branch",
      options: [
        ...[...branchOptions].map(([id, name]) => ({ value: String(id), label: name })),
        ...(records.some((record) => record.branchId === null)
          ? [{ value: "__unassigned__", label: "Unassigned" }]
          : []),
      ],
    },
    {
      key: "statusFilter",
      label: "status",
      options: [...new Set(records.map((record) => record.status))].map((status) => ({
        value: status,
        label: studentStatusLabels[status] ?? status,
      })),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Student Info</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Delete student records
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Permanently delete the student and their enrollments, attendance, history, and groups. This cannot be undone.
        </p>
      </header>

      <AdminDataTable
        title="Student records"
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission number" },
          { key: "branch", label: "Branch" },
          { key: "status", label: "Status" },
        ]}
        rows={records.map((record) => ({
          id: record.id,
          values: {
            student: `${record.firstName} ${record.lastName}`,
            admissionNumber: record.admissionNumber ?? "",
            branch: record.branchName ?? "Unassigned",
            branchFilter: record.branchId === null ? "__unassigned__" : String(record.branchId),
            status: studentStatusLabels[record.status] ?? record.status,
            statusFilter: record.status,
          },
          actions: (
            <form action={deleteStudentRecord}>
              <input type="hidden" name="publicId" value={record.publicId} />
              <AdminDeleteButton
                label={`Permanently delete ${record.firstName} ${record.lastName} and their student history`}
              />
            </form>
          ),
        }))}
        filters={filters}
        requireSearchCriteria
        emptyMessage="There are no student records to delete."
      />
    </div>
  );
}
