import { desc, eq } from "drizzle-orm";
import { ArrowUpRight, Mail, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { StudentForm } from "./student-form";

export default async function StudentsPage() {
  const context = await requireSchoolPermission("students.view");
  const records = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      email: students.email,
      phone: students.phone,
      status: students.status,
      createdAt: students.createdAt,
    })
    .from(students)
    .where(eq(students.schoolId, context.schoolId))
    .orderBy(desc(students.createdAt));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Phase 2</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Student records</h1>
        </div>
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Back to overview
          <ArrowUpRight size={16} />
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">School directory</h2>
              <p className="mt-1 text-sm text-slate-500">Updated with each new enrollment.</p>
            </div>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
              {records.length} records
            </span>
          </div>

          {records.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm">
                <UserRound size={20} />
              </div>
              <p className="text-base font-semibold text-slate-800">No student records yet</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Add the first record to begin tracking admissions and enrollment status.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <article key={record.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-lg font-bold text-violet-700">
                      {record.firstName.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {record.firstName} {record.lastName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {record.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail size={12} />
                            {record.email}
                          </span>
                        )}
                        {record.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={12} />
                            {record.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {record.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(record.createdAt)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <StudentForm />
      </div>
    </div>
  );
}
