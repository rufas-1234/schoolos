import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireSchoolPermission } from "@/lib/access-control";
import { isPlatformAdminEmail } from "@/lib/platform-admin-policy";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staffMembers } from "@/db/schema";

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
    "accounts.manage",
    "inventory.manage",
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
  const [academicYearSelection, [linkedStaffRecord]] = await Promise.all([
    getSchoolAcademicYearSelection(context.schoolId),
    db.select({ id: staffMembers.id }).from(staffMembers).where(and(
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.linkedUserId, context.user.id),
      eq(staffMembers.status, "active"),
    )).limit(1),
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
      workspaceIsPractice={context.schoolIsPractice}
      isPlatformAdmin={isPlatformAdminEmail(context.user.email)}
      linkedStaffMember={Boolean(linkedStaffRecord)}
      academicYears={academicYearSelection.years.map(({ id, name }) => ({ id, name }))}
      selectedAcademicYearId={academicYearSelection.selectedYear?.id ?? null}
    >
      {children}
    </AdminShell>
  );
}
