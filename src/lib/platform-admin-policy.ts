export function isPlatformAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const allowedEmails = new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowedEmails.has(email.trim().toLowerCase());
}

export function isSystemSuperAdmin(
  email: string | null | undefined,
  roleNames: readonly string[],
) {
  if (isPlatformAdminEmail(email)) return true;
  return roleNames.some((roleName) => {
    const normalizedRoleName = roleName.toLowerCase().replace(/[^a-z]/g, "");
    return [
      "superadmin",
      "superadministrator",
      "systemadmin",
      "systemadministrator",
      "systemsuperadmin",
      "systemsuperadministrator",
      "platformadmin",
      "platformadministrator",
    ].includes(normalizedRoleName);
  });
}
