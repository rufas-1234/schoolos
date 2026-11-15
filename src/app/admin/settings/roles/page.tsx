import { and, asc, eq, inArray } from "drizzle-orm";
import { AdminRecordDialog } from "@/components/admin-data-table";
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
import {
  AccountRolesForm,
  CreateRoleForm,
  DeleteRoleForm,
  EditRoleForm,
  SchoolAccountAccessForm,
} from "../role-forms";

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
      membershipStatus: schoolMemberships.status,
    }).from(schoolMemberships)
      .innerJoin(user, eq(schoolMemberships.userId, user.id))
      .where(and(
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(user.isActive, true),
      ))
      .orderBy(asc(user.name)),
  ]);
  const assignedRoles = schoolRoles.length
    ? await db.select({
      membershipId: userRoles.membershipId,
      roleId: userRoles.roleId,
    }).from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(schoolMemberships, eq(userRoles.membershipId, schoolMemberships.id))
      .where(and(
        eq(roles.schoolId, context.schoolId),
        eq(schoolMemberships.schoolId, context.schoolId),
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
      permissionId: permissions.id,
      permission: permissions.key,
      description: permissions.description,
    }).from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, schoolRoles.map((role) => role.id)))
    : [];
  const permissionsByRole = new Map<number, string[]>();
  const permissionIdsByRole = new Map<number, number[]>();
  const permissionDescriptions = new Map(availablePermissions.map((permission) => [
    permission.key,
    permission.description,
  ]));
  for (const item of rolePermissionsList) {
    const keys = permissionsByRole.get(item.roleId) ?? [];
    keys.push(item.permission);
    permissionsByRole.set(item.roleId, keys);
    const ids = permissionIdsByRole.get(item.roleId) ?? [];
    ids.push(item.permissionId);
    permissionIdsByRole.set(item.roleId, ids);
  }
  const assignedCountByRole = new Map<number, number>();
  for (const assignment of assignedRoles) {
    assignedCountByRole.set(
      assignment.roleId,
      (assignedCountByRole.get(assignment.roleId) ?? 0) + 1,
    );
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-violet-700">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">User roles</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Create school-specific roles, grant the least required permissions, and assign those roles to active school accounts.
        </p>
        <p className="mt-3 max-w-3xl rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          To enable a teacher, assign the Teacher role to their account below. It grants academic management, student record access, exam setup, and marks entry, but not deletion or result publishing. Link the account to an active teacher profile so the portal can show assigned classes and subjects.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <CreateRoleForm permissions={availablePermissions} />
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Roles in {context.schoolName}</h2>
            <p className="mt-1 text-sm text-slate-500">System and custom role permissions can be changed at any time. Roles must be unassigned before deletion.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {schoolRoles.map((role) => (
              <li key={role.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{role.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {role.isSystem ? "System" : "Custom"}
                    </span>
                  </div>
                  {role.description && <p className="mt-1 text-sm text-slate-500">{role.description}</p>}
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {(permissionsByRole.get(role.id) ?? []).join(" · ") || "No permissions assigned"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {assignedCountByRole.get(role.id) ?? 0} account assignment{assignedCountByRole.get(role.id) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AdminRecordDialog mode="view" title={`View ${role.name}`}>
                    <dl className="space-y-4">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</dt>
                        <dd className="mt-1 text-sm text-slate-800">{role.description || "No description"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role type</dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {role.isSystem ? "System role (editable)" : "Custom role"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account assignments</dt>
                        <dd className="mt-1 text-sm text-slate-800">{assignedCountByRole.get(role.id) ?? 0}</dd>
                      </div>
                      <div>
                        <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</dt>
                        {(permissionsByRole.get(role.id) ?? []).length ? (
                          <ul className="space-y-2">
                            {(permissionsByRole.get(role.id) ?? []).map((key) => (
                              <li key={key} className="rounded-lg border border-slate-100 px-3 py-2">
                                <p className="text-sm font-medium text-slate-800">{permissionDescriptions.get(key) ?? key}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{key}</p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-500">No permissions assigned.</p>
                        )}
                      </div>
                    </dl>
                  </AdminRecordDialog>
                  <AdminRecordDialog title={`Edit ${role.name}`}>
                    <EditRoleForm
                      role={{
                        ...role,
                        permissionIds: permissionIdsByRole.get(role.id) ?? [],
                      }}
                      permissions={availablePermissions}
                    />
                  </AdminRecordDialog>
                  {!role.isSystem && <DeleteRoleForm roleId={role.id} roleName={role.name} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">School login access and role assignments</h2>
          <p className="mt-1 text-sm text-slate-500">Select the role names this account should have, then choose Save role assignments. For a teacher, select Teacher. Disabling access blocks this account from entering this school but does not delete the user.</p>
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
                  <p className={`mt-1 text-xs font-semibold ${account.membershipStatus === "active" ? "text-emerald-700" : "text-rose-700"}`}>
                    {account.membershipStatus === "active" ? "School access enabled" : "School access disabled"}
                  </p>
                  <div className="mt-3">
                    <SchoolAccountAccessForm
                      membershipId={account.membershipId}
                      enabled={account.membershipStatus === "active"}
                      userName={account.name}
                    />
                  </div>
                </div>
                {account.membershipStatus === "active" ? (
                  <AccountRolesForm
                    userId={account.userId}
                    currentRoleIds={roleIdsByMembership.get(account.membershipId) ?? []}
                    roles={schoolRoles.map(({ id, name }) => ({ id, name }))}
                  />
                ) : (
                  <p className="self-center text-sm text-slate-500">Enable school access before assigning roles.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
