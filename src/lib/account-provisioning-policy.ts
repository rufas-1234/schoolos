export function getStudentRoleId(roles: { id: number; name: string }[]): number | null {
  return roles.find((role) => role.name.trim().toLowerCase() === "student")?.id ?? null;
}
