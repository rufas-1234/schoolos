import { asc, eq } from "drizzle-orm";
import { AdminActionDialog, AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { studentBehaviorOptions } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { defaultBehaviorActions, defaultBehaviorCategories } from "@/lib/behavior-policy";
import { BehaviorOptionForm } from "../behavior-option-form";
import { StudentBehaviorNavigation } from "../student-behavior-navigation";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function BehaviorOptionsPage() {
  const context = await requireSchoolPermission("students.update");
  const configured = await db.select({ id: studentBehaviorOptions.id, kind: studentBehaviorOptions.kind, name: studentBehaviorOptions.name })
    .from(studentBehaviorOptions).where(eq(studentBehaviorOptions.schoolId, context.schoolId))
    .orderBy(asc(studentBehaviorOptions.kind), asc(studentBehaviorOptions.name));
  const defaults = [
    ...defaultBehaviorCategories.map((name) => ({ id: `default-category-${name}`, kind: "category", name })),
    ...defaultBehaviorActions.map((name) => ({ id: `default-action-${name}`, kind: "action", name })),
  ];
  const rows = [...defaults, ...configured.map((option) => ({ ...option, kind: option.kind }))];
  return <div className="space-y-6">
    <header>
      <p className="text-sm font-medium text-violet-700">Behavior</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Incident Types &amp; Actions</h1>
      <p className="mt-2 text-sm text-slate-500">Manage the categories and actions available when recording behavior and student incidents.</p>
    </header>
    <StudentBehaviorNavigation active="categories" />
    <AdminDataTable title="Student behaviour categories &amp; actions" mobileCardView columns={[{ key: "kind", label: "Option type" }, { key: "name", label: "Name" }, { key: "source", label: "Source" }]} rows={rows.map((option) => ({ id: option.id, values: { kind: option.kind === "category" ? "Student behaviour category" : "Action taken", name: label(option.name), source: "id" in option ? "School option" : "Built in" }, searchableText: `${option.kind} ${option.name}` }))} toolbarActions={<AdminActionDialog label="Add student behaviour option" title="Add student behaviour option"><BehaviorOptionForm /></AdminActionDialog>} emptyMessage="No student behaviour options are available." />
  </div>;
}
