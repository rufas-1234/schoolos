import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireSchoolPermission } from "@/lib/access-control";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!process.env.DATABASE_URL?.trim()) {
    redirect("/login");
  }

  const context = await requireSchoolPermission([
    "dashboard.view",
    "school.settings.manage",
    "academics.manage",
    "academics.delete",
    "staff.manage",
    "roles.manage",
    "fees.manage",
    "payments.record",
    "library.manage",
    "dormitories.manage",
    "examinations.create",
    "examinations.delete",
    "results.enter",
    "results.publish",
    "students.view",
    "students.create",
    "students.update",
  ]);
  return (
    <AdminShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      schoolEmail={context.schoolEmail}
      schoolPhone={context.schoolPhone}
      schoolAddress={context.schoolAddress}
      userName={context.user.name}
      roleNames={context.roleNames}
      permissions={context.grantedPermissions}
      activeSchoolPublicId={context.schoolPublicId}
      schoolChoices={context.schoolChoices}
      multiSchoolEnabled={context.multiSchoolEnabled}
      isPlatformAdmin={isPlatformAdminEmail(context.user.email)}
    >
      {children}
    </AdminShell>
  );
}
