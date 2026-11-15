export function getWorkspaceHomePath(permissions: readonly string[]): string {
  const granted = new Set(permissions);
  if (granted.has("dashboard.view")) return "/admin/dashboard";
  if (granted.has("roles.manage")) return "/admin/settings/roles";
  if (granted.has("school.settings.manage")) return "/admin/settings";
  if (granted.has("examinations.create") || granted.has("results.publish")) {
    return "/admin/examinations";
  }
  if (granted.has("results.enter")) return "/portal/teacher";
  if (granted.has("staff.manage")) return "/admin/hr";
  if (granted.has("fees.manage") || granted.has("payments.record")) {
    return "/admin/fees/collection";
  }
  if (granted.has("students.view")) return "/admin/students";
  return "/unauthorized";
}
