export function getWorkspaceHomePath(
  permissions: readonly string[],
  linkedPortals: { student?: boolean; parent?: boolean; staff?: boolean; teacher?: boolean } = {},
): string {
  const granted = new Set(permissions);
  if (linkedPortals.teacher && granted.has("results.enter")) return "/portal/teacher";
  if (granted.has("dashboard.view")) return "/admin/dashboard";
  if (granted.has("roles.manage")) return "/admin/users";
  if (granted.has("school.settings.manage")) return "/admin/settings";
  if (granted.has("results.enter")) return "/portal/teacher";
  if (granted.has("examinations.create") || granted.has("results.publish")) {
    return "/admin/examinations";
  }
  if (granted.has("staff.manage")) return "/admin/hr";
  if (granted.has("accounts.manage") || granted.has("fees.manage") || granted.has("payments.record")) {
    return "/portal/finance";
  }
  if (granted.has("dormitories.manage")) return "/portal/dormitories";
  if (granted.has("library.manage")) return "/portal/library";
  if (linkedPortals.student) return "/portal/student";
  if (linkedPortals.parent) return "/portal/parent";
  if (granted.has("students.view")) return "/admin/students";
  if (linkedPortals.staff) return "/account/security";
  return "/unauthorized";
}
