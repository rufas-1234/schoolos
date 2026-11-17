"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { permissions, rolePermissions, roles, students, userRoles } from "@/db/schema";
import { requireSchoolMember } from "@/lib/access-control";
import { getWorkspaceHomePath } from "@/lib/workspace-home-policy";

export async function getSignedInWorkspacePath(): Promise<string> {
  const context = await requireSchoolMember();
  const granted = await db.select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(
      eq(userRoles.membershipId, context.membershipId),
      eq(roles.schoolId, context.schoolId),
    ));
  const permissionKeys = [...new Set(granted.map(({ key }) => key))];
  const [studentRecord, parentRecord] = await Promise.all([
    db.select({ id: students.id }).from(students)
      .where(and(
        eq(students.schoolId, context.schoolId),
        eq(students.email, context.user.email),
        inArray(students.status, ["admitted", "active"]),
      ))
      .limit(1),
    db.select({ id: students.id }).from(students)
      .where(and(
        eq(students.schoolId, context.schoolId),
        eq(students.guardianEmail, context.user.email),
        inArray(students.status, ["admitted", "active"]),
      ))
      .limit(1),
  ]);
  return getWorkspaceHomePath(permissionKeys, {
    student: studentRecord.length > 0,
    parent: parentRecord.length > 0,
  });
}
