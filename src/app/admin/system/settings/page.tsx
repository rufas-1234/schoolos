import Link from "next/link";
import { ArrowUpRight, GraduationCap, School, UsersRound } from "lucide-react";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function SystemSettingsPage() {
  const context = await requireSchoolPermission("school.settings.manage");
  const settingsLinks = [
    { href: "/admin/settings", title: "School profile", description: "School identity, contact information, currency, and timezone.", icon: School },
    ...(context.grantedPermissions.includes("roles.manage") ? [{ href: "/admin/users/roles", title: "Roles and access", description: "Manage user roles and permission access.", icon: UsersRound }] : []),
    { href: "/admin/students/settings", title: "Student settings", description: "Configure student identifiers and profile fields.", icon: GraduationCap },
    { href: "/admin/hr/settings", title: "Staff settings", description: "Configure staff profile fields and HR requirements.", icon: UsersRound },
  ];

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-medium text-violet-700">System</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">System Settings</h1>
      <p className="mt-2 text-sm text-slate-500">Manage the settings that configure your school workspace.</p>
    </header>
    <div className="grid gap-4 sm:grid-cols-2">
      {settingsLinks.map(({ href, title, description, icon: Icon }) => (
        <Link key={href} href={href} className="group flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span></span>
          <ArrowUpRight size={17} className="shrink-0 text-slate-400 transition group-hover:text-violet-700" />
        </Link>
      ))}
    </div>
  </div>;
}
