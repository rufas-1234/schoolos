"use client";

import { CalendarDays, ClipboardCheck, ClipboardList, LayoutDashboard, UsersRound } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

export function TeacherPortalShell({
  children,
  schoolName,
  schoolLogoUrl,
  teacherName,
}: {
  children: React.ReactNode;
  schoolName: string;
  schoolLogoUrl: string | null;
  teacherName: string;
}) {
  return (
    <PortalShell
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      userName={teacherName}
      portalLabel="Teacher Portal"
      navigation={[
        { href: "/portal/teacher", label: "Overview", icon: LayoutDashboard },
        { href: "#classes", label: "My classes", icon: UsersRound },
        { href: "#register", label: "Class register & attendance", icon: ClipboardList },
        { href: "#assessments", label: "Examination work", icon: ClipboardCheck },
        { href: "#timetable", label: "My timetable", icon: CalendarDays },
      ]}
    >
      {children}
    </PortalShell>
  );
}
