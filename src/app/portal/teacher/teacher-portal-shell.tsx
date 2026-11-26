"use client";

import { CalendarDays, ClipboardCheck, ClipboardList, LayoutDashboard, UsersRound } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const teacherNavigation = [
  { href: "/portal/teacher", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/teacher?section=classes", label: "My classes", icon: UsersRound },
  { href: "/portal/teacher?section=register", label: "Class register & attendance", icon: ClipboardList },
  { href: "/portal/teacher?section=assessments", label: "Examination work", icon: ClipboardCheck },
  { href: "/portal/teacher?section=timetable", label: "My timetable", icon: CalendarDays },
  { href: "/portal/staff/leave", label: "My leave", icon: CalendarDays },
];

export function TeacherPortalShell({
  children,
  schoolName,
  schoolLogoUrl,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  teacherName,
  schoolChoices,
  currentSchoolPublicId,
}: {
  children: React.ReactNode;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  teacherName: string;
  schoolChoices: { schoolPublicId: string; schoolName: string; isPracticeWorkspace: boolean }[];
  currentSchoolPublicId: string;
}) {
  return (
    <PortalShell
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      schoolAddress={schoolAddress}
      schoolPhone={schoolPhone}
      schoolEmail={schoolEmail}
      userName={teacherName}
      portalLabel="Teacher Portal"
      navigation={teacherNavigation}
      searchScope="teaching"
      schoolChoices={schoolChoices}
      currentSchoolPublicId={currentSchoolPublicId}
    >
      {children}
    </PortalShell>
  );
}
