import { count, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { ArrowUpRight, Users, ShieldCheck, GraduationCap, CircleHelp } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { roles, schoolMemberships, students } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function DashboardPage() {
  const context = await requireSchoolPermission("dashboard.view");
  const [membersResult, rolesResult, studentsResult] = await Promise.all([
    db
      .select({ value: count() })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.schoolId, context.schoolId)),
    db.select({ value: count() }).from(roles).where(eq(roles.schoolId, context.schoolId)),
    db.select({ value: count() }).from(students).where(eq(students.schoolId, context.schoolId)),
  ]);
  const memberCount = Number(membersResult[0]?.value ?? 0);
  const roleCount = Number(rolesResult[0]?.value ?? 0);
  const studentCount = Number(studentsResult[0]?.value ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">
            {new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date())}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome to your workspace
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your school foundation is ready to configure, {context.user.name.split(" ")[0]}.
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 sm:self-auto"
        >
          Configure school
          <ArrowUpRight size={16} />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="School members"
          value={memberCount}
          detail="Authorized accounts"
          icon={<Users size={19} />}
          color="violet"
        />
        <MetricCard
          title="Access roles"
          value={roleCount}
          detail="Configured for this school"
          icon={<ShieldCheck size={19} />}
          color="blue"
        />
        <MetricCard
          title="Students"
          value={studentCount}
          detail="Active enrollment records"
          icon={<GraduationCap size={19} />}
          color="green"
        />
        <MetricCard
          title="School status"
          value="Active"
          detail="Authorized school workspace"
          icon={<CircleHelp size={19} />}
          color="peach"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Workspace setup</h2>
              <p className="mt-1 text-sm text-slate-500">A secure first step before adding school records.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Foundation
            </span>
          </div>
          <div className="mt-6 space-y-4">
            <SetupItem number="01" title="School profile" description="Set the school name, currency, and timezone." href="/admin/settings" />
            <SetupItem number="02" title="Administrator access" description="The initial account is protected by server-side permissions." />
            <SetupItem number="03" title="Academic records" description="Student records and admissions are now managed in the school directory." href="/admin/students" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          <p className="mt-1 text-sm text-slate-500">School activity will appear here as records are added.</p>
          <div className="mt-6 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
              <CircleHelp size={18} />
            </span>
            <p className="text-sm font-medium text-slate-700">No activity yet</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              This panel will show real updates from your school database.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  color: "violet" | "blue" | "green" | "peach";
}) {
  const styles = {
    violet: "bg-violet-50 text-violet-700",
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    peach: "bg-orange-50 text-orange-700",
  }[color];

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles}`}>{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </article>
  );
}

function SetupItem({
  number,
  title,
  description,
  href,
}: {
  number: string;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-bold text-violet-700">
        {number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      {href && <ArrowUpRight size={16} className="shrink-0 text-slate-400" />}
    </>
  );

  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50">
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-xl p-2">{content}</div>
  );
}
