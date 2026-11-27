import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { hasPermission } from "@/lib/access-policy";
import { activeSchoolCookieName, isMultiSchoolEnabled, resolveSchoolChoice } from "@/lib/school-context-policy";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import { getPermissionSubscriptionModule, isSubscriptionCurrent } from "@/lib/subscription-policy";
import {
  permissions,
  rolePermissions,
  roles,
  schoolBranches,
  schoolMemberships,
  schoolSubscriptions,
  schools,
  staffMembers,
  students,
  teachers,
  user,
  userStudentLinks,
  userRoles,
  subscriptionPlans,
} from "@/db/schema";

async function syncPracticeAccessForUser(userId: string) {
  if (!isMultiSchoolEnabled()) return;
  const liveMemberships = await db.select({ schoolId: schoolMemberships.schoolId })
    .from(schoolMemberships).innerJoin(schools, eq(schoolMemberships.schoolId, schools.id))
    .where(and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.status, "active"),
      eq(schools.isPracticeWorkspace, false),
      eq(schools.status, schoolWorkspaceStatuses.active),
      isNull(schools.archivedAt),
    ));
  if (!liveMemberships.length) return;
  const parentIds = [...new Set(liveMemberships.map((membership) => membership.schoolId))];
  const practices = await db.select({ id: schools.id, parentId: schools.practiceParentSchoolId })
    .from(schools).where(and(
      eq(schools.isPracticeWorkspace, true),
      eq(schools.status, schoolWorkspaceStatuses.active),
      isNull(schools.archivedAt),
      inArray(schools.practiceParentSchoolId, parentIds),
    ));
  for (const practice of practices) {
    if (practice.parentId === null) continue;
    const [existing] = await db.select({ id: schoolMemberships.id, status: schoolMemberships.status })
      .from(schoolMemberships).where(and(
        eq(schoolMemberships.schoolId, practice.id),
        eq(schoolMemberships.userId, userId),
      )).limit(1);
    if (existing?.status === "active") continue;

    await db.transaction(async (tx) => {
      const [sourceMembership] = await tx.select({ id: schoolMemberships.id })
        .from(schoolMemberships).where(and(
          eq(schoolMemberships.schoolId, practice.parentId!),
          eq(schoolMemberships.userId, userId),
          eq(schoolMemberships.status, "active"),
        )).for("update").limit(1);
      const [targetSchool] = await tx.select({ id: schools.id })
        .from(schools).where(and(
          eq(schools.id, practice.id),
          eq(schools.isPracticeWorkspace, true),
          eq(schools.practiceParentSchoolId, practice.parentId!),
          eq(schools.status, schoolWorkspaceStatuses.active),
          isNull(schools.archivedAt),
        )).for("update").limit(1);
      if (!sourceMembership || !targetSchool) return;

      let [targetMembership] = await tx.select({ id: schoolMemberships.id })
        .from(schoolMemberships).where(and(
          eq(schoolMemberships.schoolId, practice.id),
          eq(schoolMemberships.userId, userId),
        )).for("update").limit(1);
      if (!targetMembership) {
        await tx.insert(schoolMemberships).values({ schoolId: practice.id, userId, status: "active" });
        [targetMembership] = await tx.select({ id: schoolMemberships.id })
          .from(schoolMemberships).where(and(
            eq(schoolMemberships.schoolId, practice.id),
            eq(schoolMemberships.userId, userId),
          )).limit(1);
      } else {
        await tx.update(schoolMemberships).set({ status: "active" }).where(eq(schoolMemberships.id, targetMembership.id));
      }
      if (!targetMembership) throw new Error("Practice workspace membership could not be created.");

      const sourceRoles = await tx.select({ id: roles.id, name: roles.name, description: roles.description })
        .from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.membershipId, sourceMembership.id), eq(roles.schoolId, practice.parentId!)));
      const assignedRoles: Array<{ membershipId: number; roleId: number }> = [];
      for (const sourceRole of sourceRoles) {
        let [targetRole] = await tx.select({ id: roles.id }).from(roles).where(and(
          eq(roles.schoolId, practice.id),
          eq(roles.name, sourceRole.name),
        )).limit(1);
        if (!targetRole) {
          await tx.insert(roles).values({ schoolId: practice.id, name: sourceRole.name, description: sourceRole.description, isSystem: false });
          [targetRole] = await tx.select({ id: roles.id }).from(roles).where(and(
            eq(roles.schoolId, practice.id), eq(roles.name, sourceRole.name),
          )).limit(1);
        }
        if (!targetRole) continue;
        const [grants, existingGrants] = await Promise.all([
          tx.select({ permissionId: rolePermissions.permissionId }).from(rolePermissions)
            .where(eq(rolePermissions.roleId, sourceRole.id)),
          tx.select({ permissionId: rolePermissions.permissionId }).from(rolePermissions)
            .where(eq(rolePermissions.roleId, targetRole.id)),
        ]);
        const existingGrantIds = new Set(existingGrants.map((grant) => grant.permissionId));
        const missingGrants = grants.filter((grant) => !existingGrantIds.has(grant.permissionId));
        if (missingGrants.length) await tx.insert(rolePermissions).values(missingGrants.map((grant) => ({ roleId: targetRole.id, permissionId: grant.permissionId })));
        assignedRoles.push({ membershipId: targetMembership.id, roleId: targetRole.id });
      }
      await tx.delete(userRoles).where(eq(userRoles.membershipId, targetMembership.id));
      if (assignedRoles.length) await tx.insert(userRoles).values(assignedRoles);

      const [branch] = await tx.select({ id: schoolBranches.id }).from(schoolBranches)
        .where(eq(schoolBranches.schoolId, practice.id)).limit(1);
      if (!branch) return;

      const [sourceStaff] = await tx.select({
        id: staffMembers.id,
        firstName: staffMembers.firstName,
        lastName: staffMembers.lastName,
        personnelRole: staffMembers.personnelRole,
        jobTitle: staffMembers.jobTitle,
        department: staffMembers.department,
      }).from(staffMembers).where(and(
        eq(staffMembers.schoolId, practice.parentId!),
        eq(staffMembers.linkedUserId, userId),
        eq(staffMembers.status, "active"),
      )).limit(1);
      let practiceStaffId: number | undefined;
      if (sourceStaff) {
        const [existingStaff] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(and(
          eq(staffMembers.schoolId, practice.id), eq(staffMembers.linkedUserId, userId),
        )).limit(1);
        if (existingStaff) practiceStaffId = existingStaff.id;
        else {
          const staffPublicId = randomUUID();
          await tx.insert(staffMembers).values({
            publicId: staffPublicId,
            schoolId: practice.id,
            branchId: branch.id,
            firstName: sourceStaff.firstName,
            lastName: sourceStaff.lastName,
            personnelRole: sourceStaff.personnelRole,
            jobTitle: sourceStaff.jobTitle || "Practice staff",
            department: sourceStaff.department || "General",
            linkedUserId: userId,
            status: "active",
          });
          const [createdStaff] = await tx.select({ id: staffMembers.id }).from(staffMembers)
            .where(eq(staffMembers.publicId, staffPublicId)).limit(1);
          practiceStaffId = createdStaff?.id;
        }
        if (practiceStaffId) {
          const [sourceTeacher] = await tx.select({ id: teachers.id }).from(teachers).where(and(
            eq(teachers.schoolId, practice.parentId!),
            eq(teachers.staffMemberId, sourceStaff.id),
            eq(teachers.status, "active"),
          )).limit(1);
          if (sourceTeacher) {
            const [existingTeacher] = await tx.select({ id: teachers.id }).from(teachers)
              .where(and(eq(teachers.schoolId, practice.id), eq(teachers.staffMemberId, practiceStaffId))).limit(1);
            if (!existingTeacher) await tx.insert(teachers).values({
              publicId: randomUUID(), schoolId: practice.id, branchId: branch.id,
              staffMemberId: practiceStaffId, firstName: sourceStaff.firstName,
              lastName: sourceStaff.lastName, status: "active",
            });
          }
        }
      }

      const [sourceStudentLink] = await tx.select({ firstName: students.firstName, lastName: students.lastName })
        .from(userStudentLinks).innerJoin(students, and(
          eq(students.id, userStudentLinks.studentId), eq(students.schoolId, practice.parentId!),
        )).where(and(
          eq(userStudentLinks.schoolId, practice.parentId!),
          eq(userStudentLinks.userId, userId),
          eq(userStudentLinks.accessType, "student"),
          inArray(students.status, ["active", "admitted"]),
        )).limit(1);
      if (sourceStudentLink) {
        const [practiceStudentLink] = await tx.select({ id: userStudentLinks.id }).from(userStudentLinks)
          .where(and(
            eq(userStudentLinks.schoolId, practice.id),
            eq(userStudentLinks.userId, userId),
            eq(userStudentLinks.accessType, "student"),
          )).limit(1);
        if (!practiceStudentLink) {
          const studentPublicId = randomUUID();
          await tx.insert(students).values({
            publicId: studentPublicId,
            schoolId: practice.id,
            branchId: branch.id,
            firstName: sourceStudentLink.firstName,
            lastName: sourceStudentLink.lastName,
            status: "active",
          });
          const [practiceStudent] = await tx.select({ id: students.id }).from(students)
            .where(eq(students.publicId, studentPublicId)).limit(1);
          if (practiceStudent) await tx.insert(userStudentLinks).values({
            schoolId: practice.id, userId, studentId: practiceStudent.id, accessType: "student",
          });
        }
      }
    });
  }
}

