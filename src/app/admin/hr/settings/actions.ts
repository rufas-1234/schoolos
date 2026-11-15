"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, staffSettings } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  normalizeRequiredStaffFields,
  staffSettingFields,
} from "@/lib/staff-settings";

export type StaffSettingsActionState = { error?: string; success?: string };

export async function saveStaffSettings(
  _previousState: StaffSettingsActionState,
  formData: FormData,
): Promise<StaffSettingsActionState> {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const submittedFields = formData.getAll("requiredFields")
    .filter((value): value is string => typeof value === "string");
  if (submittedFields.some((name) => !staffSettingFields.some((field) => field.name === name))) {
    return { error: "One or more selected staff fields are invalid." };
  }
  const requiredFields = normalizeRequiredStaffFields(submittedFields);

  await db.transaction(async (tx) => {
    await tx.insert(staffSettings).values({
      schoolId: context.schoolId,
      requiredFields,
    }).onDuplicateKeyUpdate({ set: { requiredFields } });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "staff.settings.updated",
      resourceType: "staff_settings",
      resourcePublicId: context.schoolPublicId,
      changedFields: ["requiredFields"],
    });
  });

  revalidatePath("/admin/hr/settings");
  revalidatePath("/admin/staff");
  return { success: "Human resources settings saved." };
}
