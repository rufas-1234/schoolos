import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { hasPermission } from "@/lib/access-policy";
import { activeSchoolCookieName, isMultiSchoolEnabled, resolveSchoolChoice } from "@/lib/school-context-policy";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";
import { schoolWorkspaceStatuses } from "@/lib/school-lifecycle-policy";
import {
  permissions,
  roles,
  rolePermissions,
  schoolMemberships,
  schools,
  user,
  userRoles,
} from "@/db/schema";

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

export async function requireSchoolPermission(permissionKey: string | readonly string[]) {
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
  if (!requiredPermissions.some((required) => hasPermission(grantedKeys, required))) {
    redirect("/unauthorized");
  }
  const roleNames = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.membershipId, context.membershipId), eq(roles.schoolId, context.schoolId)));

  return {
    ...context,
    grantedPermissions: granted.map((permission) => permission.permissionKey),
    roleNames: roleNames.map((role) => role.name),
  };
}
