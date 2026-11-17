import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { examReportSignatures } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { SignatureForm, type SignatureRole } from "./signature-form";

export const dynamic = "force-dynamic";

const signatureRoles: SignatureRole[] = ["headteacher", "class-teacher", "subject-teacher"];

export default async function ExamReportSignaturesPage() {
  const context = await requireSchoolPermission([
    "examinations.create",
    "results.publish",
    "school.settings.manage",
  ]);
  const rows = await db.select({
    role: examReportSignatures.role,
    updatedAt: examReportSignatures.updatedAt,
  })
    .from(examReportSignatures).where(and(
      eq(examReportSignatures.schoolId, context.schoolId),
      inArray(examReportSignatures.role, signatureRoles),
    ));
  const configuredVersions = new Map(rows.map((row) => [row.role, row.updatedAt.getTime()]));
  return <main className="space-y-6 p-4 sm:p-6">
    <header>
      <p className="text-sm font-semibold text-violet-700">Examinations</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Report signatures</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">Upload the signatures that appear on printable examination reports. Images are private to this school.</p>
    </header>
    <section className="grid gap-4 lg:grid-cols-3">
      {signatureRoles.map((role) => <SignatureForm key={role} role={role} version={configuredVersions.get(role)} />)}
    </section>
  </main>;
}
