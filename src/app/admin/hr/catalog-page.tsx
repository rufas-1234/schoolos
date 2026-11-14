import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { staffDepartments, staffDesignations, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { CatalogEntryForm, CreateCatalogEntryForm } from "./catalog-forms";
import type { HrCatalogKind } from "./catalog-actions";

export async function StaffCatalogPage({ kind }: { kind: HrCatalogKind }) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [entries, staff] = await Promise.all([
    kind === "department"
      ? db.select({ id: staffDepartments.id, name: staffDepartments.name })
        .from(staffDepartments)
        .where(eq(staffDepartments.schoolId, context.schoolId))
        .orderBy(asc(staffDepartments.name))
      : db.select({ id: staffDesignations.id, name: staffDesignations.name })
        .from(staffDesignations)
        .where(eq(staffDesignations.schoolId, context.schoolId))
        .orderBy(asc(staffDesignations.name)),
    db.select({
      department: staffMembers.department,
      jobTitle: staffMembers.jobTitle,
    }).from(staffMembers).where(eq(staffMembers.schoolId, context.schoolId)),
  ]);
  const label = kind === "department" ? "Departments" : "Designations";
  const staffCountByName = new Map<string, number>();
  for (const member of staff) {
    const name = kind === "department" ? member.department : member.jobTitle;
    staffCountByName.set(name, (staffCountByName.get(name) ?? 0) + 1);
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">Human resources</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{label}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Manage the {kind} names used in your staff directory. Renaming an entry updates matching staff records.
          </p>
        </div>
        <Link href="/admin/hr" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
          Back to HR overview
        </Link>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.5fr)]">
        <CreateCatalogEntryForm kind={kind} />
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
                <li key={entry.id}>
                  <CatalogEntryForm
                    id={entry.id}
                    kind={kind}
                    name={entry.name}
                    staffCount={staffCountByName.get(entry.name) ?? 0}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
