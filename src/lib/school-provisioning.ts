import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  chartOfAccounts,
  permissions,
  rolePermissions,
  roles,
  schoolBranches,
  schoolMemberships,
  schools,
  userRoles,
} from "@/db/schema";
import { defaultChartAccounts, defaultRolePermissionKeys, initialSchoolRoles, schoolPermissionCatalog } from "@/lib/school-defaults";

type SchoolTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SchoolNameConflictError extends Error {}

export async function provisionSchoolWorkspace(
  tx: SchoolTransaction,
  {
    name,
    email,
    phone,
    address,
    administratorUserId,
    actorUserId,
  }: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    administratorUserId: string;
    actorUserId: string;
  },
) {
  const [existingSchool] = await tx.select({ id: schools.id })
    .from(schools).where(eq(schools.name, name)).limit(1);
  if (existingSchool) throw new SchoolNameConflictError("A school with this name already exists.");

  const schoolPublicId = randomUUID();
  await tx.insert(schools).values({ publicId: schoolPublicId, name, email, phone, address });
  const [school] = await tx.select({ id: schools.id }).from(schools)
    .where(eq(schools.publicId, schoolPublicId)).limit(1);
  if (!school) throw new Error("The new school record could not be loaded.");

  await tx.insert(schoolBranches).values({
    publicId: randomUUID(),
    schoolId: school.id,
    name: "Main campus",
    code: "MAIN",
    email,
    contactNumber: phone,
    address,
  });

  await tx.insert(chartOfAccounts).values(defaultChartAccounts.map(([code, accountName, accountType, description]) => ({
    publicId: randomUUID(),
    schoolId: school.id,
    code,
    name: accountName,
    accountType,
    description,
  })));

  for (const [key, description] of schoolPermissionCatalog) {
    await tx.insert(permissions).values({ key, description })
      .onDuplicateKeyUpdate({ set: { description } });
  }

  await tx.insert(roles).values(initialSchoolRoles.map((roleName) => ({
    schoolId: school.id,
    name: roleName,
    isSystem: true,
  })));
  const createdRoles = await tx.select({ id: roles.id, name: roles.name })
    .from(roles).where(eq(roles.schoolId, school.id));
  const roleIdsByName = new Map(createdRoles.map((role) => [role.name, role.id]));

  const requiredPermissionKeys = [...new Set(Object.values(defaultRolePermissionKeys).flat())];
  const permissionRows = await tx.select({ id: permissions.id, key: permissions.key })
    .from(permissions).where(inArray(permissions.key, requiredPermissionKeys));
  const permissionIdsByKey = new Map(permissionRows.map((permission) => [permission.key, permission.id]));

  const rolePermissionAssignments = Object.entries(defaultRolePermissionKeys).flatMap(([roleName, permissionKeys]) => {
    const roleId = roleIdsByName.get(roleName);
    if (!roleId) throw new Error(`The default ${roleName} role was not created.`);
    return permissionKeys.map((key) => {
      const permissionId = permissionIdsByKey.get(key);
      if (!permissionId) throw new Error(`The required ${key} permission is not available.`);
      return { roleId, permissionId };
    });
  });
  await tx.insert(rolePermissions).values(rolePermissionAssignments);

  const administratorRoleId = roleIdsByName.get("School administrator");
  if (!administratorRoleId) throw new Error("The school administrator role was not created.");
  await tx.insert(schoolMemberships).values({ schoolId: school.id, userId: administratorUserId });
  const [membership] = await tx.select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(and(
      eq(schoolMemberships.schoolId, school.id),
      eq(schoolMemberships.userId, administratorUserId),
    ))
    .limit(1);
  if (!membership) throw new Error("The administrator membership could not be loaded.");
  await tx.insert(userRoles).values({ membershipId: membership.id, roleId: administratorRoleId });

  await tx.insert(auditLogs).values({
    schoolId: school.id,
    actorUserId,
    action: "school.provisioned",
    resourceType: "school",
    resourcePublicId: schoolPublicId,
    changedFields: ["name", "email", "phone", "address", "administrator"],
  });

  return { schoolPublicId };
}
