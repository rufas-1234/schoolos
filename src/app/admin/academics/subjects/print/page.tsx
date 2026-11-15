import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import { schoolBranches, subjects } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function SubjectListPrintPage() {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const records = await db
    .select({
      branchName: schoolBranches.name,
      name: subjects.name,
      code: subjects.code,
      subjectType: subjects.subjectType,
    })
    .from(subjects)
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, subjects.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .where(eq(subjects.schoolId, context.schoolId))
    .orderBy(asc(schoolBranches.name), asc(subjects.name));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-slate-900 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 print:pb-3">
        <div>
          <p className="text-sm font-semibold text-violet-700 print:text-slate-600">{context.schoolName}</p>
          <h1 className="mt-1 text-2xl font-bold">Subjects</h1>
          <p className="mt-1 text-sm text-slate-500">Subject catalog · {records.length} {records.length === 1 ? "subject" : "subjects"}</p>
        </div>
        <div className="print:hidden flex items-center gap-3">
          <Link href="/admin/academics?section=subjects" className="text-sm font-semibold text-slate-600 hover:text-violet-700">
            Back to subjects
          </Link>
          <PrintButton label="Print subjects" />
        </div>
      </header>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-slate-300 text-xs uppercase tracking-wide text-slate-600">
            <th className="px-3 py-3 font-semibold">No.</th>
            <th className="px-3 py-3 font-semibold">Subject</th>
            <th className="px-3 py-3 font-semibold">Code</th>
            <th className="px-3 py-3 font-semibold">Type</th>
            <th className="px-3 py-3 font-semibold">Branch</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={`${record.branchName}-${record.code}`} className="border-b border-slate-200">
              <td className="px-3 py-3 text-slate-500">{index + 1}</td>
              <td className="px-3 py-3 font-medium">{record.name}</td>
              <td className="px-3 py-3">{record.code}</td>
              <td className="px-3 py-3 capitalize">{record.subjectType}</td>
              <td className="px-3 py-3">{record.branchName}</td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">No subjects have been added.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
