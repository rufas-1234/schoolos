import { and, eq, inArray } from "drizzle-orm";
import { KeyRound, LayoutDashboard } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { AccountSecurityContent } from "@/components/account-security-content";
import { db } from "@/db";
import { permissions, rolePermissions, roles, staffMembers, students, userRoles, userStudentLinks } from "@/db/schema";
import { requireSchoolMember } from "@/lib/access-control";
import { getWorkspaceHomePath } from "@/lib/workspace-home-policy";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const context = await requireSchoolMember();
  const [permissionRows, studentLinks, parentLinks, staffRecords, studentByEmail, parentByEmail] = await Promise.all([
    db.select({ key: permissions.key }).from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(userRoles.membershipId, context.membershipId), eq(roles.schoolId, context.schoolId))),
    db.select({ studentId: userStudentLinks.studentId }).from(userStudentLinks)
      .where(and(eq(userStudentLinks.schoolId, context.schoolId), eq(userStudentLinks.userId, context.user.id), eq(userStudentLinks.accessType, "student"))),
    db.select({ studentId: userStudentLinks.studentId }).from(userStudentLinks)
      .where(and(eq(userStudentLinks.schoolId, context.schoolId), eq(userStudentLinks.userId, context.user.id), eq(userStudentLinks.accessType, "parent"))),
    db.select({ id: staffMembers.id, personnelRole: staffMembers.personnelRole }).from(staffMembers)
      .where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.linkedUserId, context.user.id), eq(staffMembers.status, "active"))),
    db.select({ id: students.id }).from(students)
      .where(and(eq(students.schoolId, context.schoolId), inArray(students.status, ["admitted", "active"]), eq(students.email, context.user.email)))
      .limit(1),
    db.select({ id: students.id }).from(students)
      .where(and(eq(students.schoolId, context.schoolId), inArray(students.status, ["admitted", "active"]), eq(students.guardianEmail, context.user.email)))
      .limit(1),
  ]);
  const linkedStudent = studentLinks.length > 0 || studentByEmail.length > 0;
  const linkedParent = parentLinks.length > 0 || parentByEmail.length > 0;
  const workspacePath = getWorkspaceHomePath([...new Set(permissionRows.map(({ key }) => key))], {
    student: linkedStudent,
    parent: linkedParent,
    staff: staffRecords.length > 0,
    teacher: staffRecords.some((record) => record.personnelRole === "teacher"),
  });
  const navigation = workspacePath === "/account/security"
    ? [{ href: "/account/security", label: "Account security", icon: KeyRound }]
    : [{ href: workspacePath, label: "My workspace", icon: LayoutDashboard }];

  return (
    <PortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalLabel="School workspace"
      navigation={navigation}
    >
      <AccountSecurityContent schoolName={context.schoolName} />
    </PortalShell>
  );
}
