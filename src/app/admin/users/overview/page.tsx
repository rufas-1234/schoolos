import Link from "next/link";
import { ArrowUpRight, KeyRound, ShieldCheck, UserRoundCog, Users } from "lucide-react";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function UsersOverviewPage() {
  const context = await requireSchoolPermission("roles.manage");
  const links = [
    { href: "/admin/users", title: "User directory", description: "Review people with access to this school and their account status.", icon: Users },
    { href: "/admin/users/roles?section=school-roles", title: "School roles", description: "Review roles and the permissions assigned to each role.", icon: ShieldCheck },
    { href: "/admin/users/roles?section=create-role", title: "Create a role", description: "Set up a role for a group of school users.", icon: UserRoundCog },
    { href: "/admin/users/roles?section=create-account", title: "Create an account", description: "Create a user account and give it school access.", icon: KeyRound },
    { href: "/admin/users/roles?section=individual-access", title: "Individual access", description: "Review user-specific access assignments.", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-violet-700">Administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Users overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage accounts, school access, and roles for {context.schoolName}.</p>
      </header>
      <section aria-label="User management links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon size={20} aria-hidden="true" /></span>
            <span className="mt-4 flex items-center justify-between gap-3 font-semibold text-slate-900">{title}<ArrowUpRight size={16} className="text-violet-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" /></span>
            <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
