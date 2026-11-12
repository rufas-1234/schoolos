import { and, asc, eq } from "drizzle-orm";
import { AdminActionDialog, AdminDataTable, AdminDeleteButton, AdminRecordDialog } from "@/components/admin-data-table";
import type { AdminTableFilter } from "@/components/admin-data-table";
import { db } from "@/db";
import { schoolBranches, studentCategories } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { deleteStudentCategory } from "../category-actions";
import { StudentCategoryForm } from "../student-category-form";

export default async function StudentCategoriesPage() {
  const context = await requireSchoolPermission("students.view");
  const [branches, categories] = await Promise.all([
    db
      .select({
        id: schoolBranches.id,
        name: schoolBranches.name,
        code: schoolBranches.code,
      })
      .from(schoolBranches)
      .where(
        and(
          eq(schoolBranches.schoolId, context.schoolId),
          eq(schoolBranches.status, "active"),
        ),
      )
      .orderBy(asc(schoolBranches.name)),
    db
      .select({
        id: studentCategories.id,
        publicId: studentCategories.publicId,
        branchId: studentCategories.branchId,
        branchName: schoolBranches.name,
        branchCode: schoolBranches.code,
        name: studentCategories.name,
      })
      .from(studentCategories)
      .innerJoin(schoolBranches, eq(studentCategories.branchId, schoolBranches.id))
      .where(eq(studentCategories.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(studentCategories.name)),
  ]);
  const branchOptions = branches.map((branch) => ({
    id: branch.id,
    label: `${branch.name} · ${branch.code}`,
  }));
  const filters: AdminTableFilter[] = [{
    key: "branchFilter",
    label: "branch",
    options: branchOptions.map((branch) => ({
      value: String(branch.id),
      label: branch.label,
    })),
  }];
  const canCreate = context.grantedPermissions.includes("students.create");
  const canUpdate = context.grantedPermissions.includes("students.update");
  const canDelete = context.grantedPermissions.includes("students.delete");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Student Info</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Student categories
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Define branch-specific student and support categories for admission records.
          </p>
        </div>
      </header>

      <AdminDataTable
        title="Student categories"
        columns={[
          { key: "branch", label: "Branch" },
          { key: "name", label: "Category" },
        ]}
        rows={categories.map((category) => ({
          id: category.id,
          values: {
            branch: `${category.branchName} · ${category.branchCode}`,
            name: category.name,
            branchFilter: String(category.branchId),
          },
          actions: (
            <div className="flex items-center gap-2">
              {canUpdate && (
                <AdminRecordDialog title={`Edit ${category.name}`}>
                  <StudentCategoryForm
                    branches={branchOptions}
                    record={{
                      publicId: category.publicId,
                      branchId: category.branchId,
                      name: category.name,
                    }}
                  />
                </AdminRecordDialog>
              )}
              {canDelete && (
                <form action={deleteStudentCategory}>
                  <input type="hidden" name="publicId" value={category.publicId} />
                  <AdminDeleteButton label={`Delete ${category.name}`} />
                </form>
              )}
            </div>
          ),
        }))}
        filters={filters}
        requireSearchCriteria
        toolbarActions={canCreate ? (
          <AdminActionDialog label="Add category" title="Add student category">
            <StudentCategoryForm branches={branchOptions} />
          </AdminActionDialog>
        ) : null}
        emptyMessage="No student categories have been created yet."
      />
    </div>
  );
}
