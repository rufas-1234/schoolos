import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRecordDialog } from "@/components/admin-data-table";
import { db } from "@/db";
import {
  permissions,
  rolePermissions,
  roles,
  schoolMemberships,
  staffMembers,
  students,
  user,
  userLoginIdentifiers,
  userRoles,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getStudentsEligibleForAccount } from "@/lib/account-provisioning-policy";
import {
  AccountRoleDirectory,
  CaretakerRolesSetupForm,
  CreateRoleForm,
  DeleteRoleForm,
  EditRoleForm,
} from "../../settings/role-forms";
import { AccountProvisionForm } from "./account-provision-form";
import { RoleManagementSections } from "./role-management-sections";

const permissionCategoryLabels: Record<string, string> = {
  accounts: "Accounts",
  academics: "Academics",
  dashboard: "Dashboard",
  examinations: "Examinations",
  fees: "Fees",
  inventory: "Inventory",
  library: "Library",
  dormitories: "Dormitories",
  payments: "Payments",
  results: "Results",
  roles: "Users & access",
  school: "School settings",
  staff: "Human resources",
  students: "Students",
};

function getRoleCategories(permissionKeys: string[]) {
  return [...new Set(permissionKeys.map((key) =>
    permissionCategoryLabels[key.split(".")[0]] ?? "Other permissions",
  ))].sort((a, b) => a.localeCompare(b));
}

