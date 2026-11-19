import { and, asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { hasPermission } from "@/lib/access-policy";
import { activeSchoolCookieName, isMultiSchoolEnabled, resolveSchoolChoice } from "@/lib/school-context-policy";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";
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
    .select({ isActive: user.isActive })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!account?.isActive) redirect("/login?reason=account-disabled");

  const memberships = await db
    .select({
      membershipId: schoolMemberships.id,
      schoolId: schools.id,
      schoolPublicId: schools.publicId,
      schoolName: schools.name,
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
      ),
    )
    .orderBy(asc(schools.name), asc(schools.id));

  return { user: session.user, memberships };
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
    membershipId: membership.membershipId,
    schoolChoices: memberships.map(({ schoolPublicId, schoolName }) => ({ schoolPublicId, schoolName })),
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
