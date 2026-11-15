import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staffSettings } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  defaultRequiredStaffFields,
  normalizeRequiredStaffFields,
} from "@/lib/staff-settings";
import { StaffSettingsForm } from "./staff-settings-form";

export default async function HumanResourcesSettingsPage() {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [settings] = await db.select({ requiredFields: staffSettings.requiredFields })
    .from(staffSettings).where(eq(staffSettings.schoolId, context.schoolId)).limit(1);
  return (
    <StaffSettingsForm
      requiredFields={normalizeRequiredStaffFields(settings?.requiredFields ?? defaultRequiredStaffFields)}
    />
  );
}
