"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  permissions,
  rolePermissions,
  roles,
  students,
  userRoles,
  userStudentLinks,
} from "@/db/schema";
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
  const studentLinks = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "student"),
    ));
  const parentLinks = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "parent"),
    ));
  const [studentRecord, parentRecord] = await Promise.all([
    db.select({ id: students.id }).from(students)
      .where(and(
        eq(students.schoolId, context.schoolId),
        inArray(students.status, ["admitted", "active"]),
        studentLinks.length
          ? or(
            eq(students.email, context.user.email),
            inArray(students.id, studentLinks.map(({ studentId }) => studentId)),
          )
          : eq(students.email, context.user.email),
      ))
      .limit(1),
    db.select({ id: students.id }).from(students)
      .where(and(
        eq(students.schoolId, context.schoolId),
        inArray(students.status, ["admitted", "active"]),
        parentLinks.length
          ? or(
            eq(students.guardianEmail, context.user.email),
            inArray(students.id, parentLinks.map(({ studentId }) => studentId)),
          )
          : eq(students.guardianEmail, context.user.email),
      ))
      .limit(1),
  ]);
  return getWorkspaceHomePath(permissionKeys, {
    student: studentRecord.length > 0,
    parent: parentRecord.length > 0,
  });
}
