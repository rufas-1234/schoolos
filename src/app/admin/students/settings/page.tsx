import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studentSettings } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { normalizeStudentFieldSettings } from "@/lib/student-settings";
import { StudentSettingsForm } from "./student-settings-form";

export default async function StudentSettingsPage() {
  const context = await requireSchoolPermission(["school.settings.manage", "students.update"]);
  const [settings] = await db.select().from(studentSettings)
    .where(eq(studentSettings.schoolId, context.schoolId)).limit(1);
  return (
    <StudentSettingsForm
      admissionFormat={settings?.admissionFormat ?? "S{YY}{SEQ:4}"}
      rollFormat={settings?.rollFormat ?? "{SEQ:3}"}
      fields={normalizeStudentFieldSettings(settings?.fields)}
    />
  );
}