export async function getCurrentUserSchoolMemberships() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [account] = await db
    .select({ isActive: user.isActive, mustChangePassword: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!account?.isActive) redirect("/login?reason=account-disabled");
  if (account.mustChangePassword) redirect("/account/first-login-password");

  await syncPracticeAccessForUser(session.user.id);

  const memberships = await db
    .select({
      membershipId: schoolMemberships.id,
      schoolId: schools.id,
      schoolPublicId: schools.publicId,
      schoolName: schools.name,
      isPracticeWorkspace: schools.isPracticeWorkspace,
      practiceParentSchoolId: schools.practiceParentSchoolId,
      schoolLogoUrl: schools.logoUrl,
      schoolEmail: schools.email,
      schoolPhone: schools.phone,
      schoolAddress: schools.address,
      schoolCurrency: schools.currency,
      schoolTimezone: schools.timezone,
    })
    .from(schoolMemberships)
    .innerJoin(schools, eq(schoolMemberships.schoolId, schools.id))
    .where(
      and(
        eq(schoolMemberships.userId, session.user.id),
        eq(schoolMemberships.status, "active"),
        eq(schools.status, schoolWorkspaceStatuses.active),
        isNull(schools.archivedAt),
      ),
    )
    .orderBy(asc(schools.name), asc(schools.id));

  const practiceParentIds = [...new Set(memberships
    .map((membership) => membership.practiceParentSchoolId)
    .filter((schoolId): schoolId is number => schoolId !== null))];
  const availablePracticeParents = practiceParentIds.length
    ? await db.select({ id: schools.id }).from(schools)
        .innerJoin(schoolMemberships, and(
          eq(schoolMemberships.schoolId, schools.id),
          eq(schoolMemberships.userId, session.user.id),
          eq(schoolMemberships.status, "active"),
        ))
        .where(and(
          inArray(schools.id, practiceParentIds),
          eq(schools.status, schoolWorkspaceStatuses.active),
          isNull(schools.archivedAt),
        ))
    : [];
  const availablePracticeParentIds = new Set(availablePracticeParents.map((school) => school.id));
  const availableMemberships = memberships.filter((membership) =>
    !membership.isPracticeWorkspace ||
    (membership.practiceParentSchoolId !== null && availablePracticeParentIds.has(membership.practiceParentSchoolId))
  );

  return { user: session.user, memberships: availableMemberships };
}

