import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { Award, IdCard, Users } from "lucide-react";
import { db } from "@/db";
import { staffCertificates, studentCertificates, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function CertificatesOverviewPage() {
  const context = await requireSchoolPermission(["students.view", "staff.manage", "academics.manage", "school.settings.manage"]);
  const [studentIds, staffCerts, studentCerts] = await Promise.all([
    context.grantedPermissions.includes("students.view")
      ? db.select({ total: count() }).from(students).where(eq(students.schoolId, context.schoolId))
      : Promise.resolve([{ total: 0 }]),
    context.grantedPermissions.includes("staff.manage") || context.grantedPermissions.includes("school.settings.manage")
      ? db.select({ total: count() }).from(staffCertificates).where(eq(staffCertificates.schoolId, context.schoolId))
      : Promise.resolve([{ total: 0 }]),
    context.grantedPermissions.includes("academics.manage") || context.grantedPermissions.includes("school.settings.manage")
      ? db.select({ total: count() }).from(studentCertificates).where(eq(studentCertificates.schoolId, context.schoolId))
      : Promise.resolve([{ total: 0 }]),
  ]);
  const links = [
    context.grantedPermissions.includes("students.view") && { href: "/admin/students/ids", title: "Student IDs", detail: "Find, manage, and print student identification cards.", count: studentIds[0].total, icon: <IdCard size={21} /> },
    (context.grantedPermissions.includes("staff.manage") || context.grantedPermissions.includes("school.settings.manage")) && { href: "/admin/certificates/staff", title: "Staff certificates", detail: "Issue, search, and print certificates for staff members.", count: staffCerts[0].total, icon: <Users size={21} /> },
    (context.grantedPermissions.includes("academics.manage") || context.grantedPermissions.includes("school.settings.manage")) && { href: "/admin/academics/certificates", title: "Student certificates", detail: "Issue and print student achievement certificates.", count: studentCerts[0].total, icon: <Award size={21} /> },
  ].filter((item) => item !== false);
  return <main className="space-y-6">
    <header><p className="text-sm font-semibold text-violet-700">People</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Certificates overview</h1><p className="mt-2 text-sm text-slate-600">Student identification, staff certificates, and student achievement certificates.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{links.map((item) => item && <Link key={item.title} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-violet-200 hover:shadow-sm"><div className="flex items-start justify-between"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-700">{item.icon}</span><span className="text-2xl font-bold text-slate-900">{item.count}</span></div><h2 className="mt-4 font-semibold text-slate-900">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.detail}</p><span className="mt-4 inline-block text-sm font-semibold text-violet-700">Open module →</span></Link>)}</div>
  </main>;
}
