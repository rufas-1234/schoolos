"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, staffSettings } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  normalizeVisibleStaffFields,
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
  const submittedVisibleFields = formData.getAll("visibleFields")
    .filter((value): value is string => typeof value === "string");
  if (
    [...submittedFields, ...submittedVisibleFields]
      .some((name) => !staffSettingFields.some((field) => field.name === name))
  ) {
    return { error: "One or more selected staff fields are invalid." };
  }
  const visibleFields = normalizeVisibleStaffFields(submittedVisibleFields);
  if (submittedFields.some((name) => !visibleFields.includes(name))) {
    return { error: "A hidden staff field cannot be required. Show the field or clear its required setting." };
  }
  const requiredFields = normalizeRequiredStaffFields(submittedFields);

  await db.transaction(async (tx) => {
    await tx.insert(staffSettings).values({
      schoolId: context.schoolId,
      requiredFields,
      visibleFields,
    }).onDuplicateKeyUpdate({ set: { requiredFields, visibleFields } });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "staff.settings.updated",
      resourceType: "staff_settings",
      resourcePublicId: context.schoolPublicId,
      changedFields: ["requiredFields", "visibleFields"],
    });
  });

  revalidatePath("/admin/hr/settings");
  revalidatePath("/admin/staff");
  return { success: "Human resources settings saved." };
}