export async function requireSchoolMember() {
  const { user: signedInUser, memberships } = await getCurrentUserSchoolMemberships();
  if (!memberships.length) {
    if (isPlatformAdminEmail(signedInUser.email) && isMultiSchoolEnabled()) redirect("/platform/schools");
    redirect("/select-school?reason=no-school-access");
  }

  const cookieStore = await cookies();
  const selectedSchoolPublicId = cookieStore.get(activeSchoolCookieName)?.value;
  const membership = resolveSchoolChoice(
    memberships,
    selectedSchoolPublicId,
    isMultiSchoolEnabled(),
    process.env.DEFAULT_SCHOOL_PUBLIC_ID,
  );
  if (!membership) redirect("/select-school");

  return {
    user: signedInUser,
    schoolId: membership.schoolId,
    schoolPublicId: membership.schoolPublicId,
    schoolName: membership.schoolName,
    schoolLogoUrl: membership.schoolLogoUrl,
    schoolEmail: membership.schoolEmail,
    schoolPhone: membership.schoolPhone,
    schoolAddress: membership.schoolAddress,
    schoolCurrency: membership.schoolCurrency,
    schoolTimezone: membership.schoolTimezone,
    schoolIsPractice: membership.isPracticeWorkspace,
    practiceParentSchoolId: membership.practiceParentSchoolId,
    membershipId: membership.membershipId,
    schoolChoices: memberships.map(({ schoolPublicId, schoolName, isPracticeWorkspace }) => ({
      schoolPublicId,
      schoolName,
      isPracticeWorkspace,
    })),
    multiSchoolEnabled: isMultiSchoolEnabled(),
  };
}

