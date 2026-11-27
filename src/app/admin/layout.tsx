import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminWorkspaceShell } from "./admin-workspace-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!process.env.DATABASE_URL?.trim()) {
    redirect("/login");
  }

  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
