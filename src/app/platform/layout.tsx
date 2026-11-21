import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { PlatformShell } from "./platform-shell";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformAdmin();

  return (
    <PlatformShell userName={user.name} userEmail={user.email}>
      {children}
    </PlatformShell>
  );
}
