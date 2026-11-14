import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, staffDepartments, staffDesignations, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { CatalogEntryForm, CreateCatalogEntryForm } from "./catalog-forms";
import type { HrCatalogKind } from "./catalog-actions";

export async function StaffCatalogPage({ kind }: { kind: HrCatalogKind }) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [entries, staff, branches] = await Promise.all([
    kind === "department"
      ? db.select({
        id: staffDepartments.id,
        name: staffDepartments.name,
        branchId: staffDepartments.branchId,
        branchName: schoolBranches.name,
        branchCode: schoolBranches.code,
      })
        .from(staffDepartments)
        .leftJoin(schoolBranches, eq(staffDepartments.branchId, schoolBranches.id))
        .where(eq(staffDepartments.schoolId, context.schoolId))
        .orderBy(asc(schoolBranches.name), asc(staffDepartments.name))
      : db.select({
        id: staffDesignations.id,
        name: staffDesignations.name,
        branchId: staffDesignations.branchId,
        branchName: schoolBranches.name,
        branchCode: schoolBranches.code,
      })
        .from(staffDesignations)
        .leftJoin(schoolBranches, eq(staffDesignations.branchId, schoolBranches.id))
        .where(eq(staffDesignations.schoolId, context.schoolId))
        .orderBy(asc(schoolBranches.name), asc(staffDesignations.name)),
    db.select({
      department: staffMembers.department,
      jobTitle: staffMembers.jobTitle,
      branchId: staffMembers.branchId,
    }).from(staffMembers).where(eq(staffMembers.schoolId, context.schoolId)),
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
  ]);
  const label = kind === "department" ? "Departments" : "Designations";

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">Human resources</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{label}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Create branch-specific {kind} entries. Renaming an entry updates matching staff in its branch.
          </p>
        </div>
        <Link href="/admin/hr" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
          Back to HR overview
        </Link>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.5fr)]">
        <CreateCatalogEntryForm kind={kind} branches={branches} />
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">{label} directory</h2>
            <p className="mt-1 text-sm text-slate-500">{entries.length} entries</p>
          </div>
          {entries.length === 0 ? (
            <p className="p-7 text-center text-sm text-slate-500">No {kind} entries yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <CatalogEntryForm
                  key={entry.id}
                  id={entry.id}
                  kind={kind}
                  name={entry.name}
                  branchName={entry.branchName}
                  branchCode={entry.branchCode}
                  staffCount={staff.filter((member) => {
                    const memberName = kind === "department" ? member.department : member.jobTitle;
                    return memberName === entry.name &&
                      (entry.branchId === null || member.branchId === entry.branchId);
                  }).length}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
