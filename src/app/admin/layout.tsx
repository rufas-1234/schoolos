import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireSchoolPermission } from "@/lib/access-control";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!process.env.DATABASE_URL?.trim()) {
    redirect("/login");
  }

  const context = await requireSchoolPermission([
    "dashboard.view",
    "staff.manage",
    "roles.manage",
    "fees.manage",
    "payments.record",
    "examinations.create",
    "results.enter",
    "results.publish",
  ]);
  return (
    <AdminShell
      schoolName={context.schoolName}
      schoolEmail={context.schoolEmail}
      schoolPhone={context.schoolPhone}
      schoolAddress={context.schoolAddress}
      userName={context.user.name}
      roleNames={context.roleNames}
      permissions={context.grantedPermissions}
    >
      {children}
    </AdminShell>
  );
}