export async function requireSchoolPermission(
  permissionKey: string | readonly string[],
  options: { allowExpiredSubscription?: boolean } = {},
) {
  const requiredPermissions = typeof permissionKey === "string" ? [permissionKey] : permissionKey;
  const context = await requireSchoolMember();
  const granted = await db
    .select({ permissionKey: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userRoles.membershipId, context.membershipId),
        eq(roles.schoolId, context.schoolId),
      ),
    );

  const grantedKeys = granted.map((permission) => permission.permissionKey);
  let accessibleKeys = grantedKeys;
  if (!context.schoolIsPractice) {
    const [subscription] = await db.select({
      status: schoolSubscriptions.status,
      currentPeriodEnd: schoolSubscriptions.currentPeriodEnd,
      trialEndsAt: schoolSubscriptions.trialEndsAt,
      graceUntil: schoolSubscriptions.graceUntil,
      includedModules: subscriptionPlans.includedModules,
    }).from(schoolSubscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, schoolSubscriptions.planId))
      .where(eq(schoolSubscriptions.schoolId, context.schoolId)).limit(1);
    if (subscription) {
      if (!isSubscriptionCurrent(subscription) && !options.allowExpiredSubscription) redirect("/subscription?reason=expired");
      if (!isSubscriptionCurrent(subscription) && options.allowExpiredSubscription) {
        accessibleKeys = grantedKeys.filter((key) => key === "school.settings.manage");
      }
      if (isSubscriptionCurrent(subscription)) {
      const included = new Set(subscription.includedModules);
      accessibleKeys = grantedKeys.filter((key) => {
        const module = getPermissionSubscriptionModule(key);
        return !module || included.has("all") || included.has(module);
      });
      }
    }
  }
  const requestedModuleBlocked = requiredPermissions.some((key) => {
    const module = getPermissionSubscriptionModule(key);
    return module !== null && grantedKeys.includes(key) && !accessibleKeys.includes(key);
  });
  const permissionCandidates = requestedModuleBlocked
    ? requiredPermissions.filter((key) => key !== "school.settings.manage")
    : requiredPermissions;
  if (!permissionCandidates.some((required) => hasPermission(accessibleKeys, required))) {
    if (requestedModuleBlocked) redirect("/subscription?reason=module");
    redirect("/unauthorized");
  }
  const roleNames = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.membershipId, context.membershipId), eq(roles.schoolId, context.schoolId)));

  return {
    ...context,
    grantedPermissions: accessibleKeys,
    roleNames: roleNames.map((role) => role.name),
  };
}
