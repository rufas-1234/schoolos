"use client";

import { CalendarDays, ClipboardCheck, ClipboardList, LayoutDashboard, UsersRound } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const teacherNavigation = [
  { href: "/portal/teacher", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/teacher?section=classes", label: "My classes", icon: UsersRound },
  { href: "/portal/teacher?section=register", label: "Class register & attendance", icon: ClipboardList },
  { href: "/portal/teacher?section=assessments", label: "Examination work", icon: ClipboardCheck },
  { href: "/portal/teacher?section=timetable", label: "My timetable", icon: CalendarDays },
];

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
      navigation={teacherNavigation}
    >
      {children}
    </PortalShell>
  );
}
