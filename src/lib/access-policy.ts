export type SchoolMembership = {
  membershipId: number;
  schoolId: number;
  schoolName: string;
  schoolEmail: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
};

export function requireSingleSchoolMembership<T extends SchoolMembership>(memberships: T[]): T {
  if (memberships.length !== 1) {
    throw new Error(
      memberships.length === 0
        ? "This account has no active school membership."
        : "Select an authorized school before continuing.",
    );
  }

  return memberships[0];
}

export function hasPermission(grantedPermissions: readonly string[], requestedPermission: string) {
  return grantedPermissions.includes(requestedPermission);
}
