"use client";

import { BookOpenCheck, CalendarDays, ClipboardList, LayoutDashboard, UsersRound } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const teacherNavigation = [
  { href: "/portal/teacher?section=overview", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/teacher?section=classes", label: "My classes", icon: UsersRound },
  { href: "/portal/teacher?section=register", label: "Class register", icon: ClipboardList },
  { href: "/portal/teacher?section=assessments", label: "Exam work", icon: BookOpenCheck },
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
      searchScope="teaching"
    >
      {children}
    </PortalShell>
  );
}
