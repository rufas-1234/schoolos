import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { roles, schoolMemberships, user, userRoles } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  const { search } = await searchParams;
  const context = await requireSchoolPermission("roles.manage");
  const memberships = await db.select({
    membershipId: schoolMemberships.id,
    name: user.name,
    email: user.email,
    accountActive: user.isActive,
    membershipStatus: schoolMemberships.status,
    createdAt: schoolMemberships.createdAt,
  }).from(schoolMemberships)
    .innerJoin(user, eq(schoolMemberships.userId, user.id))
    .where(eq(schoolMemberships.schoolId, context.schoolId))
    .orderBy(asc(user.name));
  const assignments = memberships.length
    ? await db.select({
      membershipId: userRoles.membershipId,
      roleName: roles.name,
    }).from(userRoles)
      .innerJoin(roles, and(
        eq(userRoles.roleId, roles.id),
        eq(roles.schoolId, context.schoolId),
      ))
      .where(inArray(userRoles.membershipId, memberships.map((membership) => membership.membershipId)))
    : [];
  const roleNamesByMembership = new Map<number, string[]>();
  for (const assignment of assignments) {
    const names = roleNamesByMembership.get(assignment.membershipId) ?? [];
    names.push(assignment.roleName);
    roleNamesByMembership.set(assignment.membershipId, names);
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Users</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Review accounts with access to {context.schoolName} and manage their school roles.
          </p>
        </div>
        <Link
          href="/admin/users/roles"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-50"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Manage roles
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>

      <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
        User accounts are created through the school’s account onboarding flow. This directory shows each account’s
        current school access; use Manage roles to assign permissions or enable and disable access.
      </section>

      <AdminDataTable
        key={typeof search === "string" ? search : ""}
        title="School users"
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "roles", label: "Roles" },
          { key: "status", label: "School access" },
          { key: "accountStatus", label: "Account" },
        ]}
        rows={memberships.map((membership) => ({
          id: membership.membershipId,
          values: {
            name: membership.name,
            email: membership.email,
            roles: (roleNamesByMembership.get(membership.membershipId) ?? []).join(", ") || "No roles assigned",
            status: membership.membershipStatus === "active" ? "Enabled" : "Disabled",
            accountStatus: membership.accountActive ? "Active" : "Inactive",
            createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(membership.createdAt),
          },
        }))}
        initialQuery={typeof search === "string" ? search.slice(0, 120) : ""}
        emptyMessage="No users have school access yet."
      />
    </div>
  );
}
