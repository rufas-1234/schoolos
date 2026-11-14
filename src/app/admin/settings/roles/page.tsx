import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
  user,
  userRoles,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { AccountRolesForm, CreateRoleForm } from "../role-forms";

export default async function UserRolesPage() {
  const context = await requireSchoolPermission("roles.manage");
  const [schoolRoles, availablePermissions, accounts] = await Promise.all([
    db.select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
    }).from(roles)
      .where(eq(roles.schoolId, context.schoolId))
      .orderBy(asc(roles.name)),
    db.select({
      id: permissions.id,
      key: permissions.key,
      description: permissions.description,
    }).from(permissions).orderBy(asc(permissions.key)),
    db.select({
      membershipId: schoolMemberships.id,
      userId: user.id,
      name: user.name,
      email: user.email,
    }).from(schoolMemberships)
      .innerJoin(user, eq(schoolMemberships.userId, user.id))
      .where(and(
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(schoolMemberships.status, "active"),
        eq(user.isActive, true),
      ))
      .orderBy(asc(user.name)),
  ]);
  const assignedRoles = accounts.length
    ? await db.select({
      membershipId: userRoles.membershipId,
      roleId: userRoles.roleId,
    }).from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(
        inArray(userRoles.membershipId, accounts.map((account) => account.membershipId)),
        eq(roles.schoolId, context.schoolId),
      ))
    : [];
  const roleIdsByMembership = new Map<number, number[]>();
  for (const assignment of assignedRoles) {
    const roleIds = roleIdsByMembership.get(assignment.membershipId) ?? [];
    roleIds.push(assignment.roleId);
    roleIdsByMembership.set(assignment.membershipId, roleIds);
  }
  const rolePermissionsList = schoolRoles.length
    ? await db.select({
      roleId: rolePermissions.roleId,
      permission: permissions.key,
    }).from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, schoolRoles.map((role) => role.id)))
    : [];
  const permissionsByRole = new Map<number, string[]>();
  for (const item of rolePermissionsList) {
    const keys = permissionsByRole.get(item.roleId) ?? [];
    keys.push(item.permission);
    permissionsByRole.set(item.roleId, keys);
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-violet-700">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">User roles</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Create school-specific roles, grant the least required permissions, and assign those roles to active school accounts.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <CreateRoleForm permissions={availablePermissions} />
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Roles in {context.schoolName}</h2>
            <p className="mt-1 text-sm text-slate-500">System roles are protected; custom roles can be added for school needs.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {schoolRoles.map((role) => (
              <li key={role.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-800">{role.name}</h3>
                    {role.description && <p className="mt-1 text-sm text-slate-500">{role.description}</p>}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {role.isSystem ? "System" : "Custom"}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {(permissionsByRole.get(role.id) ?? []).join(" · ") || "No permissions assigned"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Account role assignments</h2>
          <p className="mt-1 text-sm text-slate-500">Assign roles to existing active accounts; this does not create user accounts.</p>
        </div>
        {accounts.length === 0 ? (
          <p className="p-7 text-center text-sm text-slate-500">No active school accounts are available.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <li key={account.membershipId} className="grid gap-4 p-5 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)]">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{account.name}</p>
                  <p className="truncate text-sm text-slate-500">{account.email}</p>
                </div>
                <AccountRolesForm
                  userId={account.userId}
                  currentRoleIds={roleIdsByMembership.get(account.membershipId) ?? []}
                  roles={schoolRoles.map(({ id, name }) => ({ id, name }))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