export default async function UserRolesPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; roleId?: string }>;
}) {
  const context = await requireSchoolPermission("roles.manage");
  const { section, roleId: requestedRoleId } = await searchParams;
  const validSections = ["create-role", "school-roles", "caretaker-roles", "create-account", "individual-access"];
  if (!section || !validSections.includes(section)) {
    redirect("/admin/users/roles?section=create-role");
  }
  const [schoolRoles, availablePermissions, accounts, staffProfiles, studentProfiles, parentProfiles, loginIdentifiers] = await Promise.all([
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
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
      email: staffMembers.email,
      phone: staffMembers.phone,
      employeeCode: staffMembers.employeeCode,
    }).from(staffMembers)
      .where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.status, "active"),
        isNull(staffMembers.linkedUserId),
      ))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      status: students.status,
    }).from(students)
      .where(and(
        eq(students.schoolId, context.schoolId),
        inArray(students.status, ["admitted", "active"]),
      ))
      .orderBy(asc(students.lastName), asc(students.firstName)),
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      guardianName: students.guardianName,
      guardianEmail: students.guardianEmail,
      guardianPhone: students.guardianPhone,
    }).from(students)
      .where(and(
        eq(students.schoolId, context.schoolId),
        inArray(students.status, ["admitted", "active"]),
      ))
      .orderBy(asc(students.lastName), asc(students.firstName)),
    db.select({
      userId: userLoginIdentifiers.userId,
      identifier: userLoginIdentifiers.identifier,
      kind: userLoginIdentifiers.kind,
    }).from(userLoginIdentifiers)
      .where(eq(userLoginIdentifiers.schoolId, context.schoolId)),
  ]);
  const identifiersByUser = new Map<string, string[]>();
  for (const item of loginIdentifiers) {
    const identifiers = identifiersByUser.get(item.userId) ?? [];
    identifiers.push(item.identifier);
    identifiersByUser.set(item.userId, identifiers);
  }
  const studentAccountOptions = getStudentsEligibleForAccount(
    studentProfiles,
    loginIdentifiers.map((item) => item.identifier),
  )
    .map((student) => ({
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
    }));
  const parentAccountOptions = parentProfiles
    .filter((student) => student.guardianEmail?.trim() || student.guardianPhone?.trim())
    .map((student) => ({
      id: student.id,
      name: student.guardianName?.trim() || "Parent or guardian",
      childName: `${student.firstName} ${student.lastName}`,
      email: student.guardianEmail,
      phone: student.guardianPhone,
    }));
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
  const roleOptions = schoolRoles.map((role) => ({
    id: role.id,
    name: role.name,
    categories: getRoleCategories(permissionsByRole.get(role.id) ?? []),
  }));
  const accountsWithRoles = accounts.map((account) => ({
    ...account,
    currentRoleIds: roleIdsByMembership.get(account.membershipId) ?? [],
    loginIdentifiers: identifiersByUser.get(account.userId) ?? [],
  }));
  const suggestedRoleId = /^\d+$/.test(requestedRoleId ?? "")
    ? schoolRoles.find((role) => role.id === Number(requestedRoleId))?.id
    : undefined;
  const dormitoryCaretakerRole = schoolRoles.find((role) =>
    role.name === "Dormitory Caretaker" && permissionsByRole.get(role.id)?.includes("dormitories.manage"),
  );
  const libraryCaretakerRole = schoolRoles.find((role) =>
    role.name === "Library Caretaker" && permissionsByRole.get(role.id)?.includes("library.manage"),
  );

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-violet-700">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">User roles</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Set up school roles, create login accounts, and manage individual access.
        </p>
      </header>

      <RoleManagementSections sections={[
        {
          id: "create-role",
          label: "Create a role",
          description: "Define a role and select only the permissions it needs.",
          content: <CreateRoleForm permissions={availablePermissions} />,
        },
        {
          id: "school-roles",
          label: `Roles at ${context.schoolName}`,
          description: "Review and manage this school's roles, permissions, and account assignments.",
          content: (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(getRoleCategories(permissionsByRole.get(role.id) ?? [])).map((category) => (
                          <span key={category} className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                            {category}
                          </span>
                        ))}
                      </div>
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
                {schoolRoles.length === 0 && (
                  <li className="p-7 text-center text-sm text-slate-500">No roles have been created for this school yet.</li>
                )}
              </ul>
            </section>
          ),
        },
        {
          id: "caretaker-roles",
          label: "Caretaker roles & accounts",
          description: "Set up limited-access dormitory and library roles, then provision accounts for existing staff profiles.",
          content: (
            <div className="space-y-4">
              <CaretakerRolesSetupForm />
              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Dormitory caretaker</h3>
                  <p className="mt-1 text-sm text-slate-500">Access to dormitory setup, room assignments, and reports.</p>
                  {dormitoryCaretakerRole ? (
                    <Link href={`/admin/users/roles?section=create-account&roleId=${dormitoryCaretakerRole.id}`}
                      className="mt-3 inline-flex rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white">
                      Create caretaker account
                    </Link>
                  ) : <p className="mt-3 text-xs text-amber-700">Set up caretaker roles to continue.</p>}
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Library caretaker</h3>
                  <p className="mt-1 text-sm text-slate-500">Access to books, members, circulation, and library reports.</p>
                  {libraryCaretakerRole ? (
                    <Link href={`/admin/users/roles?section=create-account&roleId=${libraryCaretakerRole.id}`}
                      className="mt-3 inline-flex rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white">
                      Create caretaker account
                    </Link>
                  ) : <p className="mt-3 text-xs text-amber-700">Set up caretaker roles to continue.</p>}
                </section>
              </div>
              <p className="text-sm text-slate-500">
                Caretakers need an active staff profile and email. Add them to Staff first.
              </p>
            </div>
          ),
        },
        {
          id: "create-account",
          label: "Create a login account",
          description: "Set up login access for an existing staff, student, or parent profile.",
          content: (
            <AccountProvisionForm
              staff={staffProfiles.map((staff) => ({
                id: staff.id,
                name: `${staff.firstName} ${staff.lastName}`,
                email: staff.email,
                phone: staff.phone,
              }))}
              students={studentAccountOptions}
              parents={parentAccountOptions}
              roles={schoolRoles.map(({ id, name }) => ({ id, name }))}
              suggestedRoleId={suggestedRoleId}
            />
          ),
        },
        {
          id: "individual-access",
          label: "Manage individual access",
          description: "Assign roles to each account or disable school access without deleting the account.",
          content: (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {accounts.length === 0 ? (
                <p className="p-7 text-center text-sm text-slate-500">No active school accounts are available.</p>
              ) : (
                <AccountRoleDirectory accounts={accountsWithRoles} roles={roleOptions} />
              )}
            </section>
          ),
        },
      ]} activeSectionId={section} />
    </div>
  );
}
