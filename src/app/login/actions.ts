"use server";

import { requireSchoolPermission } from "@/lib/access-control";
import { getWorkspaceHomePath } from "@/lib/workspace-home-policy";

export async function getSignedInWorkspacePath(): Promise<string> {
  const context = await requireSchoolPermission([
    "dashboard.view",
    "school.settings.manage",
    "roles.manage",
    "examinations.create",
    "results.enter",
    "results.publish",
    "staff.manage",
    "fees.manage",
    "payments.record",
    "students.view",
  ]);
  return getWorkspaceHomePath(context.grantedPermissions);
}
